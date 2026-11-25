// What the person sees when the program cannot start. A damaged database file is the case a person can fix, so it gets a
// plain explanation and a way out: the damaged files are moved next to the data (never deleted) and the program starts clean.

import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

const DATABASE_FILES = ["openbot.db", "openbot.db-wal", "openbot.db-shm"] as const;

/** SQLite's own wording when the file is not a database or is broken. */
export function isDamagedDatabaseError(message: string): boolean {
  return /file is not a database|database disk image is malformed|SQLITE_NOTADB|SQLITE_CORRUPT/i.test(message);
}

/**
 * Moves the database files aside as `<name>.damaged-<time>` and returns the new name of the main file.
 * Nothing is deleted, so the old data can still be looked at or sent to someone for repair.
 */
export function moveDamagedDatabaseAside(userDataPath: string, now: Date = new Date()): string | null {
  const stamp = now
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/-\d{3}Z$/, "");
  let moved: string | null = null;
  for (const name of DATABASE_FILES) {
    const from = join(userDataPath, name);
    if (!existsSync(from)) continue;
    const to = `${from}.damaged-${stamp}`;
    renameSync(from, to);
    if (name === "openbot.db") moved = to;
  }
  return moved;
}

export interface StartupFailureText {
  title: string;
  /** A short explanation for a person who has never seen the technical message. */
  message: string;
  detail: string;
  startFresh: string;
  openFolder: string;
  close: string;
}

export function damagedDatabaseText(language: "pl" | "en", technical: string): StartupFailureText {
  if (language === "pl") {
    return {
      title: "COSGRAL Workspace nie może się uruchomić",
      message: "Plik z danymi programu jest uszkodzony.",
      detail: `Nic nie zostało skasowane. Możesz zacząć od nowa: uszkodzony plik zostanie odłożony obok (z dopiskiem „damaged”) i program wystartuje z czystymi danymi. Możesz też otworzyć folder z danymi i poprosić kogoś o pomoc.\n\nOpis techniczny: ${technical}`,
      startFresh: "Zacznij od nowa",
      openFolder: "Otwórz folder z danymi",
      close: "Zamknij",
    };
  }
  return {
    title: "COSGRAL Workspace couldn’t start",
    message: "The program’s data file is damaged.",
    detail: `Nothing was deleted. You can start fresh: the damaged file is put aside next to the data (marked “damaged”) and the program starts with clean data. Or open the data folder and ask someone for help.\n\nTechnical detail: ${technical}`,
    startFresh: "Start fresh",
    openFolder: "Open the data folder",
    close: "Close",
  };
}

/** The language of the dialog: the system language, since the program's own setting may be the damaged file. */
export function startupLanguage(locale: string): "pl" | "en" {
  return locale.toLowerCase().startsWith("pl") ? "pl" : "en";
}
