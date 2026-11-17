// @vitest-environment node
import { isLibraryPage, type LibraryItem } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { LibraryViewService } from "./library-view";

const NOW = new Date("2026-11-17T12:00:00.000Z");
const DAY = 86_400_000;

function item(
  id: string,
  origin: LibraryItem["origin"],
  size: number,
  ageDays: number,
  botId: string | null = null,
): LibraryItem {
  return {
    id,
    name: `${id}.md`,
    size,
    kind: "file",
    mimeType: "text/markdown",
    previewKind: "text",
    previewUrl: null,
    origin,
    createdAt: new Date(NOW.getTime() - ageDays * DAY).toISOString(),
    createdByBotId: botId,
    messageId: origin === "chat" ? "m" : null,
  };
}

function setup(failFor: string[] = []) {
  let files = [
    item("a", "agent", 100, 1, "chief"),
    item("b", "upload", 200, 40),
    item("c", "chat", 400, 2, "chief"),
    item("d", "agent", 800, 90, "gone"),
    item("e", "upload", 1_600, 5),
  ];
  const removed: string[] = [];
  const service = new LibraryViewService({
    all: () => files,
    agentName: (botId) => (botId === "chief" ? "Chief" : null),
    remove: async (fileId) => {
      if (failFor.includes(fileId)) throw new Error("File no longer exists in the library.");
      removed.push(fileId);
      files = files.filter((file) => file.id !== fileId);
    },
    now: () => NOW,
  });
  return { service, removed, files: () => files };
}

describe("LibraryViewService (W12 BE-H)", () => {
  it("gives a page with the agent name of each file, counts of the whole library and the bytes that match", async () => {
    const { service } = setup();
    const page = service.page({ origin: "agent" });
    expect(isLibraryPage(page)).toBe(true);
    expect(page.items.map((entry) => [entry.id, entry.agentName])).toEqual([
      ["a", "Chief"],
      ["d", null],
    ]);
    expect(page).toMatchObject({ total: 2, bytes: 900, counts: { all: 5, upload: 2, agent: 2, chat: 1 } });
  });

  it("deletes many files, skips a chat attachment and a file that is gone, and sums the freed space", async () => {
    const { service, removed } = setup(["e"]);
    const result = await service.deleteMany({ fileIds: ["a", "c", "e", "zzz"] });
    expect(result.deleted).toEqual(["a"]);
    expect(result.skipped).toEqual([
      { fileId: "c", reason: "chat-attachment" },
      { fileId: "e", reason: "not-found" },
      { fileId: "zzz", reason: "not-found" },
    ]);
    expect(result.freedBytes).toBe(100);
    expect(removed).toEqual(["a"]);
    await expect(service.deleteMany({ fileIds: [] })).rejects.toThrow();
  });

  it("counts what a clean-up would delete first, and then deletes only old files of that origin", async () => {
    const { service, files } = setup();
    expect(await service.cleanup({ origin: "agent", olderThanDays: 30, dryRun: true })).toEqual({
      files: 1,
      bytes: 800,
      deleted: false,
    });
    expect(files()).toHaveLength(5);
    expect(await service.cleanup({ origin: "upload", olderThanDays: 30 })).toEqual({
      files: 1,
      bytes: 200,
      deleted: true,
    });
    expect(files().map((file) => file.id)).toEqual(["a", "c", "d", "e"]);
    expect(await service.cleanup({ origin: "agent", olderThanDays: 3650 })).toEqual({
      files: 0,
      bytes: 0,
      deleted: true,
    });
    await expect(service.cleanup(JSON.parse('{"origin":"chat","olderThanDays":30}'))).rejects.toThrow();
  });

  it("reports only what was really deleted when one file cannot be removed", async () => {
    const { service } = setup(["d"]);
    expect(await service.cleanup({ origin: "agent", olderThanDays: 30 })).toEqual({
      files: 0,
      bytes: 0,
      deleted: true,
    });
  });
});
