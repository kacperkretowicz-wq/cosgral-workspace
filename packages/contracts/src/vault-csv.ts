// COSGRAL W11-KK (d): reads the CSV export of a password manager (Bitwarden, 1Password, Chrome, Proton Pass and the like) into logins.
// Pure text work (no secrets are logged, nothing is stored here); the Vault decides what to keep. Our own parser (RFC 4180 rows:
// quoted fields may hold commas, line breaks and doubled quotes).

export interface CsvLogin {
  website: string;
  username: string;
  password: string;
  notes: string;
  /** A raw setup key or an otpauth:// link; empty when the row has none. */
  twoStepKey: string;
}

export interface CsvLogins {
  logins: CsvLogin[];
  /** Rows that are not logins (cards, notes, identities): counted, never read. */
  otherRows: number;
}

/** A column is found by any of its usual names (lower case). */
const COLUMNS = {
  website: ["url", "login_uri", "website", "uri", "web site", "origin"],
  username: ["username", "login_username", "user name", "login", "email", "email address"],
  password: ["password", "login_password"],
  notes: ["notes", "note", "extra", "comments"],
  twoStepKey: ["login_totp", "totp", "otpauth", "otp", "one-time password"],
  type: ["type"],
} as const;

export class VaultCsvError extends Error {
  constructor() {
    super("That file is not a CSV export of logins (it needs a website column and a password column).");
    this.name = "VaultCsvError";
  }
}

function parseRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const text = source.startsWith("﻿") ? source.slice(1) : source;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (quoted) throw new VaultCsvError();
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

/** The logins of `source`. A row of another type (a Bitwarden card or note, say) is only counted. Throws `VaultCsvError`. */
export function parseLoginCsv(source: string): CsvLogins {
  const [header, ...rows] = parseRows(source);
  if (!header) throw new VaultCsvError();
  const names = header.map((name) => name.trim().toLowerCase());
  const column = (choices: readonly string[]) => names.findIndex((name) => choices.includes(name));
  const website = column(COLUMNS.website);
  const password = column(COLUMNS.password);
  if (website < 0 || password < 0) throw new VaultCsvError();
  const userColumns = names.flatMap((name, index) =>
    COLUMNS.username.some((choice) => choice === name) ? [index] : [],
  );
  const notes = column(COLUMNS.notes);
  const twoStepKey = column(COLUMNS.twoStepKey);
  const type = column(COLUMNS.type);
  const logins: CsvLogin[] = [];
  let otherRows = 0;
  for (const cells of rows) {
    const kind = type >= 0 ? cells[type]?.trim().toLowerCase() : "";
    if (kind && kind !== "login") {
      otherRows += 1;
      continue;
    }
    logins.push({
      website: cells[website]?.trim() ?? "",
      username: userColumns.map((index) => cells[index]?.trim()).find(Boolean) ?? "",
      password: cells[password] ?? "",
      notes: notes < 0 ? "" : (cells[notes]?.trim() ?? ""),
      twoStepKey: twoStepKey < 0 ? "" : (cells[twoStepKey]?.trim() ?? ""),
    });
  }
  return { logins, otherRows };
}
