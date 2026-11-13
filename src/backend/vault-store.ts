// COSGRAL W2: the local Vault (spec W2 §3; lead decision W2-3: local only, on safeStorage).
//
// Every value of an item is encrypted with a SecretBox (Electron safeStorage, DPAPI on Windows) into one blob.
// The database also keeps a summary without any secret (label, site, user name, last card digits) for lists.
// Without encryption nothing is saved: there is no plaintext fallback. Error messages never repeat a value.

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import {
  isVaultItemSummary,
  type SaveVaultItemInput,
  VAULT_LIMITS,
  type VaultItemKind,
  type VaultItemSummary,
  type VaultStatus,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import type { OpenBotDatabase } from "./openbot-database";
import { parseTotpSetupKey, type TotpAlgorithm, totp } from "./totp";

/** Encrypts secrets at rest. In the app: Electron safeStorage. The same shape as the MCP store's box. */
export interface SecretBox {
  canEncrypt(): boolean;
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

export interface TotpSettings {
  secret: string;
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
}

/** The decrypted values of an item. Only Vault tools inside the program read them. */
export type VaultSecrets =
  | { kind: "login"; url: string; username: string; password: string; twoStepKey: TotpSettings | null }
  | {
      kind: "card";
      holderName: string;
      number: string;
      expiryMonth: number;
      expiryYear: number;
      cvc: string | null;
    }
  | { kind: "contact"; name: string; email: string | null; phone: string | null; address: string | null }
  | { kind: "apiKey"; name: string; value: string }
  | { kind: "totp"; issuer: string; account: string | null; config: TotpSettings };

interface Row {
  summary: VaultItemSummary;
  secretBox: string;
}

const API_KEY_NAME = /^[A-Z][A-Z0-9_]*$/;

export class VaultStore extends EventEmitter<{ changed: [items: VaultItemSummary[]] }> {
  readonly #database: OpenBotDatabase;
  readonly #box: SecretBox;
  readonly #now: () => Date;

  constructor(database: OpenBotDatabase, box: SecretBox, now: () => Date = () => new Date()) {
    super();
    this.#database = database;
    this.#box = box;
    this.#now = now;
  }

  status(): VaultStatus {
    return { encryptionAvailable: this.#box.canEncrypt(), items: this.#rows().length };
  }

  /** Summaries without secret values, newest first; `query` matches label, site, user name or name. */
  list(filter: { kind?: VaultItemKind; query?: string } = {}): VaultItemSummary[] {
    const query = filter.query?.trim().toLowerCase();
    return this.#rows()
      .map((row) => row.summary)
      .filter((item) => !filter.kind || item.kind === filter.kind)
      .filter(
        (item) =>
          !query ||
          [item.label, item.origin, item.username, item.name].some((value) => value?.toLowerCase().includes(query)),
      );
  }

  get(itemId: string): VaultItemSummary {
    return this.#row(itemId).summary;
  }

  save(input: SaveVaultItemInput): VaultItemSummary {
    if (!this.#box.canEncrypt()) {
      throw new Error("This computer cannot encrypt secrets right now, so nothing was saved.");
    }
    const existing = input.id ? this.#row(input.id) : null;
    if (existing && existing.summary.kind !== input.kind) throw new Error("A Vault item cannot change its kind.");
    if (!existing && this.#rows().length >= VAULT_LIMITS.items) {
      throw new Error(`The Vault holds at most ${VAULT_LIMITS.items} items.`);
    }
    const previous = existing ? this.#decrypt(existing) : null;
    const secrets = buildSecrets(input, previous);
    const at = this.#now().toISOString();
    const label = text(input.label, "label", VAULT_LIMITS.label) ?? existing?.summary.label ?? defaultLabel(secrets);
    const summary = summarize(
      existing?.summary.id ?? randomUUID(),
      label,
      secrets,
      existing?.summary.createdAt ?? at,
      at,
    );
    this.#database.connection
      .prepare(
        `INSERT INTO projection_vault_items (item_id, kind, summary_json, secret_box, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET summary_json = excluded.summary_json, secret_box = excluded.secret_box,
           updated_at = excluded.updated_at`,
      )
      .run(summary.id, summary.kind, JSON.stringify(summary), this.#box.encrypt(JSON.stringify(secrets)), at);
    this.#emitChanged();
    return summary;
  }

  delete(itemId: string): void {
    this.#row(itemId);
    this.#database.connection.prepare("DELETE FROM projection_vault_items WHERE item_id = ?").run(itemId);
    this.#emitChanged();
  }

  /** The decrypted values, for Vault tools inside the program only (never IPC, events or agent text). */
  secrets(itemId: string): VaultSecrets {
    return this.#decrypt(this.#row(itemId));
  }

  /** Logins for the site of `pageUrl`: same scheme and port, same host or a subdomain of it. */
  matchLogins(pageUrl: string): VaultItemSummary[] {
    let page: URL;
    try {
      page = new URL(pageUrl);
    } catch {
      return [];
    }
    if (page.protocol !== "https:" && page.protocol !== "http:") return [];
    return this.list({ kind: "login" }).filter((item) => {
      if (!item.origin) return false;
      const site = new URL(item.origin);
      return (
        site.protocol === page.protocol &&
        site.port === page.port &&
        (page.hostname === site.hostname || page.hostname.endsWith(`.${site.hostname}`))
      );
    });
  }

  /** The current code of a login's two-step key or of a totp item. */
  totpCode(itemId: string, nowMs: number = this.#now().getTime()): string {
    const secrets = this.secrets(itemId);
    if (secrets.kind === "login" && secrets.twoStepKey) return totp(secrets.twoStepKey, nowMs);
    if (secrets.kind === "totp") return totp(secrets.config, nowMs);
    throw new Error("This Vault item has no two-step key.");
  }

  /** The value of a saved API key by its variable name, for tools inside the program; null when missing. */
  resolveApiKey(name: string): string | null {
    const item = this.list({ kind: "apiKey" }).find((candidate) => candidate.name === name);
    if (!item) return null;
    const secrets = this.secrets(item.id);
    return secrets.kind === "apiKey" ? secrets.value : null;
  }

  #emitChanged(): void {
    this.emit("changed", this.list());
  }

  #rows(): Row[] {
    return this.#database.connection
      .prepare("SELECT summary_json, secret_box FROM projection_vault_items ORDER BY updated_at DESC, rowid DESC")
      .all()
      .flatMap((row) => {
        const parsed = parseRow(row);
        return parsed ? [parsed] : [];
      });
  }

  #row(itemId: string): Row {
    const row = parseRow(
      this.#database.connection
        .prepare("SELECT summary_json, secret_box FROM projection_vault_items WHERE item_id = ?")
        .get(itemId),
    );
    if (!row) throw new Error("This Vault item no longer exists.");
    return row;
  }

  #decrypt(row: Row): VaultSecrets {
    let value: unknown;
    try {
      value = JSON.parse(this.#box.decrypt(row.secretBox));
    } catch {
      throw new Error("This Vault item cannot be decrypted on this computer.");
    }
    if (!isVaultSecrets(value) || value.kind !== row.summary.kind) {
      throw new Error("This Vault item cannot be decrypted on this computer.");
    }
    return value;
  }
}

function parseRow(row: unknown): Row | null {
  if (!isDynamicRecord(row) || !isString(row.summary_json) || !isString(row.secret_box)) return null;
  try {
    const summary = JSON.parse(row.summary_json);
    return isVaultItemSummary(summary) ? { summary, secretBox: row.secret_box } : null;
  } catch {
    return null;
  }
}

function buildSecrets(input: SaveVaultItemInput, previous: VaultSecrets | null): VaultSecrets {
  switch (input.kind) {
    case "login": {
      const old = previous?.kind === "login" ? previous : null;
      const password = text(input.password, "password", VAULT_LIMITS.password) ?? old?.password;
      if (!password) throw new Error("A new login needs a password.");
      return {
        kind: "login",
        url: siteUrl(input.url),
        username: required(input.username, "user name", VAULT_LIMITS.username),
        password,
        twoStepKey:
          input.twoStepKey === null
            ? null
            : input.twoStepKey === undefined
              ? (old?.twoStepKey ?? null)
              : setupKey(input.twoStepKey),
      };
    }
    case "card": {
      const old = previous?.kind === "card" ? previous : null;
      const number = input.number === undefined ? old?.number : cardNumber(input.number);
      if (!number) throw new Error("A new card needs its number.");
      const year = input.expiryYear < 100 ? 2000 + input.expiryYear : input.expiryYear;
      if (
        !Number.isInteger(input.expiryMonth) ||
        input.expiryMonth < 1 ||
        input.expiryMonth > 12 ||
        !Number.isInteger(year) ||
        year < 2000 ||
        year > 2100
      ) {
        throw new Error("The card expiry date is not valid.");
      }
      let cvc = old?.cvc ?? null;
      if (input.cvc !== undefined) {
        if (!/^\d{3,4}$/.test(input.cvc)) throw new Error("The card security code is not valid.");
        cvc = input.cvc;
      }
      return {
        kind: "card",
        holderName: required(input.holderName, "card holder", VAULT_LIMITS.cardholder),
        number,
        expiryMonth: input.expiryMonth,
        expiryYear: year,
        cvc,
      };
    }
    case "contact": {
      const email = text(input.email, "e-mail", VAULT_LIMITS.contactField);
      if (email && !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("The e-mail address is not valid.");
      return {
        kind: "contact",
        name: required(input.name, "name", VAULT_LIMITS.contactField),
        email,
        phone: text(input.phone, "phone", VAULT_LIMITS.contactField),
        address: text(input.address, "address", VAULT_LIMITS.address),
      };
    }
    case "apiKey": {
      const old = previous?.kind === "apiKey" ? previous : null;
      const name = required(input.name, "key name", VAULT_LIMITS.apiKeyName);
      if (!API_KEY_NAME.test(name)) throw new Error("The key name must look like OPENAI_API_KEY (A–Z, 0–9 and _).");
      const value = text(input.value, "key", VAULT_LIMITS.apiKeyValue) ?? old?.value;
      if (!value) throw new Error("A new API key needs its value.");
      return { kind: "apiKey", name, value };
    }
    case "totp": {
      const old = previous?.kind === "totp" ? previous : null;
      const config = input.secret === undefined ? old?.config : setupKey(input.secret);
      if (!config) throw new Error("A new authenticator item needs its setup key.");
      return {
        kind: "totp",
        issuer: required(input.issuer, "issuer", VAULT_LIMITS.label),
        account: text(input.account, "account", VAULT_LIMITS.username),
        config,
      };
    }
  }
}

function summarize(
  id: string,
  label: string,
  secrets: VaultSecrets,
  createdAt: string,
  updatedAt: string,
): VaultItemSummary {
  return {
    id,
    kind: secrets.kind,
    label,
    origin: secrets.kind === "login" ? new URL(secrets.url).origin : null,
    username: secrets.kind === "login" ? secrets.username : null,
    hasTwoStepKey: secrets.kind === "login" && secrets.twoStepKey !== null,
    cardLast4: secrets.kind === "card" ? secrets.number.slice(-4) : null,
    cardExpiry:
      secrets.kind === "card"
        ? `${String(secrets.expiryMonth).padStart(2, "0")}/${String(secrets.expiryYear % 100).padStart(2, "0")}`
        : null,
    name:
      secrets.kind === "contact" || secrets.kind === "apiKey"
        ? secrets.name
        : secrets.kind === "totp"
          ? secrets.issuer
          : null,
    createdAt,
    updatedAt,
  };
}

function defaultLabel(secrets: VaultSecrets): string {
  switch (secrets.kind) {
    case "login":
      return new URL(secrets.url).hostname;
    case "card":
      return `Card •••• ${secrets.number.slice(-4)}`;
    case "contact":
    case "apiKey":
      return secrets.name;
    case "totp":
      return secrets.issuer;
  }
}

/** An http(s) address; the message never repeats it. */
function siteUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if ((url.protocol === "https:" || url.protocol === "http:") && value.length <= VAULT_LIMITS.url) return url.href;
  } catch {
    // Fall through to the error below.
  }
  throw new Error("The login address must be an http or https URL.");
}

