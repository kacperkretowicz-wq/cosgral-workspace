// COSGRAL W2: IPC of shared tables and the file library. Both live on this computer only (like the Vault and the
// skill library): with a remote server selected, lists come back empty and changes are refused.

import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { type DraftAttachment, IPC_CHANNELS, LIBRARY_LIMITS } from "@openbot/contracts/ipc";
import { app, type BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions, shell } from "electron";
import type { SharedDataTools } from "../backend/data-tools";
import { parseAgentRequest, parseImportAttachments } from "./ipc/agent-inputs";
import {
  parseCreateTable,
  parseDeleteTableRow,
  parseInsertTableRows,
  parseLibraryFileId,
  parseListLibrary,
  parseOpenLibraryFile,
  parseQueryTableRows,
  parseSaveChatAttachment,
  parseTableId,
  parseUpdateTableRow,
} from "./ipc/data-inputs";
import { handleTrusted } from "./trusted-ipc";

export interface SharedDataIpcOptions {
  data: () => SharedDataTools;
  window: () => BrowserWindow | null;
  /** Copies files into the composer's draft attachments, as a picked file (AgentService.prepareAttachments). */
  prepareDraft: (paths: string[]) => Promise<DraftAttachment[]>;
}

export function registerSharedDataIpc(options: SharedDataIpcOptions): void {
  const tables = () => options.data().tables;
  const library = () => options.data().library;

  handleTrusted(IPC_CHANNELS.tablesList, (input: unknown) => (isLocal(input) ? tables().list() : []));
  handleTrusted(IPC_CHANNELS.tablesCreate, (input: unknown) => tables().create(local(input, parseCreateTable), null));
  handleTrusted(IPC_CHANNELS.tablesDelete, (input: unknown) => {
    tables().deleteTable(local(input, parseTableId).tableId, null);
  });
  handleTrusted(IPC_CHANNELS.tablesQueryRows, (input: unknown) =>
    tables().queryRows(local(input, parseQueryTableRows)),
  );
  handleTrusted(IPC_CHANNELS.tablesInsertRows, (input: unknown) =>
    tables().insertRows(local(input, parseInsertTableRows), null),
  );
  handleTrusted(IPC_CHANNELS.tablesUpdateRow, (input: unknown) =>
    tables().updateRow(local(input, parseUpdateTableRow), null),
  );
  handleTrusted(IPC_CHANNELS.tablesDeleteRow, (input: unknown) =>
    tables().deleteRow(local(input, parseDeleteTableRow)),
  );

  handleTrusted(IPC_CHANNELS.libraryList, (input: unknown) =>
    isLocal(input) ? library().list(parseListLibrary(parseAgentRequest(input).payload)) : [],
  );
  handleTrusted(IPC_CHANNELS.libraryUsage, (input: unknown) =>
    isLocal(input) ? library().usage() : { files: 0, bytes: 0, limitBytes: LIBRARY_LIMITS.totalBytes },
  );
  handleTrusted(IPC_CHANNELS.libraryChoose, async (input: unknown) => {
    local(input, () => null);
    const window = options.window();
    const dialogOptions: OpenDialogOptions = { properties: ["openFile", "multiSelections"] };
    const result = window
      ? await dialog.showOpenDialog(window, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
    if (result.canceled || result.filePaths.length === 0) return [];
    return library().addFiles({ paths: result.filePaths }, null);
  });
  handleTrusted(IPC_CHANNELS.libraryAdd, (input: unknown) =>
    library().addFiles(local(input, parseImportAttachments), null),
  );
  handleTrusted(IPC_CHANNELS.librarySaveFromChat, (input: unknown) =>
    library().saveFromChat(local(input, parseSaveChatAttachment).attachmentId, null),
  );
  handleTrusted(IPC_CHANNELS.libraryDelete, (input: unknown) =>
    library().delete(local(input, parseLibraryFileId).fileId, null),
  );
  handleTrusted(IPC_CHANNELS.libraryOpen, async (input: unknown) => {
    const parsed = local(input, parseOpenLibraryFile);
    const file = await library().resolve(parsed.fileId);
    if (!file) throw new Error("This file is no longer in the library.");
    if (parsed.action === "reveal") {
      shell.showItemInFolder(file.path);
      return;
    }
    if (parsed.action === "open") {
      const openError = await shell.openPath(file.path);
      if (openError) throw new Error(openError);
      return;
    }
    const window = options.window();
    const saveOptions: SaveDialogOptions = { defaultPath: join(app.getPath("downloads"), file.name) };
    const result = window ? await dialog.showSaveDialog(window, saveOptions) : await dialog.showSaveDialog(saveOptions);
    if (result.canceled || !result.filePath) return;
    await copyFile(file.path, result.filePath);
  });
  handleTrusted(IPC_CHANNELS.libraryAttachToDraft, async (input: unknown) => {
    const file = await library().resolve(local(input, parseLibraryFileId).fileId);
    if (!file) throw new Error("This file is no longer in the library.");
    return options.prepareDraft([file.path]);
  });
}

function isLocal(input: unknown): boolean {
  return parseAgentRequest(input).serverId === "local";
}

function local<T>(input: unknown, parse: (payload: unknown) => T): T {
  const scoped = parseAgentRequest(input);
  if (scoped.serverId !== "local") throw new Error("Shared tables and the file library are on this computer only.");
  return parse(scoped.payload);
}
