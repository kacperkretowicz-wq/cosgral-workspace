// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { zip } from "./testing/zip-writer";
import { crc32, extractZip } from "./voice-zip";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function folder() {
  const dir = await mkdtemp(join(tmpdir(), "voice-zip-"));
  roots.push(dir);
  return dir;
}

const allow = (name: string) => /\.(exe|dll)$/i.test(name) || /(^|\/)LICENSE[^/]*$/i.test(name);

describe("voice zip extraction", () => {
  it("computes the standard CRC-32", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("extracts allowed files (deflated and stored) and skips the rest", async () => {
    const target = await folder();
    const files = await extractZip(
      zip([
        { name: "Release/", content: "", directory: true },
        { name: "Release/whisper-cli.exe", content: "MZ program" },
        { name: "Release/whisper.dll", content: Buffer.alloc(5_000, 7), store: true },
        { name: "Release/readme.md", content: "skip me" },
        { name: "LICENSE", content: "MIT" },
      ]),
      target,
      { allow },
    );
    expect(files.sort()).toEqual(["LICENSE", "Release/whisper-cli.exe", "Release/whisper.dll"]);
    expect(await readFile(join(target, "Release", "whisper-cli.exe"), "utf8")).toBe("MZ program");
    expect((await readFile(join(target, "Release", "whisper.dll"))).length).toBe(5_000);
    expect(existsSync(join(target, "Release", "readme.md"))).toBe(false);
  });

  it("refuses paths that leave the folder, absolute paths and drive letters", async () => {
    const target = await folder();
    for (const name of ["../evil.dll", "Release/../../evil.dll", "/evil.dll", "C:/evil.dll", "Release\\..\\evil.dll"]) {
      await expect(extractZip(zip([{ name, content: "x" }]), target, { allow })).rejects.toThrow("unsafe path");
    }
    expect(existsSync(join(target, "..", "evil.dll"))).toBe(false);
  });

  it("refuses a damaged file, too many bytes and too many files", async () => {
    const target = await folder();
    await expect(extractZip(zip([{ name: "a.dll", content: "abc", badCrc: true }]), target, { allow })).rejects.toThrow(
      "damaged",
    );
    await expect(
      extractZip(zip([{ name: "a.dll", content: Buffer.alloc(2_000) }]), target, { allow, maxTotalBytes: 1_000 }),
    ).rejects.toThrow("too large");
    await expect(
      extractZip(
        zip([
          { name: "a.dll", content: "1" },
          { name: "b.dll", content: "2" },
        ]),
        target,
        { allow, maxFiles: 1 },
      ),
    ).rejects.toThrow("too many files");
    await expect(extractZip(Buffer.from("not a zip"), target, { allow })).rejects.toThrow("not a zip");
  });
});
