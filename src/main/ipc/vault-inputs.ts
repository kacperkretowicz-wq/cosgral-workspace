// COSGRAL W2: what a window may send for the local Vault (see ipc-vault.ts). Types and lengths are checked here;
// meaning (URLs, card numbers, setup keys) in the Vault store. No message repeats a value.

import {
  type DeleteVaultItemInput,
  isVaultItemKind,
  type RespondToVaultRequestInput,
  type SaveVaultItemInput,
  VAULT_LIMITS,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseSaveVaultItem(value: unknown): SaveVaultItemInput {
  if (!isObject(value)) throw new Error("Invalid Vault item.");
  if (!isVaultItemKind(value.kind)) throw new Error("kind must be login, card, contact, apiKey or totp.");
  const base = {
    ...(value.id === undefined ? {} : { id: requireString(value.id, "id") }),
    ...optional(value, "label", VAULT_LIMITS.label),
  };
  switch (value.kind) {
    case "login":
      return {
        kind: "login",
        ...base,
        url: text(value, "url", VAULT_LIMITS.url),
        username: text(value, "username", VAULT_LIMITS.username),
        ...optional(value, "password", VAULT_LIMITS.password),
        ...(value.twoStepKey === null ? { twoStepKey: null } : optional(value, "twoStepKey", VAULT_LIMITS.totpSecret)),
      };
    case "card":
      return {
        kind: "card",
        ...base,
        holderName: text(value, "holderName", VAULT_LIMITS.cardholder),
        ...optional(value, "number", 40),
        expiryMonth: whole(value, "expiryMonth"),
        expiryYear: whole(value, "expiryYear"),
        ...optional(value, "cvc", 8),
      };
    case "contact":
      return {
        kind: "contact",
        ...base,
        name: text(value, "name", VAULT_LIMITS.contactField),
        ...optional(value, "email", VAULT_LIMITS.contactField),
        ...optional(value, "phone", VAULT_LIMITS.contactField),
        ...optional(value, "address", VAULT_LIMITS.address),
      };
    case "apiKey":
      return {
        kind: "apiKey",
        ...base,
        name: text(value, "name", VAULT_LIMITS.apiKeyName),
        ...optional(value, "value", VAULT_LIMITS.apiKeyValue),
      };
    case "totp":
      return {
        kind: "totp",
        ...base,
        issuer: text(value, "issuer", VAULT_LIMITS.label),
        ...optional(value, "account", VAULT_LIMITS.username),
        ...optional(value, "secret", VAULT_LIMITS.totpSecret),
      };
  }
}

export function parseDeleteVaultItem(value: unknown): DeleteVaultItemInput {
  if (!isObject(value)) throw new Error("Invalid Vault request.");
  return { itemId: requireString(value.itemId, "itemId") };
}

export function parseRespondToVaultRequest(value: unknown): RespondToVaultRequestInput {
  if (!isObject(value)) throw new Error("Invalid Vault request answer.");
  const requestId = requireString(value.requestId, "requestId");
  const decline = value.decline === true;
  const hasItem = value.itemId !== undefined;
  if (decline === hasItem) throw new Error("Give the item to use, or decline the request.");
  return decline ? { requestId, decline: true } : { requestId, itemId: requireString(value.itemId, "itemId") };
}

function text(value: DynamicRecord, field: string, limit: number): string {
  const item = value[field];
  if (!isString(item)) throw new Error(`${field} must be text.`);
  if (item.length > limit) throw new Error(`${field} is too long.`);
  return item;
}

function optional(value: DynamicRecord, field: string, limit: number): Record<string, string> {
  return value[field] === undefined ? {} : { [field]: text(value, field, limit) };
}

function whole(value: DynamicRecord, field: string): number {
  const item = value[field];
  if (!isNumber(item) || !Number.isSafeInteger(item)) throw new Error(`${field} must be a whole number.`);
  return item;
}
