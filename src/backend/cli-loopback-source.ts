// COSGRAL W5-BE1 (tests only): a plain-HTTP download source limited to this computer (127.0.0.1 / localhost), used by
// the unit tests and the sandbox e2e stand-in server instead of the official hosts. Production never uses it: main
// picks it only when the app is not packaged and COSGRAL_CLI_TEST_BASE names a loopback address.

import { get, type IncomingMessage } from "node:http";
import type { DownloadResponse, DownloadSource } from "./voice-download";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** The address as a URL when it is http(s) to this computer only; throws otherwise. */
export function checkLoopbackUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The CLI download address is not allowed.");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase()))
    throw new Error(`The CLI download address is not allowed (${url.protocol}//${url.hostname}).`);
  return url;
}

export function isLoopbackAddress(value: string | undefined): value is string {
  if (!value) return false;
  try {
    checkLoopbackUrl(value);
    return true;
  } catch {
    return false;
  }
}

export class LoopbackDownloadSource implements DownloadSource {
  async open(address: string, signal: AbortSignal): Promise<DownloadResponse> {
    let current = checkLoopbackUrl(address);
    for (let hop = 0; hop <= 5; hop += 1) {
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        const request = get(current, { signal }, resolve);
        request.once("error", reject);
      });
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        current = checkLoopbackUrl(new URL(response.headers.location, current).toString());
        continue;
      }
      if (status !== 200) {
        response.resume();
        throw new Error(`The download failed (HTTP ${status}).`);
      }
      const length = Number(response.headers["content-length"]);
      return { totalBytes: Number.isFinite(length) && length >= 0 ? length : null, body: response };
    }
    throw new Error("The download was redirected too many times.");
  }
}
