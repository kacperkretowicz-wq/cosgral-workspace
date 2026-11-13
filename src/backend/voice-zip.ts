// COSGRAL W3: a small, strict zip reader for the whisper.cpp package. It reads the central directory, refuses any
// path that could leave the target folder, checks sizes and CRC-32, and writes only the files the caller allows.
// No external tool (PowerShell, tar) is used, so nothing outside this code decides where files land.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";

export interface ExtractZipOptions {
  /** Relative entry paths ("/" separators) to write; others are skipped. */
  allow: (path: string) => boolean;
  /** All written files together (default 64 MB). */
  maxTotalBytes?: number;
  /** Written files (default 200). */
  maxFiles?: number;
}

const END_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const SAFE_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

let crcTable: Uint32Array | null = null;

/** CRC-32 (IEEE), as stored in zip files. */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Writes the allowed entries of `archive` under `target`; returns their relative paths. */
export async function extractZip(archive: Buffer, target: string, options: ExtractZipOptions): Promise<string[]> {
  const maxTotal = options.maxTotalBytes ?? 64 * 1024 * 1024;
  const maxFiles = options.maxFiles ?? 200;
  const end = findEnd(archive);
  const count = archive.readUInt16LE(end + 10);
  const directorySize = archive.readUInt32LE(end + 12);
  let offset = archive.readUInt32LE(end + 16);
  if (count === 0xffff || offset === 0xffffffff || offset + directorySize > end) {
    throw new Error("The package is not a zip file this program can read.");
  }
  const root = resolve(target);
  const planned: Array<{ path: string; data: Buffer }> = [];
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(offset) !== CENTRAL_SIGNATURE)
      throw new Error("The package is not a zip file (bad directory).");
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const crc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const size = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const rawName = archive.subarray(offset + 46, offset + 46 + nameLength);
    const name = rawName.toString(flags & 0x0800 ? "utf8" : "latin1");
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) {
      checkPath(name.slice(0, -1), root);
      continue;
    }
    const path = checkPath(name, root);
    if (!options.allow(path)) continue;
    if (flags & 0x0001) throw new Error("The package has encrypted files.");
    if (size === 0xffffffff || compressedSize === 0xffffffff) throw new Error("The package is too large (zip64).");
    total += size;
    if (total > maxTotal) throw new Error("The package is too large.");
    if (planned.length + 1 > maxFiles) throw new Error("The package has too many files.");
    if (archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE)
      throw new Error("The package is not a zip file (bad entry).");
    const dataStart =
      localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28);
    const compressed = archive.subarray(dataStart, dataStart + compressedSize);
    if (compressed.length !== compressedSize) throw new Error("The package is damaged (cut short).");
    let data: Buffer;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) });
    else throw new Error(`The package uses an unsupported compression (${method}).`);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`The package is damaged (${path}).`);
    planned.push({ path, data });
  }
  for (const file of planned) {
    const destination = join(root, ...file.path.split("/"));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.data);
  }
  return planned.map((file) => file.path);
}

function findEnd(archive: Buffer): number {
  const lowest = Math.max(0, archive.length - 22 - 0xffff);
  for (let index = archive.length - 22; index >= lowest; index -= 1) {
    if (archive.readUInt32LE(index) === END_SIGNATURE) return index;
  }
  throw new Error("The package is not a zip file.");
}

/** A relative path with "/" and plain names only, which stays inside `root`. */
function checkPath(name: string, root: string): string {
  const parts = name.split("/");
  if (
    !SAFE_PATH.test(name) ||
    parts.some((part) => part === "." || part === "..") ||
    parts.length > 6 ||
    name.length > 200
  ) {
    throw new Error(`The package has an unsafe path: ${name.slice(0, 80)}`);
  }
  const between = relative(root, resolve(root, ...parts));
  if (!between || between.startsWith(`..${sep}`) || between === "..") {
    throw new Error(`The package has an unsafe path: ${name.slice(0, 80)}`);
  }
  return name;
}