function setupKey(value: string): TotpSettings {
  try {
    const parsed = parseTotpSetupKey(value);
    if (parsed.secret.length > VAULT_LIMITS.totpSecret) throw new Error("too long");
    return { secret: parsed.secret, algorithm: parsed.algorithm, digits: parsed.digits, period: parsed.period };
  } catch {
    throw new Error("The two-step setup key is not valid.");
  }
}

/** Digits only, 12–19 long, with a valid Luhn check digit. */
function cardNumber(value: string): string {
  const digits = value.replace(/[\s-]/g, "");
  if (!/^\d{12,19}$/.test(digits) || !luhn(digits)) throw new Error("The card number is not valid.");
  return digits;
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Trimmed text, or null when missing or blank. */
function text(value: string | undefined, field: string, limit: number): string | null {
  if (value === undefined || value === null) return null;
  if (!isString(value)) throw new Error(`The ${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > limit) throw new Error(`The ${field} has at most ${limit} characters.`);
  return trimmed || null;
}

function required(value: string | undefined, field: string, limit: number): string {
  const result = text(value, field, limit);
  if (!result) throw new Error(`The ${field} is required.`);
  return result;
}

function isTotpSettings(value: unknown): value is TotpSettings {
  return (
    isDynamicRecord(value) &&
    isString(value.secret) &&
    (value.algorithm === "SHA1" || value.algorithm === "SHA256" || value.algorithm === "SHA512") &&
    isNumber(value.digits) &&
    isNumber(value.period)
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

/** The decrypted blob has the shape of its kind; anything else is treated as unreadable. */
function isVaultSecrets(value: unknown): value is VaultSecrets {
  if (!isDynamicRecord(value)) return false;
  switch (value.kind) {
    case "login":
      return (
        isString(value.url) &&
        isString(value.username) &&
        isString(value.password) &&
        (value.twoStepKey === null || isTotpSettings(value.twoStepKey))
      );
    case "card":
      return (
        isString(value.holderName) &&
        isString(value.number) &&
        isNumber(value.expiryMonth) &&
        isNumber(value.expiryYear) &&
        isNullableString(value.cvc)
      );
    case "contact":
      return (
        isString(value.name) &&
        isNullableString(value.email) &&
        isNullableString(value.phone) &&
        isNullableString(value.address)
      );
    case "apiKey":
      return isString(value.name) && isString(value.value);
    case "totp":
      return isString(value.issuer) && isNullableString(value.account) && isTotpSettings(value.config);
    default:
      return false;
  }
}
