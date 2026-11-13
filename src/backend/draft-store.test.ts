// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACTION_CARD_LIMITS, type KeptDraft } from "@openbot/contracts/ipc";
import { afterEach, expect, it } from "vitest";
import { DraftStore } from "./draft-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function open(root?: string) {
  const path = root ?? (await mkdtemp(join(tmpdir(), "draft-store-")));
  if (!root) roots.push(path);
  const database = testDatabase(path);
  await database.initialize();
  return { path, store: new DraftStore(database) };
}

function draft(id: string, keptAt: string, botId = "chief"): KeptDraft {
  return {
    id,
    botId,
    threadId: "thread",
    variant: "draft",
    title: `Send ${id}?`,
    recipient: "Anna",
    channel: "email",
    preview: `Draft ${id}`,
    keptAt,
  };
}

it("keeps drafts across a restart, newest first, updates one in place and deletes it", async () => {
  const { path, store } = await open();
  store.save(draft("a", "2026-11-13T00:00:01.000Z"));
  store.save(draft("b", "2026-11-13T00:00:02.000Z"));
  expect(store.list().map((item) => item.id)).toEqual(["b", "a"]);
  store.save({ ...draft("a", "2026-11-13T00:00:03.000Z"), preview: "Changed" });
  expect(store.get("a")?.preview).toBe("Changed");
  closeTestDatabases();

  const { store: reopened } = await open(path);
  expect(reopened.list().map((item) => item.id)).toEqual(["a", "b"]);
  expect(reopened.delete("a")).toBe(true);
  expect(reopened.delete("a")).toBe(false);
  expect(reopened.get("a")).toBeNull();
});

it("refuses a new draft over the limit instead of dropping an old one", async () => {
  const { store } = await open();
  for (let n = 0; n < ACTION_CARD_LIMITS.keptDrafts; n++)
    store.save(draft(`d${n}`, `2026-11-13T00:00:00.${String(n).padStart(3, "0")}Z`));
  expect(() => store.save(draft("one-more", "2026-11-13T01:00:00.000Z"))).toThrow(/at most/i);
  store.save({ ...draft("d0", "2026-11-13T02:00:00.000Z"), preview: "Edited" });
  expect(store.list()).toHaveLength(ACTION_CARD_LIMITS.keptDrafts);
});

it("forgets the drafts of deleted agents and rejects malformed drafts", async () => {
  const { store } = await open();
  store.save(draft("mine", "2026-11-13T00:00:01.000Z", "chief"));
  store.save(draft("gone", "2026-11-13T00:00:02.000Z", "deleted-agent"));
  expect(store.pruneBots(["chief"])).toBe(true);
  expect(store.list().map((item) => item.id)).toEqual(["mine"]);
  expect(store.pruneBots(["chief"])).toBe(false);
  expect(() => store.save({ ...draft("bad", "2026-11-13T00:00:03.000Z"), preview: "" })).toThrow();
});
