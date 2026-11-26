// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { installNgrok, NgrokInstallError, ngrokArchiveName, readZipEntry } from "./ngrok-installer";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A small .zip with the given files, compressed like a real one. */
function makeZip(files: Record<string, Buffer>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const packed = deflateRawSync(content);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, end]);
}

const PROGRAM = Buffer.alloc(4096, "ngrok program ");

describe("readZipEntry", () => {
  it("reads one file out of a zip and returns null for a file that is not there or a broken zip", () => {
    const zip = makeZip({ "readme.txt": Buffer.from("hello"), "ngrok.exe": PROGRAM });
    expect(readZipEntry(zip, "ngrok.exe")).toEqual(PROGRAM);
    expect(readZipEntry(zip, "other.exe")).toBeNull();
    expect(readZipEntry(Buffer.from("not a zip at all"), "ngrok.exe")).toBeNull();
  });
});

describe("installNgrok", () => {
  it("downloads the zip from the official address and keeps the program", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cosgral-ngrok-"));
    roots.push(directory);
    const requested: string[] = [];
    const messages: string[] = [];
    const path = await installNgrok({
      directory,
      platform: "win32",
      arch: "x64",
      fetchFile: async (input) => {
        requested.push(String(input));
        return new Response(new Uint8Array(makeZip({ "ngrok.exe": PROGRAM })));
      },
      onProgress: (message) => messages.push(message),
    });
    expect(requested).toEqual(["https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip"]);
    expect(path).toBe(join(directory, "ngrok.exe"));
    expect(await readFile(path)).toEqual(PROGRAM);
    expect(messages[0]).toContain("Pobieram");
  });

  it("explains itself when there is no internet, the zip is wrong or there is no file for this computer", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cosgral-ngrok-"));
    roots.push(directory);
    await expect(
      installNgrok({
        directory,
        platform: "win32",
        arch: "x64",
        fetchFile: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow(NgrokInstallError);
    await expect(
      installNgrok({
        directory,
        platform: "win32",
        arch: "x64",
        fetchFile: async () => new Response(new Uint8Array(makeZip({ "other.txt": Buffer.from("x") }))),
      }),
    ).rejects.toThrow(/nie ma programu/u);
    await expect(installNgrok({ directory, platform: "darwin", arch: "arm64" })).rejects.toThrow(
      /ngrok.com\/download/u,
    );
    expect(ngrokArchiveName("linux", "x64")).toBeNull();
  });
});
