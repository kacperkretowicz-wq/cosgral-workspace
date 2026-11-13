// COSGRAL W3: small HTTP helpers of the phone server (Mobile Connect and the phone API): errors with a status, JSON
// bodies with a size limit, and JSON answers that browsers may not cache or sniff.

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  MOBILE_LIMITS,
  type MobileAgentDetail,
  type MobileAgentSummary,
  type MobileAnswerResponse,
  type MobileCreateAgentResponse,
  type MobileDevice,
  type MobileErrorResponse,
  type MobileMessagePage,
  type MobileNeedsYouDetail,
  type MobileNeedsYouItem,
  type MobilePairResponse,
  type MobileSendMessageResponse,
  type MobileTemplateSummary,
  type MobileThread,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Everything the phone server answers with. */
export type MobileWire =
  | MobileErrorResponse
  | MobilePairResponse
  | { protocol: number; device: MobileDevice }
  | { agents: MobileAgentSummary[] }
  | { items: MobileNeedsYouItem[] }
  | { threads: MobileThread[] }
  | MobileMessagePage
  | MobileSendMessageResponse
  | MobileNeedsYouDetail
  | MobileAnswerResponse
  | { templates: MobileTemplateSummary[] }
  | MobileCreateAgentResponse
  | { agent: MobileAgentDetail };

export async function readJson(
  request: IncomingMessage,
  limit: number = MOBILE_LIMITS.bodyBytes,
): Promise<DynamicRecord> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > limit) tooLarge = true;
    else chunks.push(buffer);
  }
  if (tooLarge) throw new HttpError(413, `The request has at most ${limit} bytes.`);
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "The request is not valid JSON.");
  }
  if (!isDynamicRecord(value)) throw new HttpError(400, "The request must be a JSON object.");
  return value;
}

export function sendJson(response: ServerResponse, status: number, body: MobileWire): void {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}
