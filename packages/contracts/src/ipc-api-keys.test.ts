import { describe, expect, it } from "vitest";
import {
  type ApiKeyEntry,
  isApiKeyEntry,
  isApiKeyEntryList,
  parseApiKeyProviderInput,
  parseSetApiKeyInput,
} from "./ipc-api-keys";

// Test data only: no real key.
const entry: ApiKeyEntry = {
  provider: "codex",
  maskedKey: "••••abcd",
  status: "ok",
  message: null,
  checkedAt: "2026-11-16T10:00:00.000Z",
  updatedAt: "2026-11-16T09:00:00.000Z",
};

describe("API key entries", () => {
  it("accepts an entry with and without a key", () => {
    expect(isApiKeyEntry(entry)).toBe(true);
    expect(isApiKeyEntry({ ...entry, maskedKey: null, updatedAt: null, checkedAt: null, status: "unchecked" })).toBe(
      true,
    );
    expect(isApiKeyEntryList([entry, { ...entry, provider: "claude" }])).toBe(true);
  });

  it("rejects an unknown provider or status and a missing field", () => {
    expect(isApiKeyEntry({ ...entry, provider: "gemini" })).toBe(false);
    expect(isApiKeyEntry({ ...entry, status: "valid" })).toBe(false);
    expect(isApiKeyEntry({ ...entry, maskedKey: undefined })).toBe(false);
    expect(isApiKeyEntryList([entry, null])).toBe(false);
  });
});

describe("API key inputs", () => {
  it("trims a pasted key", () => {
    expect(parseSetApiKeyInput({ provider: "claude", key: "  test-key-0000-abcd \n" })).toEqual({
      provider: "claude",
      key: "test-key-0000-abcd",
    });
  });

  it.each(["", "short", "has a space inside", "line\nbreak-key-0000", "x".repeat(513), "zażółć-key-0000"])(
    "refuses the key %j without repeating it in the error",
    (key) => {
      let message = "";
      try {
        parseSetApiKeyInput({ provider: "codex", key });
      } catch (error) {
        message = error instanceof Error ? error.message : "";
      }
      expect(message).not.toBe("");
      expect(message).not.toContain(key.trim() || "\u0000");
    },
  );

  it("refuses an unknown provider and a non-object", () => {
    expect(() => parseSetApiKeyInput({ provider: "gemini", key: "test-key-0000" })).toThrow(/Codex or Claude/);
    expect(() => parseSetApiKeyInput(null)).toThrow();
    expect(() => parseApiKeyProviderInput({ provider: "x" })).toThrow(/Codex or Claude/);
    expect(parseApiKeyProviderInput({ provider: "codex", key: "ignored" })).toEqual({ provider: "codex" });
  });
});
