// COSGRAL (test support, also a reference for native clients): an HTTPS request that pins the server certificate by
// its SHA-256 fingerprint. The connection is checked after the TLS handshake and BEFORE the request (with its ticket or
// token) is written; a different certificate ends the connection with an error.

import { Agent, request } from "node:https";
import { connect } from "node:tls";
import { mobileFingerprintMatches } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";

export function pinnedAgent(fingerprintHex: string): Agent {
  const agent = new Agent({ keepAlive: false });
  agent.createConnection = (options, callback) => {
    const socket = connect({
      host: String(options.host ?? "127.0.0.1"),
      port: Number(options.port),
      servername: undefined,
      // The certificate is self-signed: trust comes from the pinned fingerprint, checked below.
      rejectUnauthorized: false,
    });
    socket.once("secureConnect", () => {
      if (mobileFingerprintMatches(fingerprintHex, socket.getPeerCertificate().fingerprint256)) {
        callback?.(null, socket);
      } else {
        socket.destroy();
        callback?.(new Error("The computer's certificate does not match the pinned fingerprint."), socket);
      }
    });
    socket.once("error", (error) => callback?.(error, socket));
    return undefined;
  };
  return agent;
}

export function pinnedJson(
  url: string,
  fingerprintHex: string,
  init: { method?: string; token?: string; body?: DynamicRecord } = {},
): Promise<{ status: number; body: DynamicRecord }> {
  return new Promise((resolve, reject) => {
    const payload = init.body ? JSON.stringify(init.body) : undefined;
    const outgoing = request(
      url,
      {
        method: init.method ?? "GET",
        agent: pinnedAgent(fingerprintHex),
        headers: {
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          text += chunk;
        });
        response.on("end", () => {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = null;
          }
          resolve({ status: response.statusCode ?? 0, body: isDynamicRecord(parsed) ? parsed : {} });
        });
      },
    );
    outgoing.once("error", reject);
    outgoing.end(payload);
  });
}
