// COSGRAL (parity row 45): IPC of Library › Files › This computer. The person grants folders with the system picker;
// every call goes to MachineFiles with `actor: null` (the person), so the window can never act as an agent. Files are
// only copied into the library (LibraryStore.addFiles), never moved or changed. This computer only.

import {
  type CopyMachineFilesResult,
  IPC_CHANNELS,
  type MachineFileRefusal,
  parseCopyMachineFiles,
  parseMachineFolderPath,
  parseMachineGrantId,
  parseOpenMachineFile,
} from "@openbot/contracts/ipc";
import { type BrowserWindow, dialog, type OpenDialogOptions, shell } from "electron";
import type { MachineFiles } from "../backend/machine-files";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

/** The part of LibraryStore this needs: copy files the person picked (actor null). */
export interface MachineFilesLibrary {
  addFiles: (input: { paths?: string[] }, actor: null) => Promise<readonly unknown[]>;
}

export interface MachineFilesIpcOptions {
  files: MachineFiles;
  library: () => MachineFilesLibrary;
  window: () => BrowserWindow | null;
  /** Tests: the folder picker and the system shell. */
  pickFolder?: () => Promise<string | null>;
  openPath?: (path: string) => Promise<string>;
  reveal?: (path: string) => void;
}

/** A refusal as a sentence for the person (the window translates it). */
export const MACHINE_REFUSAL_SENTENCES: Record<MachineFileRefusal, string> = {
  "not-granted": "This folder is no longer shared. Add it again.",
  "bot-not-allowed": "This folder is not shared with this agent.",
  "outside-folder": "That path is outside the shared folder.",
  "blocked-name": "This file looks like a secret (a key or a password store), so it stays hidden.",
  "not-found": "The file or folder is gone.",
  "not-a-folder": "That is a file, not a folder.",
  "not-a-file": "That is a folder, not a file.",
  "too-large": "The file is larger than the library allows.",
};

export function registerMachineFilesIpc(options: MachineFilesIpcOptions): void {
  const pickFolder =
    options.pickFolder ??
    (async () => {
      const window = options.window();
      const dialogOptions: OpenDialogOptions = { properties: ["openDirectory"] };
      const result = window
        ? await dialog.showOpenDialog(window, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    });
  const openPath = options.openPath ?? ((path: string) => shell.openPath(path));
  const reveal = options.reveal ?? ((path: string) => shell.showItemInFolder(path));

  handleTrusted(IPC_CHANNELS.machineFilesGrants, (input: unknown) => (isLocal(input) ? options.files.grants() : []));
  handleTrusted(IPC_CHANNELS.machineFilesGrant, async (input: unknown) => {
    local(input, () => null);
    const path = await pickFolder();
    if (!path) return null;
    return options.files.grant(path);
  });
  handleTrusted(IPC_CHANNELS.machineFilesRevoke, (input: unknown) => {
    options.files.revoke(local(input, parseMachineGrantId).grantId);
  });
  handleTrusted(IPC_CHANNELS.machineFilesList, (input: unknown) => {
    const parsed = local(input, parseMachineFolderPath);
    return options.files.list({ ...parsed, actor: null });
  });
  handleTrusted(IPC_CHANNELS.machineFilesOpen, async (input: unknown) => {
    const parsed = local(input, parseOpenMachineFile);
    const target = await options.files.locate({
      grantId: parsed.grantId,
      relativePath: parsed.relativePath,
      actor: null,
    });
    if (target.status === "refused") throw new Error(MACHINE_REFUSAL_SENTENCES[target.reason]);
    if (parsed.action === "reveal") {
      reveal(target.path);
      return;
    }
    // Opening a folder with the system shows it in the file manager; a file opens in its app.
    const openError = await openPath(target.path);
    if (openError) throw new Error(openError);
  });
  handleTrusted(IPC_CHANNELS.machineFilesCopy, async (input: unknown): Promise<CopyMachineFilesResult> => {
    const parsed = local(input, parseCopyMachineFiles);
    const paths: string[] = [];
    const refused: CopyMachineFilesResult["refused"] = [];
    for (const relativePath of parsed.relativePaths) {
      const file = await options.files.resolveFile({ grantId: parsed.grantId, relativePath, actor: null });
      if (file.status === "ok") paths.push(file.path);
      else refused.push({ relativePath, reason: file.reason });
    }
    const added = paths.length > 0 ? await options.library().addFiles({ paths }, null) : [];
    return { added: added.length, refused };
  });
}

function isLocal(input: unknown): boolean {
  return parseAgentRequest(input).serverId === "local";
}

function local<T>(input: unknown, parse: (payload: unknown) => T): T {
  const scoped = parseAgentRequest(input);
  if (scoped.serverId !== "local") throw new Error("Files of this computer are available on this computer only.");
  return parse(scoped.payload);
}
