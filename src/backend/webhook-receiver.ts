// COSGRAL W2: the local webhook receiver. Listens on 127.0.0.1 only (a public address comes in W3).
// POST /webhooks/<routineId> with Standard Webhooks headers; the body is cut off at the limit.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ROUTINE_LIMITS } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import type { WebhookAnswer, WebhookAnswerBody } from "./routine-manager";

const HOST = "127.0.0.1";
const PATH = /^\/webhooks\/([A-Za-z0-9-]{1,64})$/;

export interface WebhookReceiverOptions {
  handle: (
    routineId: string,
    headers: { id: string; timestamp: string; signature: string },
    body: Buffer,
  ) => Promise<WebhookAnswer>;
}

export class WebhookReceiver {
  readonly #handle: WebhookReceiverOptions["handle"];
  #server: Server | null = null;
  #url: string | null = null;

  constructor(options: WebhookReceiverOptions) {
    this.#handle = options.handle;
  }

  /** Listen on the preferred port (0 = any); a taken port falls back to any free one. Resolves with the base URL. */
  async start(preferredPort: number): Promise<string> {
    await this.stop();
    const server = createServer((request, response) => {
      void this.#serve(request, response).catch(() => answer(response, 500, { error: "internal error" }));
    });
    const port = await listen(server, preferredPort).catch(async (error: NodeJS.ErrnoException) => {
      if (error.code !== "EADDRINUSE" || preferredPort === 0) throw error;
      return listen(server, 0);
    });
    this.#server = server;
    this.#url = `http://${HOST}:${port}`;
    return this.#url;
  }

  url(): string | null {
    return this.#url;
  }

  async stop(): Promise<void> {
    const server = this.#server;
    this.#server = null;
    this.#url = null;
    if (!server) return;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  async #serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const match = PATH.exec(new URL(request.url ?? "/", "http://localhost").pathname);
    if (!match?.[1]) return answer(response, 404, { error: "not found" });
    if (request.method !== "POST") return answer(response, 405, { error: "use POST" });
    const declared = Number(request.headers["content-length"] ?? 0);
    if (declared > ROUTINE_LIMITS.webhookBody) {
      request.resume();
      return answer(response, 413, { error: "body too large" });
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buffer.length;
      if (size > ROUTINE_LIMITS.webhookBody) {
        request.destroy();
        return answer(response, 413, { error: "body too large" });
      }
      chunks.push(buffer);
    }
    const header = (name: string) => {
      const value = request.headers[name];
      return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
    };
    const result = await this.#handle(
      match[1],
      { id: header("webhook-id"), timestamp: header("webhook-timestamp"), signature: header("webhook-signature") },
      Buffer.concat(chunks),
    );
    answer(response, result.status, result.body);
  }
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      resolve(isDynamicRecord(address) && isNumber(address.port) ? address.port : port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, HOST);
  });
}

function answer(response: ServerResponse, status: number, body: WebhookAnswerBody): void {
  if (response.headersSent) return;
  const text = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  response.end(text);
}
