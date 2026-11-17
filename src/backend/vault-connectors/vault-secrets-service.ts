// COSGRAL W11-KK (d): the person's own tools for items of the local Vault: reveal, copy (the clipboard is cleared after 30 s),
// import from a CSV export, the current two-step codes, and reset. Agents never reach these: they are only behind the window API.
// A secret leaves here only as the answer to `reveal` for the person who asked; errors never repeat a value.

import {
  parseLoginCsv,
  VAULT_CONNECTOR_LIMITS,
  type VaultCodes,
  VaultCsvError,
  type VaultCsvImportResult,
  type VaultItemFieldInput,
  type VaultItemSummary,
} from "@openbot/contracts/ipc";
import { parseTotpSetupKey } from "../totp";
import type { VaultStore } from "../vault-store";

export interface ClipboardPort {
  write(text: string): void;
  read(): string;
}

export interface VaultSecretsOptions {
  store: () => VaultStore | null;
  clipboard: ClipboardPort;
  /** For tests: runs `callback` after `ms`. */
  setTimer?: (callback: () => void, ms: number) => void;
  now?: () => number;
}

export class VaultSecretsService {
  readonly #options: VaultSecretsOptions;
  readonly #now: () => number;

  constructor(options: VaultSecretsOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  reveal(input: VaultItemFieldInput): { value: string } {
    return { value: this.#value(input) };
  }

  copy(input: VaultItemFieldInput): { clearsInSeconds: number } {
    const value = this.#value(input);
    const clipboard = this.#options.clipboard;
    clipboard.write(value);
    const seconds = VAULT_CONNECTOR_LIMITS.clipboardSeconds;
    const set = this.#options.setTimer ?? ((callback: () => void, ms: number) => void setTimeout(callback, ms).unref());
    // Cleared only if the clipboard still holds this secret (the person may have copied something else since).
    set(() => {
      if (clipboard.read() === value) clipboard.write("");
    }, seconds * 1000);
    return { clearsInSeconds: seconds };
  }

  /**
   * Adds the logins of a CSV export. A row is skipped when its website is not https, it has no password, it is too long, or the
   * same login (site, user name, password) is already saved; a row of a saved login adds only its two-step key when that login has none.
   */
  importCsv(csv: string): VaultCsvImportResult {
    const store = this.#store();
    let parsed: ReturnType<typeof parseLoginCsv>;
    try {
      parsed = parseLoginCsv(csv);
    } catch (error) {
      throw error instanceof VaultCsvError ? error : new VaultCsvError();
    }
    if (parsed.logins.length > VAULT_CONNECTOR_LIMITS.csvLogins)
      throw new Error("That file holds too many logins to import at once.");
    let imported = 0;
    let skipped = parsed.otherRows;
    for (const row of parsed.logins) {
      const origin = httpsOrigin(row.website);
      if (origin === null || row.password.trim().length === 0) {
        skipped += 1;
        continue;
      }
      let twoStepKey: string | null = null;
      if (row.twoStepKey) {
        try {
          parseTotpSetupKey(row.twoStepKey);
          twoStepKey = row.twoStepKey;
        } catch {
          twoStepKey = null;
        }
      }
      const sameLogin = store
        .list({ kind: "login" })
        .filter((item) => item.origin === origin && (item.username ?? "") === row.username);
      try {
        if (sameLogin.length > 0) {
          // The same password is already saved; a different one is kept as a separate item, so nothing saved is overwritten.
          const saved = sameLogin.find((item) => {
            const secrets = store.secrets(item.id);
            return secrets.kind === "login" && secrets.password === row.password;
          });
          if (saved === undefined) {
            store.save({
              kind: "login",
              url: origin,
              username: row.username,
              password: row.password,
              ...(twoStepKey ? { twoStepKey } : {}),
            });
            imported += 1;
          } else if (twoStepKey && !saved.hasTwoStepKey) {
            store.save({ kind: "login", id: saved.id, url: origin, username: row.username, twoStepKey });
            imported += 1;
          } else {
            skipped += 1;
          }
          continue;
        }
        store.save({
          kind: "login",
          url: origin,
          username: row.username,
          password: row.password,
          ...(twoStepKey ? { twoStepKey } : {}),
        });
        imported += 1;
      } catch {
        skipped += 1;
      }
    }
    return { imported, skipped };
  }

  codes(): VaultCodes {
    const store = this.#options.store();
    if (!store) return { codes: [] };
    const at = this.#now();
    const codes: VaultCodes["codes"] = [];
    const withKey = (item: VaultItemSummary) => item.kind === "totp" || (item.kind === "login" && item.hasTwoStepKey);
    for (const item of store.list().filter(withKey)) {
      try {
        const secrets = store.secrets(item.id);
        const period =
          secrets.kind === "login"
            ? secrets.twoStepKey?.period
            : secrets.kind === "totp"
              ? secrets.config.period
              : undefined;
        if (period === undefined) continue;
        codes.push({
          itemId: item.id,
          code: store.totpCode(item.id, at),
          period,
          remainingMs: period * 1000 - (at % (period * 1000)),
        });
      } catch {
        // An item this computer cannot decrypt has no code; the others still do.
      }
    }
    return { codes };
  }

  reset(): void {
    this.#store().reset();
  }

  #store(): VaultStore {
    const store = this.#options.store();
    if (!store) throw new Error("COSGRAL Workspace is still starting.");
    return store;
  }

  #value(input: VaultItemFieldInput): string {
    const secrets = this.#store().secrets(input.itemId);
    let value: string | null = null;
    if (secrets.kind === "login" && input.field === "password") value = secrets.password;
    else if (secrets.kind === "card" && input.field === "number") value = secrets.number;
    else if (secrets.kind === "card" && input.field === "securityCode") value = secrets.cvc;
    else if (secrets.kind === "apiKey" && input.field === "key") value = secrets.value;
    if (value === null || value.length === 0) throw new Error("That Vault item has no such secret.");
    return value;
  }
}

function httpsOrigin(website: string): string | null {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(website) ? website : `https://${website}`);
    return url.protocol === "https:" && url.hostname.includes(".") ? url.origin : null;
  } catch {
    return null;
  }
}
