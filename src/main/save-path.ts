import { join } from "node:path";

/** The folders the Save dialog may start in, most wanted first. */
const SAVE_FOLDERS = ["downloads", "documents", "temp"] as const;

type SaveFolderName = (typeof SAVE_FOLDERS)[number];

/**
 * Where the Save dialog starts for a file taken out of the library: the Downloads folder, else Documents, else the
 * temp folder of the app, else just the file name. `getPath` is `app.getPath`, which throws when the system cannot name
 * a folder (a profile without a Downloads folder, a moved or removed one). A missing folder must never stop the save,
 * and nothing about the folder goes into a message.
 */
export function defaultSavePath(fileName: string, getPath: (name: SaveFolderName) => string): string {
  for (const name of SAVE_FOLDERS) {
    try {
      const folder = getPath(name);
      if (folder) return join(folder, fileName);
    } catch {
      // This folder is not known here: try the next one.
    }
  }
  return fileName;
}
