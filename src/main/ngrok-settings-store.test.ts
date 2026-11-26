// @vitest-environment node

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NgrokSettingsStore, normalizeNgrokDomain, validateNgrokSettings } from "./ngrok-settings-store";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const TOKEN = "2abcDEFghiJKLmnoPQRstuVWXyz_0123456789ab";
const cipher = {
  encrypt: (value: string) => Buffer.from(`enc:${value}`),
  decrypt: (value: Buffer) => value.toString().replace(/^enc:/u, ""),
};

describe("ngrok settings", () => {
  it("cleans a pasted domain and rejects a wrong token or domain with a plain sentence", () => {
    expect(normalizeNgrokDomain(" https://Nazwa-Test.ngrok-free.app/ ")).toBe("nazwa-test.ngrok-free.app");
    expect(validateNgrokSettings({ authtoken: ` ${TOKEN} `, domain: "https://nazwa-test.ngrok-free.app/" })).toEqual({
      authtoken: TOKEN,
      domain: "nazwa-test.ngrok-free.app",
    });
    expect(() => validateNgrokSettings({ authtoken: "krotki", domain: "nazwa.ngrok-free.app" })).toThrow(/Token/u);
    expect(() => validateNgrokSettings({ authtoken: TOKEN, domain: "example.com" })).toThrow(/Domena/u);
  });

  it("keeps the token encrypted on disk and reads it back", async () => {
    const root = await mkdtemp(join(tmpdir(), "cosgral-ngrok-settings-"));
    roots.push(root);
    const path = join(root, "ngrok-settings.json");
    const store = new NgrokSettingsStore(path, cipher);
    await store.initialize();
    expect(store.get()).toBeNull();
    await store.set({ authtoken: TOKEN, domain: "nazwa-test.ngrok-free.app" });
    expect(await readFile(path, "utf8")).not.toContain(TOKEN);
    const again = new NgrokSettingsStore(path, cipher);
    await again.initialize();
    expect(again.get()).toEqual({ authtoken: TOKEN, domain: "nazwa-test.ngrok-free.app" });
  });
});
