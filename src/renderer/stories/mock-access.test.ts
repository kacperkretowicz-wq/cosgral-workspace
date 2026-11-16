import type { AgentEvent } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockAccess } from "./mock-access";

function setup() {
  const events: AgentEvent[] = [];
  const access = createMockAccess((event) => events.push(event), ["chief"], { chief: "Chief" });
  return { access, events };
}

describe("mock access", () => {
  it("starts every agent at the working folder, with no folders and no raise (W8-01)", async () => {
    const { access } = setup();
    expect(await access.get({ botId: "chief" })).toMatchObject({
      level: "working-folder",
      additionalFolders: [],
      excludedFolders: [],
      raisedAt: null,
      updatedAt: null,
    });
    expect((await access.get({ botId: "new-agent" })).level).toBe("working-folder");
  });

  it("a raise only opens a card: the level stays until it is allowed (W8-04)", async () => {
    const { access, events } = setup();
    const result = await access.setLevel({ botId: "chief", level: "full" });
    expect(result).toMatchObject({ raiseRequested: true, access: { level: "working-folder" } });
    const [raise] = access.pendingRaises();
    expect(raise).toMatchObject({
      botId: "chief",
      from: "working-folder",
      to: "full",
      title: "Give Chief more access?",
    });
    expect(raise?.preview).toMatch(/Folders you excluded stay forbidden/);
    expect(events).toEqual([]);
    const allowed = access.allowRaise(raise?.requestId ?? "");
    expect(allowed).toMatchObject({ level: "full" });
    expect(allowed.raisedAt).not.toBeNull();
    expect(events.map((event) => event.type)).toEqual(["access-changed"]);
    expect(access.pendingRaises()).toEqual([]);
  });

  it("Deny keeps the level; only one raise waits per agent; a card is answered once", async () => {
    const { access } = setup();
    await access.setLevel({ botId: "chief", level: "ask-first" });
    await expect(access.setLevel({ botId: "chief", level: "full" })).rejects.toThrow(/already waits/);
    const id = access.pendingRaises()[0]?.requestId ?? "";
    expect(access.denyRaise(id).level).toBe("working-folder");
    expect(() => access.denyRaise(id)).toThrow(/already decided/);
    expect(() => access.allowRaise(id)).toThrow(/already decided/);
  });

  it("lowering is immediate and needs no card; the same level changes nothing", async () => {
    const { access, events } = setup();
    await access.setLevel({ botId: "chief", level: "ask-first" });
    access.allowRaise(access.pendingRaises()[0]?.requestId ?? "");
    const lowered = await access.setLevel({ botId: "chief", level: "working-folder" });
    expect(lowered).toMatchObject({ raiseRequested: false, access: { level: "working-folder" } });
    const count = events.length;
    expect((await access.setLevel({ botId: "chief", level: "working-folder" })).raiseRequested).toBe(false);
    expect(events).toHaveLength(count);
  });

  it("keeps the folders, refusing a folder that is not a full path or is a whole drive (W8-05)", async () => {
    const { access } = setup();
    await access.setFolders({
      botId: "chief",
      additionalFolders: ["C:\\Work\\Clients"],
      excludedFolders: ["C:\\Work\\Clients\\Secret"],
    });
    expect(await access.get({ botId: "chief" })).toMatchObject({
      additionalFolders: ["C:\\Work\\Clients"],
      excludedFolders: ["C:\\Work\\Clients\\Secret"],
    });
    await expect(access.setFolders({ botId: "chief", excludedFolders: ["docs"] })).rejects.toThrow(/full path/);
    await expect(access.setFolders({ botId: "chief", additionalFolders: ["C:\\"] })).rejects.toThrow(/whole drive/);
  });

  it("can play a refusal of the program", () => {
    const { access, events } = setup();
    access.deny({ botId: "chief", threadId: null, kind: "file-change", reason: "outside-folder", path: "D:\\x" });
    expect(events[0]).toMatchObject({ type: "access-denied", reason: "outside-folder", path: "D:\\x" });
  });
});
