// COSGRAL: fetches the small ngrok program once (Windows), so a person does not have to install anything. The file
// comes from the official ngrok download address over https. It is a .zip with one program inside, opened here.

import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const DOWNLOAD_BASE = "https://bin.equinox.io/c/bNyj1mQVY4c/";
const MAX_ZIP_BYTES = 120 * 1024 * 1024;

export class NgrokInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NgrokInstallError";
  }
}

/** The name of the .zip ngrok publishes for this computer, or null when COSGRAL cannot fetch one. */
export function ngrokArchiveName(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === "win32")
    return arch === "ia32" ? "ngrok-v3-stable-windows-386.zip" : "ngrok-v3-stable-windows-amd64.zip";
  return null;
}

export function managedNgrokPath(directory: string, platform: NodeJS.Platform = process.platform): string {
  return join(directory, platform === "win32" ? "ngrok.exe" : "ngrok");
}

/** Reads one file out of a .zip (the central directory tells where it is, so no scanning is needed). */
export function readZipEntry(zip: Buffer, wantedName: string): Buffer | null {
  const endSignature = 0x06054b50;
  let end = -1;
  for (let index = zip.length - 22; index >= Math.max(0, zip.length - 22 - 65_535); index -= 1) {
    if (zip.readUInt32LE(index) === endSignature) {
      end = index;
      break;
    }
  }
  if (end < 0) return null;
  const entries = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  for (let entry = 0; entry < entries; entry += 1) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== 0x02014b50) return null;
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name !== wantedName) continue;
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) return null;
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const data = zip.subarray(dataStart, dataStart + compressedSize);
    if (method === 0) return Buffer.from(data);
    if (method !== 8) return null;
    const inflated = inflateRawSync(data);
    return inflated.length === uncompressedSize ? inflated : null;
  }
  return null;
}

export interface InstallNgrokOptions {
  directory: string;
  platform?: NodeJS.Platform;
  arch?: string;
  fetchFile?: typeof fetch;
  onProgress?: (message: string) => void;
}

/** Downloads and stores `ngrok`. Returns its path. Throws {@link NgrokInstallError} with a plain message. */
export async function installNgrok(options: InstallNgrokOptions): Promise<string> {
  const platform = options.platform ?? process.platform;
  const archive = ngrokArchiveName(platform, options.arch ?? process.arch);
  if (!archive) {
    throw new NgrokInstallError(
      "Na tym komputerze nie umiem sam pobrać programu ngrok. Zainstaluj go ze strony ngrok.com/download i spróbuj jeszcze raz.",
    );
  }
  const download = options.fetchFile ?? fetch;
  options.onProgress?.("Pobieram mały program ngrok (tylko za pierwszym razem)…");
  let zip: Buffer;
  try {
    const response = await download(`${DOWNLOAD_BASE}${archive}`, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    zip = Buffer.from(await response.arrayBuffer());
    if (zip.length > MAX_ZIP_BYTES) throw new Error("too large");
  } catch {
    throw new NgrokInstallError(
      "Pobieranie programu ngrok nie udało się. Sprawdź połączenie z internetem i spróbuj jeszcze raz.",
    );
  }
  const program = readZipEntry(zip, platform === "win32" ? "ngrok.exe" : "ngrok");
  if (!program || program.length < 1024) {
    throw new NgrokInstallError("W pobranym pliku nie ma programu ngrok. Spróbuj jeszcze raz za chwilę.");
  }
  const target = managedNgrokPath(options.directory, platform);
  const partial = `${target}.part`;
  try {
    await mkdir(options.directory, { recursive: true });
    await writeFile(partial, program);
    if (platform !== "win32") await chmod(partial, 0o755);
    await rename(partial, target);
  } catch {
    await rm(partial, { force: true }).catch(() => undefined);
    throw new NgrokInstallError("Nie udało się zapisać programu ngrok na dysku.");
  }
  return target;
}
