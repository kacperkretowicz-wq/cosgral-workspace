// COSGRAL: fetches the small Cloudflare program `cloudflared` once, so a person does not have to install anything to
// share the workspace. The program comes from the official Cloudflare release page on GitHub and is used only after its
// SHA-256 checksum matches the one GitHub publishes for that file.

import { createHash } from "node:crypto";
import { access, chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";

export const CLOUDFLARED_RELEASE_API = "https://api.github.com/repos/cloudflare/cloudflared/releases/latest";
const DOWNLOAD_PREFIX = "https://github.com/cloudflare/cloudflared/releases/download/";
const MAX_DOWNLOAD_BYTES = 200 * 1024 * 1024;

export class CloudflaredInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudflaredInstallError";
  }
}

/** The name of the plain program file Cloudflare publishes for this computer, or null when there is none to fetch. */
export function cloudflaredAssetName(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === "win32") return arch === "ia32" ? "cloudflared-windows-386.exe" : "cloudflared-windows-amd64.exe";
  if (platform === "linux") {
    if (arch === "x64") return "cloudflared-linux-amd64";
    if (arch === "arm64") return "cloudflared-linux-arm64";
  }
  return null;
}

export function managedCloudflaredPath(directory: string, platform: NodeJS.Platform = process.platform): string {
  return join(directory, platform === "win32" ? "cloudflared.exe" : "cloudflared");
}

interface ReleaseAsset {
  url: string;
  sha256: string;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

/** Finds the file and its checksum in the GitHub description of a release. Returns null when something is missing. */
export function findReleaseAsset(release: unknown, assetName: string): ReleaseAsset | null {
  if (!isDynamicRecord(release) || !Array.isArray(release.assets)) return null;
  for (const asset of release.assets) {
    if (!isDynamicRecord(asset) || asset.name !== assetName || !isString(asset.browser_download_url)) continue;
    if (!asset.browser_download_url.startsWith(DOWNLOAD_PREFIX)) return null;
    const fromDigest = isString(asset.digest) ? /^sha256:([0-9a-f]{64})$/iu.exec(asset.digest)?.[1] : undefined;
    const fromBody = isString(release.body) ? checksumFromNotes(release.body, assetName) : null;
    const sha256 = (fromDigest ?? fromBody ?? "").toLowerCase();
    return SHA256_PATTERN.test(sha256) ? { url: asset.browser_download_url, sha256 } : null;
  }
  return null;
}

/** Cloudflare lists `<file>: <sha256>` for every file in the notes of a release. */
function checksumFromNotes(notes: string, assetName: string): string | null {
  for (const line of notes.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(assetName)) continue;
    const match = /^[^\s:]+\s*[:=]?\s*([0-9a-f]{64})$/iu.exec(trimmed);
    if (match?.[1]) return match[1];
  }
  return null;
}

export interface InstallCloudflaredOptions {
  /** The folder of the program, for example `<user data>/bin`. */
  directory: string;
  platform?: NodeJS.Platform;
  arch?: string;
  fetchFile?: typeof fetch;
  onProgress?: (message: string) => void;
}

/** Downloads, checks and stores `cloudflared`. Returns its path. Throws {@link CloudflaredInstallError} with a plain message. */
export async function installCloudflared(options: InstallCloudflaredOptions): Promise<string> {
  const platform = options.platform ?? process.platform;
  const assetName = cloudflaredAssetName(platform, options.arch ?? process.arch);
  if (!assetName) {
    throw new CloudflaredInstallError(
      "Na tym komputerze nie umiem sam pobrać programu Cloudflare. Zainstaluj „cloudflared” (na Macu: brew install cloudflared) albo wybierz Tailscale w ustawieniach zaawansowanych.",
    );
  }
  const download = options.fetchFile ?? fetch;
  const target = managedCloudflaredPath(options.directory, platform);
  try {
    await access(target);
    return target;
  } catch {
    // Not there yet.
  }
  options.onProgress?.("Pobieram mały program Cloudflare (tylko za pierwszym razem)…");
  let asset: ReleaseAsset | null;
  try {
    const response = await download(CLOUDFLARED_RELEASE_API, {
      headers: { accept: "application/vnd.github+json", "user-agent": "COSGRAL-Workspace" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    asset = findReleaseAsset(await response.json(), assetName);
  } catch {
    throw new CloudflaredInstallError(
      "Nie udało się sprawdzić, jaki program Cloudflare pobrać. Sprawdź połączenie z internetem i spróbuj jeszcze raz.",
    );
  }
  if (!asset) {
    throw new CloudflaredInstallError(
      "Nie znalazłem w wydaniu Cloudflare pliku z sumą kontrolną, więc go nie pobieram. Zainstaluj „cloudflared” ręcznie albo wybierz Tailscale w ustawieniach zaawansowanych.",
    );
  }
  let bytes: Buffer;
  try {
    const response = await download(asset.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (isNumber(length) && length > MAX_DOWNLOAD_BYTES) throw new Error("too large");
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_DOWNLOAD_BYTES) throw new Error("too large");
  } catch {
    throw new CloudflaredInstallError(
      "Pobieranie programu Cloudflare nie udało się. Sprawdź połączenie z internetem i spróbuj jeszcze raz.",
    );
  }
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) {
    throw new CloudflaredInstallError(
      "Pobrany program Cloudflare ma złą sumę kontrolną, więc go nie uruchamiam. Spróbuj jeszcze raz za chwilę.",
    );
  }
  await mkdir(options.directory, { recursive: true });
  const partial = `${target}.part`;
  try {
    await writeFile(partial, bytes);
    if (platform !== "win32") await chmod(partial, 0o755);
    await rename(partial, target);
  } catch {
    await rm(partial, { force: true }).catch(() => undefined);
    throw new CloudflaredInstallError("Nie udało się zapisać programu Cloudflare na dysku.");
  }
  return target;
}
