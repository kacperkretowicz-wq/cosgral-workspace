// COSGRAL W5-BE1: where the managed agent CLIs come from. Only the official sources below, over HTTPS to listed hosts
// (every redirect is checked again):
//
// - Codex CLI: the GitHub releases of openai/codex. The release lists the Windows file
//   `codex-<arch>-pc-windows-msvc.exe` with a `digest` ("sha256:…") that GitHub computes for every release file.
// - Claude Code: Anthropic's native releases at downloads.claude.ai/claude-code-releases: `latest` names the version,
//   `<version>/manifest.json` holds the SHA-256 and size per platform, `<version>/<platform>/claude.exe` is the file.
//   (This is the source the official install script uses.)
//
// The SHA-256 comes from that official metadata at download time. Neither is signed in a way COSGRAL checks: GitHub's
// digest and Anthropic's manifest are trusted through TLS to the official host (see the W5-BE1 report, risk R3).

import type { ManagedCliId } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { DownloadSource } from "./download-verified";

export const CLI_DOWNLOAD_HOSTS = new Set([
  "api.github.com",
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "downloads.claude.ai",
]);

/** The address as a URL when it is HTTPS to an official CLI host (port 443, no user or password); throws otherwise. */
export function checkCliDownloadUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The CLI download address is not allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    !CLI_DOWNLOAD_HOSTS.has(host) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error(`The CLI download address is not allowed (${url.protocol}//${host}).`);
  }
  return url;
}

/** One more file the CLI needs next to its executable (checked like the executable). */
export interface CliCompanionFile {
  url: string;
  sha256: string;
  sizeBytes: number;
  /** The file name inside the version folder. */
  fileName: string;
}

export interface CliRelease {
  id: ManagedCliId;
  version: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  /** The file name inside the version folder. */
  fileName: string;
  /**
   * Helper programs the CLI starts from its own folder. Codex 0.172 and later fail a turn ("Code Mode is unavailable …
   * host executable was not found") without `codex-code-mode-host.exe` next to `codex.exe`, as the official package
   * has it. Older releases have no such file, so the list is empty for them.
   */
  companions?: CliCompanionFile[];
}

/** Codex helpers the official Windows package keeps next to `codex.exe`: release file prefix and installed name. */
const CODEX_COMPANIONS: ReadonlyArray<readonly [string, string]> = [
  ["codex-code-mode-host", "codex-code-mode-host.exe"],
];

export interface CliCatalog {
  latest: (id: ManagedCliId, signal: AbortSignal) => Promise<CliRelease>;
  release: (id: ManagedCliId, version: string, signal: AbortSignal) => Promise<CliRelease>;
}

export interface OfficialCliCatalogOptions {
  source: DownloadSource;
  /** "x64" or "arm64". */
  arch?: string;
  /** Test only: other base addresses (the loopback stand-in server). Production uses the official ones. */
  githubApiBase?: string;
  claudeBase?: string;
}

const GITHUB_API = "https://api.github.com/repos/openai/codex/releases";
const CLAUDE_BASE = "https://downloads.claude.ai/claude-code-releases";
const VERSION = /^\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;
const METADATA_LIMIT = 4 * 1024 * 1024;

export class OfficialCliCatalog implements CliCatalog {
  readonly #source: DownloadSource;
  readonly #arch: "x64" | "arm64";
  readonly #githubApi: string;
  readonly #claudeBase: string;

  constructor(options: OfficialCliCatalogOptions) {
    this.#source = options.source;
    this.#arch = options.arch === "arm64" ? "arm64" : "x64";
    this.#githubApi = options.githubApiBase ?? GITHUB_API;
    this.#claudeBase = options.claudeBase ?? CLAUDE_BASE;
  }

  async latest(id: ManagedCliId, signal: AbortSignal): Promise<CliRelease> {
    if (id === "codex") return this.#codex(`${this.#githubApi}/latest`, signal);
    const version = (await this.#text(`${this.#claudeBase}/latest`, signal)).trim();
    return this.#claude(version, signal);
  }

  async release(id: ManagedCliId, version: string, signal: AbortSignal): Promise<CliRelease> {
    if (!VERSION.test(version)) throw new Error(`Not a CLI version: ${version}`);
    if (id === "codex") return this.#codex(`${this.#githubApi}/tags/rust-v${version}`, signal);
    return this.#claude(version, signal);
  }

  async #codex(address: string, signal: AbortSignal): Promise<CliRelease> {
    const release = JSON.parse(await this.#text(address, signal));
    if (!isDynamicRecord(release) || !isString(release.tag_name) || !Array.isArray(release.assets))
      throw new Error("The Codex release list has an unexpected shape.");
    const version = release.tag_name.replace(/^rust-v/, "");
    if (!VERSION.test(version)) throw new Error(`The Codex release has an unexpected version: ${release.tag_name}`);
    const fileName = `codex-${this.#arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc.exe`;
    const asset = release.assets.find((item) => isDynamicRecord(item) && item.name === fileName);
    if (!isDynamicRecord(asset) || !isString(asset.browser_download_url) || !isNumber(asset.size))
      throw new Error(`The Codex release ${version} has no ${fileName}.`);
    const digest = isString(asset.digest) ? asset.digest.replace(/^sha256:/, "").toLowerCase() : "";
    if (!SHA256.test(digest)) throw new Error(`The Codex release ${version} gives no SHA-256 for ${fileName}.`);
    const target = `${this.#arch === "arm64" ? "aarch64" : "x86_64"}-pc-windows-msvc.exe`;
    const companions: CliCompanionFile[] = [];
    for (const [prefix, installedName] of CODEX_COMPANIONS) {
      const name = `${prefix}-${target}`;
      const item = release.assets.find((entry) => isDynamicRecord(entry) && entry.name === name);
      if (!isDynamicRecord(item)) continue;
      const sha = isString(item.digest) ? item.digest.replace(/^sha256:/, "").toLowerCase() : "";
      if (!isString(item.browser_download_url) || !isNumber(item.size) || !SHA256.test(sha))
        throw new Error(`The Codex release ${version} gives no SHA-256 for ${name}.`);
      companions.push({ url: item.browser_download_url, sha256: sha, sizeBytes: item.size, fileName: installedName });
    }
    return {
      id: "codex",
      version,
      url: asset.browser_download_url,
      sha256: digest,
      sizeBytes: asset.size,
      fileName: "codex.exe",
      companions,
    };
  }

  async #claude(version: string, signal: AbortSignal): Promise<CliRelease> {
    if (!VERSION.test(version)) throw new Error("Claude Code's release service did not name a version.");
    const platform = `win32-${this.#arch}`;
    const manifest = JSON.parse(await this.#text(`${this.#claudeBase}/${version}/manifest.json`, signal));
    const entry =
      isDynamicRecord(manifest) && isDynamicRecord(manifest.platforms) ? manifest.platforms[platform] : null;
    if (!isDynamicRecord(entry) || !isString(entry.checksum) || !isNumber(entry.size))
      throw new Error(`Claude Code ${version} has no ${platform} build.`);
    const sha256 = entry.checksum.toLowerCase();
    if (!SHA256.test(sha256)) throw new Error(`Claude Code ${version} gives no SHA-256 for ${platform}.`);
    return {
      id: "claude",
      version,
      url: `${this.#claudeBase}/${version}/${platform}/claude.exe`,
      sha256,
      sizeBytes: entry.size,
      fileName: "claude.exe",
    };
  }

  async #text(address: string, signal: AbortSignal): Promise<string> {
    const response = await this.#source.open(address, signal);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > METADATA_LIMIT) throw new Error("The CLI release metadata is too large.");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
}
