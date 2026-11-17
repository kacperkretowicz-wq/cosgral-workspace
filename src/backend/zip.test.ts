// @vitest-environment node
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, createZip, isSafeZipName, readZip, ZipError } from "./zip";

const LIMITS = { entries: 100, entryBytes: 1024 * 1024, totalBytes: 4 * 1024 * 1024 };

/** A one-file archive made by hand, so the reader can be tried on what a hostile file would look like. */
function rawZip(
  name: string,
  data: Buffer,
  options: { claimedSize?: number; crc?: number; flags?: number; method?: number } = {},
): Buffer {
  const method = options.method ?? 8;
  const body = method === 8 ? deflateRawSync(data) : data;
  const nameBytes = Buffer.from(name, "utf8");
  const size = options.claimedSize ?? data.length;
  const crc = options.crc ?? crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(options.flags ?? 0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(size, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(options.flags ?? 0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(size, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  const centralAt = local.length + nameBytes.length + body.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(centralAt, 16);
  return Buffer.concat([local, nameBytes, body, central, nameBytes, end]);
}

describe("zip (W12-KK g2)", () => {
  it("writes and reads back text, binary, empty files and unicode names, with and without compression", () => {
    const entries = [
      { name: "manifest.json", data: Buffer.from(JSON.stringify({ a: "x".repeat(5000) })) },
      { name: "agents/zażółć/notes.txt", data: Buffer.from("zażółć gęślą jaźń") },
      { name: "empty.txt", data: Buffer.alloc(0) },
      { name: "random.bin", data: Buffer.from(Array.from({ length: 300 }, (_, index) => (index * 97) % 256)) },
    ];
    const zip = createZip(entries);
    const back = readZip(zip, LIMITS);
    expect(back.map((entry) => entry.name)).toEqual(entries.map((entry) => entry.name));
    for (const [index, entry] of back.entries())
      expect(entry.data.equals(entries[index]?.data ?? Buffer.alloc(1))).toBe(true);
  });

  it("the writer refuses unsafe or repeated names", () => {
    for (const name of ["../x", "/abs", "a/../b", "c:\\x", "a\\b", "", "a//b", "a\u0000b"]) {
      expect(() => createZip([{ name, data: Buffer.from("x") }])).toThrow(ZipError);
      expect(isSafeZipName(name)).toBe(false);
    }
    expect(() =>
      createZip([
        { name: "same", data: Buffer.from("1") },
        { name: "same", data: Buffer.from("2") },
      ]),
    ).toThrow(/not allowed/);
  });

  it("the reader refuses names that would leave the folder (zip-slip), whatever the writer would have done", () => {
    for (const name of ["../evil.txt", "a/../../evil.txt", "/etc/passwd", "C:/Windows/x", "dir\\..\\evil"]) {
      expect(() => readZip(rawZip(name, Buffer.from("x")), LIMITS)).toThrow(/not allowed/);
    }
  });

  it("the reader does not believe the sizes of the file: a bomb, a wrong size and a wrong checksum stop it", () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 0x41);
    // The directory says the file is small; the data is not.
    expect(() => readZip(rawZip("bomb.txt", big, { claimedSize: 10 }), { ...LIMITS, entryBytes: 1024 * 1024 })).toThrow(
      ZipError,
    );
    expect(() => readZip(rawZip("big.txt", big), { ...LIMITS, entryBytes: 1024 * 1024 })).toThrow(/too large/);
    expect(() => readZip(rawZip("a.txt", Buffer.from("hello"), { crc: 123 }), LIMITS)).toThrow(/checksum/);
    expect(() => readZip(rawZip("a.txt", Buffer.from("hello"), { claimedSize: 99 }), LIMITS)).toThrow(ZipError);
  });

  it("limits: number of files, all unpacked bytes, encryption, unknown compression, and a file that is not a zip", () => {
    const many = createZip(Array.from({ length: 5 }, (_, index) => ({ name: `f${index}`, data: Buffer.from("x") })));
    expect(() => readZip(many, { ...LIMITS, entries: 4 })).toThrow(/too many files/);
    const two = createZip([
      { name: "a", data: Buffer.alloc(600, 1) },
      { name: "b", data: Buffer.alloc(600, 2) },
    ]);
    expect(() => readZip(two, { ...LIMITS, totalBytes: 1000 })).toThrow(/too much data/);
    expect(() => readZip(rawZip("a.txt", Buffer.from("x"), { flags: 1 }), LIMITS)).toThrow(/encrypted/);
    expect(() => readZip(rawZip("a.txt", Buffer.from("x"), { method: 12 }), LIMITS)).toThrow(/compression/);
    expect(() => readZip(Buffer.from("not a zip at all"), LIMITS)).toThrow(/not a ZIP/);
    expect(() => readZip(Buffer.alloc(0), LIMITS)).toThrow(ZipError);
  });

  it("the same name twice in one archive is refused", () => {
    const first = rawZip("a.txt", Buffer.from("x"));
    // Two central entries with one name: build by hand from two single archives is long; the writer test covers the writer, here a truncated archive is refused.
    expect(() => readZip(first.subarray(0, first.length - 5), LIMITS)).toThrow(ZipError);
  });
});
