// Library › Files › This computer without a disk: one shared folder with a subfolder, a few files and the same refusals the
// engine gives (a path outside the folder, a secret-looking name). "Share a folder" adds a second folder the first time.

import type {
  CopyMachineFilesResult,
  MachineFileEntry,
  MachineFilesDesktopApi,
  MachineFolderGrant,
  MachineListing,
} from "@openbot/contracts/ipc";
import { isBlockedMachineName } from "@openbot/contracts/ipc";

const AT = "2026-11-20T09:30:00.000Z";

const TREE: Record<string, MachineFileEntry[]> = {
  "": [
    { name: "Faktury", relativePath: "Faktury", kind: "folder", size: 0, modifiedAt: AT },
    { name: "brief-kampania.pdf", relativePath: "brief-kampania.pdf", kind: "file", size: 482_113, modifiedAt: AT },
    { name: "notatki.md", relativePath: "notatki.md", kind: "file", size: 2_140, modifiedAt: AT },
    {
      name: "zdjecie-produktu.png",
      relativePath: "zdjecie-produktu.png",
      kind: "file",
      size: 1_204_331,
      modifiedAt: AT,
    },
  ],
  Faktury: [
    { name: "2026-10.pdf", relativePath: "Faktury/2026-10.pdf", kind: "file", size: 88_204, modifiedAt: AT },
    { name: "2026-11.pdf", relativePath: "Faktury/2026-11.pdf", kind: "file", size: 91_570, modifiedAt: AT },
  ],
};

export function createMockMachineFiles(options: { empty?: boolean } = {}): MachineFilesDesktopApi {
  const grants: MachineFolderGrant[] = options.empty
    ? []
    : [{ id: "grant-docs", label: "Dokumenty", root: "C:\\Users\\Ola\\Documents", botIds: [], grantedAt: AT }];
  let added = 0;
  const known = (grantId: string) => grants.some((grant) => grant.id === grantId);
  return {
    grants: async () => [...grants],
    grant: async () => {
      added += 1;
      const grant: MachineFolderGrant = {
        id: `grant-${added}`,
        label: added === 1 ? "Projekty" : `Folder ${added}`,
        root: `C:\\Users\\Ola\\Projekty${added === 1 ? "" : added}`,
        botIds: [],
        grantedAt: AT,
      };
      grants.push(grant);
      return grant;
    },
    revoke: async ({ grantId }) => {
      const index = grants.findIndex((grant) => grant.id === grantId);
      if (index >= 0) grants.splice(index, 1);
    },
    list: async ({ grantId, relativePath = "" }): Promise<MachineListing> => {
      if (!known(grantId)) return { status: "refused", reason: "not-granted" };
      if (relativePath.split("/").includes("..")) return { status: "refused", reason: "outside-folder" };
      const entries = TREE[relativePath];
      if (!entries) return { status: "refused", reason: "not-found" };
      return { status: "ok", entries: entries.filter((entry) => !isBlockedMachineName(entry.name)), truncated: false };
    },
    open: async ({ grantId }) => {
      if (!known(grantId)) throw new Error("This folder is no longer shared. Add it again.");
    },
    copyToLibrary: async ({ grantId, relativePaths }): Promise<CopyMachineFilesResult> => {
      if (!known(grantId))
        return { added: 0, refused: relativePaths.map((path) => ({ relativePath: path, reason: "not-granted" })) };
      return { added: relativePaths.length, refused: [] };
    },
  };
}
