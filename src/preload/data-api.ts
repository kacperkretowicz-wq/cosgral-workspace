// COSGRAL W2: the window API of shared tables and the file library. Answers are checked with the contract guards;
// malformed list entries are dropped.

import {
  type DraftAttachment,
  type ImportAttachmentsInput,
  IPC_CHANNELS,
  isLibraryItem,
  isLibraryUsage,
  isSharedTable,
  isTableRow,
  isTableWriteResult,
  type LibraryDesktopApi,
  type LibraryItem,
  type SharedTable,
  type TableRow,
  type TablesDesktopApi,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber } from "@openbot/contracts/runtime-values";
import { webUtils } from "electron";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createTablesApi(invoke: Invoke): TablesDesktopApi {
  return {
    list: () => invoke(IPC_CHANNELS.tablesList, null, decodeTables),
    create: (input) => invoke(IPC_CHANNELS.tablesCreate, input, decodeTable),
    delete: (input) => invoke(IPC_CHANNELS.tablesDelete, input, decodeNothing),
    queryRows: (input) =>
      invoke(IPC_CHANNELS.tablesQueryRows, input, (value) => {
        if (!isDynamicRecord(value) || !Array.isArray(value.rows) || !isNumber(value.total)) {
          throw new Error("Invalid table rows response.");
        }
        return { rows: value.rows.filter(isTableRow), total: value.total };
      }),
    insertRows: (input) => invoke(IPC_CHANNELS.tablesInsertRows, input, decodeRows),
    updateRow: (input) => invoke(IPC_CHANNELS.tablesUpdateRow, input, decodeWriteResult),
    deleteRow: (input) => invoke(IPC_CHANNELS.tablesDeleteRow, input, decodeWriteResult),
  };
}

export function createLibraryApi(
  invoke: Invoke,
  decodeDrafts: (value: unknown) => DraftAttachment[],
): LibraryDesktopApi {
  return {
    list: (input) => invoke(IPC_CHANNELS.libraryList, input ?? null, decodeItems),
    usage: () =>
      invoke(IPC_CHANNELS.libraryUsage, null, (value) => {
        if (!isLibraryUsage(value)) throw new Error("Invalid library usage response.");
        return value;
      }),
    choose: () => invoke(IPC_CHANNELS.libraryChoose, null, decodeItems),
    addFiles: async (files) => invoke(IPC_CHANNELS.libraryAdd, await importInput(files), decodeItems),
    saveFromChat: (input) =>
      invoke(IPC_CHANNELS.librarySaveFromChat, input, (value) => {
        if (!isLibraryItem(value)) throw new Error("Invalid library file response.");
        return value;
      }),
    delete: (input) => invoke(IPC_CHANNELS.libraryDelete, input, decodeNothing),
    open: (input) => invoke(IPC_CHANNELS.libraryOpen, input, decodeNothing),
    attachToDraft: (input) =>
      invoke(IPC_CHANNELS.libraryAttachToDraft, input, (value) => {
        const [draft] = decodeDrafts(value);
        if (!draft) throw new Error("The file was not attached.");
        return draft;
      }),
  };
}

/** Dropped files keep their path; pasted ones go as bytes. */
async function importInput(files: File[]): Promise<ImportAttachmentsInput> {
  const input: ImportAttachmentsInput = { paths: [], data: [] };
  for (const file of files) {
    const path = webUtils.getPathForFile(file);
    if (path) input.paths.push(path);
    else {
      input.data.push({
        name: file.name || `pasted-${Date.now()}`,
        mimeType: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
    }
  }
  return input;
}

function decodeNothing(): undefined {
  return undefined;
}

function decodeTables(value: unknown): SharedTable[] {
  if (!Array.isArray(value)) throw new Error("Invalid table list response.");
  return value.filter(isSharedTable);
}

function decodeTable(value: unknown): SharedTable {
  if (!isSharedTable(value)) throw new Error("Invalid table response.");
  return value;
}

function decodeRows(value: unknown): TableRow[] {
  if (!Array.isArray(value)) throw new Error("Invalid table rows response.");
  return value.filter(isTableRow);
}

function decodeWriteResult(value: unknown) {
  if (!isTableWriteResult(value)) throw new Error("Invalid table write response.");
  return value;
}

function decodeItems(value: unknown): LibraryItem[] {
  if (!Array.isArray(value)) throw new Error("Invalid library list response.");
  return value.filter(isLibraryItem);
}
