// COSGRAL W12-KK (g2): a small ZIP writer and reader (stored and deflate only; no ZIP64, no encryption, no multi-disk) for the transfer
// files. Our own code on node:zlib. THE READER IS FOR UNTRUSTED FILES: it takes sizes from the central directory but never trusts
// them (every entry is inflated with an output limit and its size and CRC-32 are checked), refuses names that could leave the
// folder they would be unpacked into ("..", absolute paths, drive letters, backslashes, empty or control characters), refuses duplicate
// names, and stops at a limit of entries, of one entry and of all unpacked bytes. It never writes anything to disk.

import { deflateRawSync, inflateRawSync } from "node:zlib";

export interface ZipEntry {
  /** Path with "/" separators, no leading slash. */
  name: string;
  data: Buffer;
}

export interface ZipLimits {
  entries: number;
  entryBytes: number;
  totalBytes: number;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipError";
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A name the program writes and accepts: relative, "/" only, no ".." and no control characters. */
export function isSafeZipName(name: string): boolean {
  if (name.length === 0 || name.length > 400) return false;
  if (name.startsWith("/") || name.includes("\\") || /^[A-Za-z]:/.test(name)) return false;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are exactly what is refused
  if (/[\u0000-\u001f\u007f]/.test(name)) return false;
  return name.split("/").every((part) => part !== ".." && part !== "." && part.length > 0);
}

/** DOS date and time of a fixed moment (the files carry no real time: nothing in them depends on it). */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 17;

export function createZip(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!isSafeZipName(entry.name) || seen.has(entry.name))
      throw new ZipError("A file name for the archive is not allowed.");
    seen.add(entry.name);
    const name = Buffer.from(entry.name, "utf8");
    const raw = entry.data;
    const packed = deflateRawSync(raw);
    const useDeflate = packed.length < raw.length;
    const body = useDeflate ? packed : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

/** Reads every entry (directories are skipped). Throws `ZipError` with a plain sentence for anything that is not safe or valid. */
export function readZip(buffer: Buffer, limits: ZipLimits): ZipEntry[] {
  const endAt = findEnd(buffer);
  const count = buffer.readUInt16LE(endAt + 10);
  const centralSize = buffer.readUInt32LE(endAt + 12);
  let cursor = buffer.readUInt32LE(endAt + 16);
  if (buffer.readUInt16LE(endAt + 4) !== 0 || buffer.readUInt16LE(endAt + 6) !== 0)
    throw new ZipError("A file in several parts is not supported.");
  if (count === 0xffff || buffer.readUInt32LE(endAt + 16) === 0xffffffff)
    throw new ZipError("This archive is too large or uses a format that is not supported.");
  if (count > limits.entries) throw new ZipError("The archive holds too many files.");
  if (cursor + centralSize > endAt) throw new ZipError("The archive is damaged.");
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50)
      throw new ZipError("The archive is damaged.");
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const packedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localAt = buffer.readUInt32LE(cursor + 42);
    const nameEnd = cursor + 46 + nameLength;
    if (nameEnd > buffer.length) throw new ZipError("The archive is damaged.");
    const name = buffer.subarray(cursor + 46, nameEnd).toString("utf8");
    cursor = nameEnd + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (flags & 1) throw new ZipError("An encrypted archive is not supported.");
    if (!isSafeZipName(name)) throw new ZipError("The archive holds a file name that is not allowed.");
    if (seen.has(name)) throw new ZipError("The archive holds the same file name twice.");
    seen.add(name);
    if (size > limits.entryBytes) throw new ZipError("A file in the archive is too large.");
    if (method !== 0 && method !== 8) throw new ZipError("The archive uses a compression that is not supported.");
    if (localAt + 30 > buffer.length || buffer.readUInt32LE(localAt) !== 0x04034b50)
      throw new ZipError("The archive is damaged.");
    const dataAt = localAt + 30 + buffer.readUInt16LE(localAt + 26) + buffer.readUInt16LE(localAt + 28);
    if (dataAt + packedSize > buffer.length) throw new ZipError("The archive is damaged.");
    const packed = buffer.subarray(dataAt, dataAt + packedSize);
    let data: Buffer;
    try {
      // The output limit is ours, not the file's claim: a zip bomb stops here.
      data = method === 8 ? inflateRawSync(packed, { maxOutputLength: limits.entryBytes }) : Buffer.from(packed);
    } catch {
      throw new ZipError("A file in the archive could not be unpacked.");
    }
    if (data.length !== size || crc32(data) !== crc)
      throw new ZipError("A file in the archive does not match its checksum.");
    total += data.length;
    if (total > limits.totalBytes) throw new ZipError("The archive unpacks to too much data.");
    entries.push({ name, data });
  }
  return entries;
}

function findEnd(buffer: Buffer): number {
  const floor = Math.max(0, buffer.length - 22 - 0xffff);
  for (let at = buffer.length - 22; at >= floor; at -= 1) {
    if (buffer.readUInt32LE(at) === 0x06054b50) return at;
  }
  throw new ZipError("That file is not a ZIP archive.");
}
