// COSGRAL W2: the file library (spec W2 §6, parity row 30; lead decision W2-6: one store, two views).
//
// One store of the program's files with two views: the library (files the person or an agent saved) and the
// attachments of chat messages. Files live in the program's folders; the database keeps only the index. A path
// outside the store is refused. Every size limit is in LIBRARY_LIMITS.

import { ATTACHMENT_LIMITS } from "./input-limits";
import type { AttachmentSummary } from "./ipc-conversation";
import { isDynamicRecord, isNumber, isOneOf, isString } from "./runtime-values";

export const LIBRARY_LIMITS = {
  /** One file: the same as a chat attachment. */
  fileBytes: ATTACHMENT_LIMITS.fileBytes,
  /** All files the person and agents saved in the library (chat attachments are counted by the chat). */
  totalBytes: 2 * 1024 * 1024 * 1024,
  files: 5_000,
  name: 200,
  query: 200,
  defaultListLimit: 200,
  listLimit: 1_000,
} as const;

/** "upload": saved by the person; "agent": saved by an agent; "chat": an attachment of a chat message. */
export const LIBRARY_ORIGINS = ["upload", "agent", "chat"] as const;
export type LibraryOrigin = (typeof LIBRARY_ORIGINS)[number];

export interface LibraryItem extends AttachmentSummary {
  origin: LibraryOrigin;
  createdAt: string;
  /** The agent that saved or sent it; null for the person. */
  createdByBotId: string | null;
  /** chat: the message the file is attached to. */
  messageId: string | null;
}

export interface ListLibraryInput {
  /** Part of the file name, case-insensitive. */
  query?: string;
  origin?: LibraryOrigin;
  limit?: number;
}

export interface LibraryUsage {
  files: number;
  bytes: number;
  limitBytes: number;
}

export interface LibraryFileIdInput {
  fileId: string;
}

/** Keeps a copy of a chat attachment (a `LibraryItem` with origin "chat") among the library files. */
export interface SaveChatAttachmentInput {
  attachmentId: string;
}

export interface OpenLibraryFileInput {
  fileId: string;
  action: "open" | "reveal" | "download";
}

export function isLibraryItem(value: unknown): value is LibraryItem {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNumber(value.size) &&
    isOneOf(["image", "file"], value.kind) &&
    isString(value.mimeType) &&
    isOneOf(["image", "pdf", "text", "none"], value.previewKind) &&
    (value.previewUrl === null || isString(value.previewUrl)) &&
    isOneOf(LIBRARY_ORIGINS, value.origin) &&
    isString(value.createdAt) &&
    (value.createdByBotId === null || isString(value.createdByBotId)) &&
    (value.messageId === null || isString(value.messageId))
  );
}

export function isLibraryUsage(value: unknown): value is LibraryUsage {
  return isDynamicRecord(value) && isNumber(value.files) && isNumber(value.bytes) && isNumber(value.limitBytes);
}
