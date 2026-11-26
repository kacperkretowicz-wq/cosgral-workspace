// @vitest-environment node

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CloudflaredInstallError,
  cloudflaredAssetName,
  findReleaseAsset,
  installCloudflared,
} from "./cloudflared-installer";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const PROGRAM = Buffer.from("not really a program");
const CHECKSUM = createHash("sha256").update(PROGRAM).digest("hex");
const URL_OF_FILE =
  "https://github.com/cloudflare/cloudflared/releases/download/2026.1.0/cloudflared-windows-amd64.exe";

function release(extra: { digest?: string; browser_download_url?: string } = {}, body = "") {
  return {
    body,
    assets: [{ name: "cloudflared-windows-amd64.exe", browser_download_url: URL_OF_FILE, ...extra }],
  };
}

function fakeFetch(releaseJson: unknown, file: Buffer = PROGRAM): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.startsWith("https://api.github.com/")) return Response.json(releaseJson);
    if (url === URL_OF_FILE) return new Response(new Uint8Array(file));
    return new Response("nope", { status: 404 });
  };
}

async function folder() {
  const root = await mkdtemp(join(tmpdir(), "cosgral-cloudflared-"));
  roots.push(root);
  return root;
}

describe("cloudflaredAssetName", () => {
  it("names the plain file for Windows and Linux and has none for a Mac", () => {
    expect(cloudflaredAssetName("win32", "x64")).toBe("cloudflared-windows-amd64.exe");
    expect(cloudflaredAssetName("win32", "arm64")).toBe("cloudflared-windows-amd64.exe");
    expect(cloudflaredAssetName("linux", "arm64")).toBe("cloudflared-linux-arm64");
    expect(cloudflaredAssetName("darwin", "arm64")).toBeNull();
  });
});

describe("findReleaseAsset", () => {
  it("reads the checksum from the digest, or from the notes of the release", () => {
    expect(findReleaseAsset(release({ digest: `sha256:${CHECKSUM}` }), "cloudflared-windows-amd64.exe")).toEqual({
      url: URL_OF_FILE,
      sha256: CHECKSUM,
    });
    expect(
      findReleaseAsset(
        release({}, `Checksums:\ncloudflared-windows-amd64.exe: ${CHECKSUM}\n`),
        "cloudflared-windows-amd64.exe",
      ),
    ).toEqual({ url: URL_OF_FILE, sha256: CHECKSUM });
  });

  it("refuses a file without a checksum or from another address", () => {
    expect(findReleaseAsset(release(), "cloudflared-windows-amd64.exe")).toBeNull();
    expect(
      findReleaseAsset(
        release({ digest: `sha256:${CHECKSUM}`, browser_download_url: "https://example.com/cloudflared.exe" }),
        "cloudflared-windows-amd64.exe",
      ),
    ).toBeNull();
    expect(findReleaseAsset("not a release", "cloudflared-windows-amd64.exe")).toBeNull();
  });
});

describe("installCloudflared", () => {
  it("downloads the program once, checks it and keeps it", async () => {
    const directory = await folder();
    const messages: string[] = [];
    const path = await installCloudflared({
      directory,
      platform: "win32",
      arch: "x64",
      fetchFile: fakeFetch(release({ digest: `sha256:${CHECKSUM}` })),
      onProgress: (message) => messages.push(message),
    });
    expect(path).toBe(join(directory, "cloudflared.exe"));
    expect(await readFile(path)).toEqual(PROGRAM);
    expect(messages[0]).toContain("Pobieram");

    // A second call does not download again.
    const again = await installCloudflared({
      directory,
      platform: "win32",
      arch: "x64",
      fetchFile: async () => {
        throw new Error("no network");
      },
    });
    expect(again).toBe(path);
  });

  it("does not keep a program whose checksum is wrong", async () => {
    const directory = await folder();
    await expect(
      installCloudflared({
        directory,
        platform: "win32",
        arch: "x64",
        fetchFile: fakeFetch(release({ digest: `sha256:${CHECKSUM}` }), Buffer.from("something else")),
      }),
    ).rejects.toThrow(/sumę kontrolną/u);
    await expect(stat(join(directory, "cloudflared.exe"))).rejects.toThrow();
  });

  it("explains itself when there is no internet, no checksum or no file for this computer", async () => {
    const directory = await folder();
    const failing: typeof fetch = async () => {
      throw new Error("offline");
    };
    await expect(installCloudflared({ directory, platform: "win32", arch: "x64", fetchFile: failing })).rejects.toThrow(
      CloudflaredInstallError,
    );
    await expect(
      installCloudflared({ directory, platform: "win32", arch: "x64", fetchFile: fakeFetch(release()) }),
    ).rejects.toThrow(/sumą kontrolną/u);
    await expect(installCloudflared({ directory, platform: "darwin", arch: "arm64" })).rejects.toThrow(/brew install/u);
  });
});
