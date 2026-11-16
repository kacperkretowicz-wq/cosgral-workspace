// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BotStore } from "./bot-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const temporaryRoots: string[] = [];

afterEach(async () => {
  closeTestDatabases();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

async function openStore() {
  const root = await mkdtemp(join(tmpdir(), "cosgral-hidden-"));
  temporaryRoots.push(root);
  const userData = join(root, "user-data");
  const home = join(root, "home");
  const store = new BotStore(userData, home, testDatabase(userData));
  await store.initialize();
  return { store, userData, home };
}

describe("hiding an agent (COSGRAL W4-K3)", () => {
  it("is visible by default: no hidden field at all", async () => {
    const { store } = await openStore();
    const chief = await store.getOrCreate("chief");
    expect("hidden" in chief).toBe(false);
    expect(store.list().every((bot) => bot.hidden === undefined)).toBe(true);
  });

  it("hides and shows an agent without touching its activity time, and keeps the other agents as they are", async () => {
    const { store } = await openStore();
    await store.getOrCreate("chief");
    await store.getOrCreate("writer");
    await store.updatePreview("chief", "Last words");
    const before = store.list().find((bot) => bot.id === "chief");

    const hidden = await store.setHidden("chief", true);
    expect(hidden.hidden).toBe(true);
    expect(hidden.updatedAt).toBe(before?.updatedAt);
    expect(hidden.preview).toBe("Last words");
    expect(store.list().find((bot) => bot.id === "chief")?.hidden).toBe(true);
    expect(store.list().find((bot) => bot.id === "writer")?.hidden).toBeUndefined();
    // Hiding is not deleting: the agent is still in the list, with its workspace and thread.
    expect(store.list().map((bot) => bot.id)).toContain("chief");

    const shown = await store.setHidden("chief", false);
    expect("hidden" in shown).toBe(false);
    expect(store.list().find((bot) => bot.id === "chief")?.hidden).toBeUndefined();
  });

  it("keeps the hidden state after a restart", async () => {
    const { store, userData, home } = await openStore();
    await store.getOrCreate("chief");
    await store.setHidden("chief", true);
    closeTestDatabases();

    const restored = new BotStore(userData, home, testDatabase(userData));
    await restored.initialize();
    expect(restored.list().find((bot) => bot.id === "chief")?.hidden).toBe(true);
  });

  it("refuses an agent that does not exist", async () => {
    const { store } = await openStore();
    await expect(store.setHidden("ghost", true)).rejects.toThrow(/Unknown bot/);
  });
});
