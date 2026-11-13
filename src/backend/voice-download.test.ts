// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { VOICE_CATALOG } from "./voice-catalog";
import { checkDownloadUrl, type DownloadSource, downloadVerified } from "./voice-download";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function folder() {
  const dir = await mkdtemp(join(tmpdir(), "voice-download-"));
  roots.push(dir);
  return dir;
}

function source(chunks: Buffer[], totalBytes: number | null = null): DownloadSource & { urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    open: async (url, signal) => {
      urls.push(url);
      return {
        totalBytes,
        body: (async function* () {
          for (const chunk of chunks) {
            if (signal.aborted) throw new Error("aborted");
            await new Promise((resolve) => setTimeout(resolve, 1));
            yield chunk;
          }
        })(),
      };
    },
  };
}

const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const URL_OK = "https://huggingface.co/ggerganov/whisper.cpp/resolve/abc/ggml-base-q5_1.bin";

describe("voice download sources", () => {
  it("pins every download to HTTPS, an allowed host, a size and a SHA-256", () => {
    const assets = [VOICE_CATALOG.runtime, ...VOICE_CATALOG.models];
    for (const asset of assets) {
      expect(() => checkDownloadUrl(asset.url)).not.toThrow();
      expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.sizeBytes).toBeGreaterThan(1_000_000);
    }
    expect(VOICE_CATALOG.models.map((model) => model.id)).toEqual(["tiny", "base", "small"]);
    expect(VOICE_CATALOG.models.filter((model) => model.recommended).map((model) => model.id)).toEqual(["base"]);
  });

  it("allows only HTTPS to the listed hosts, without credentials or other ports", () => {
    expect(checkDownloadUrl("https://us.aws.cdn.hf.co/xet/abc").hostname).toBe("us.aws.cdn.hf.co");
    expect(checkDownloadUrl("https://release-assets.githubusercontent.com/x").hostname).toBe(
      "release-assets.githubusercontent.com",
    );
    for (const url of [
      "http://huggingface.co/x",
      "https://example.com/x",
      "https://huggingface.co.evil.test/x",
      "https://evilhf.co/x",
      "https://user:pass@huggingface.co/x",
      "https://huggingface.co:8443/x",
      "file:///C:/Windows/notepad.exe",
      "not a url",
    ]) {
      expect(() => checkDownloadUrl(url), url).toThrow();
    }
  });
});

describe("verified download", () => {
  it("writes the file only after the size and SHA-256 match, with progress", async () => {
    const dir = await folder();
    const data = Buffer.alloc(10_000, 3);
    const progress: number[] = [];
    await downloadVerified({
      source: source([data.subarray(0, 4_000), data.subarray(4_000)], data.length),
      url: URL_OK,
      sha256: sha(data),
      sizeBytes: data.length,
      destination: join(dir, "model.bin"),
      signal: new AbortController().signal,
      onProgress: (received) => progress.push(received),
    });
    expect((await readFile(join(dir, "model.bin"))).equals(data)).toBe(true);
    expect(progress.at(-1)).toBe(10_000);
    expect(existsSync(join(dir, "model.bin.part"))).toBe(false);
  });

  it("keeps nothing when the SHA-256, the size or the declared length is wrong", async () => {
    const dir = await folder();
    const data = Buffer.alloc(1_000, 1);
    const run = (input: { chunks: Buffer[]; total?: number | null; sha?: string; size?: number }) =>
      downloadVerified({
        source: source(input.chunks, input.total ?? null),
        url: URL_OK,
        sha256: input.sha ?? sha(data),
        sizeBytes: input.size ?? data.length,
        destination: join(dir, "model.bin"),
        signal: new AbortController().signal,
      });
    await expect(run({ chunks: [data], sha: "0".repeat(64) })).rejects.toThrow("SHA-256");
    await expect(run({ chunks: [data, data] })).rejects.toThrow("larger than expected");
    await expect(run({ chunks: [data.subarray(0, 10)] })).rejects.toThrow("smaller than expected");
    await expect(run({ chunks: [data], total: 5 })).rejects.toThrow("unexpected size");
    await expect(
      downloadVerified({
        source: source([data]),
        url: "https://example.com/model.bin",
        sha256: sha(data),
        sizeBytes: data.length,
        destination: join(dir, "model.bin"),
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("not allowed");
    expect(existsSync(join(dir, "model.bin"))).toBe(false);
    expect(existsSync(join(dir, "model.bin.part"))).toBe(false);
  });

  it("stops when cancelled and leaves no partial file", async () => {
    const dir = await folder();
    const controller = new AbortController();
    const chunks = Array.from({ length: 50 }, () => Buffer.alloc(100, 2));
    const all = Buffer.concat(chunks);
    const running = downloadVerified({
      source: source(chunks, all.length),
      url: URL_OK,
      sha256: sha(all),
      sizeBytes: all.length,
      destination: join(dir, "model.bin"),
      signal: controller.signal,
      onProgress: (received) => {
        if (received >= 1_000) controller.abort();
      },
    });
    await expect(running).rejects.toThrow();
    expect(existsSync(join(dir, "model.bin"))).toBe(false);
    expect(existsSync(join(dir, "model.bin.part"))).toBe(false);
  });
});
