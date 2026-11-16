// @vitest-environment node
// COSGRAL W8-KK1: the `spaces:*` handlers with the real store on a temporary disk, the window's trust check on, and a
// fake restart: create, switch (restart once, after the answer), delete (confirmation), and nothing for another server.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentEvent, isSpaceDescription, isSpaceList, type SpaceList } from "@openbot/contracts/ipc";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SpaceStore } from "../backend/space-store";
import { registerSpacesIpc } from "./spaces-ipc";
import { ipcRegistry } from "./trusted-ipc";

type Listener = (event: { senderFrame?: { url?: string | null } | null }, ...args: unknown[]) => unknown;
const handlers = new Map<string, Listener>();
const events: AgentEvent[] = [];
let restarts = 0;
let appData = "";

const MAIN = "openbot-app://app/index.html";
const call = async (channel: string, payload: unknown, serverId = "local", url = MAIN) => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler({ senderFrame: { url } }, { serverId, payload });
};
const asList = (value: unknown): SpaceList => {
  if (!isSpaceList(value)) throw new Error("not a space list");
  return value;
};
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

beforeAll(() => {
  appData = mkdtempSync(join(tmpdir(), "cosgral-spaces-ipc-"));
  const store = new SpaceStore({ baseUserData: join(appData, "COSGRAL Workspace"), baseHome: join(appData, "home") });
  ipcRegistry.register = (channel, listener) => {
    handlers.set(channel, listener);
  };
  registerSpacesIpc({
    store: () => store,
    emit: (event) => events.push(event),
    restart: async () => {
      restarts += 1;
    },
  });
});
afterAll(() => rmSync(appData, { recursive: true, force: true }));

describe("spaces IPC (W8-KK1)", () => {
  it("lists the main space and creates a client space, telling every window", async () => {
    expect(asList(await call("spaces:list", null)).spaces).toHaveLength(1);
    const list = asList(await call("spaces:create", { name: " Client A " }));
    expect(list.spaces.map((space) => space.name)).toEqual(["Main", "Client A"]);
    expect(events.at(-1)).toMatchObject({ type: "spaces-changed", runningId: "main" });
    expect(restarts).toBe(0);
  });

  it("refuses a bad name, a bad id, another server and an untrusted page before doing anything", async () => {
    await expect(call("spaces:create", { name: "client a" })).rejects.toThrow(/already has this name/);
    await expect(call("spaces:create", {})).rejects.toThrow(/needs a name/);
    await expect(call("spaces:archive", { id: "../main" })).rejects.toThrow(/space id/);
    await expect(call("spaces:list", null, "remote-1")).rejects.toThrow(/this computer/);
    await expect(call("spaces:list", null, "local", "https://example.com/")).rejects.toThrow(/untrusted/);
  });

  it("delete and switch need a real confirmation", async () => {
    const id = asList(await call("spaces:list", null)).spaces[1]?.id ?? "";
    await expect(call("spaces:delete", { id })).rejects.toThrow(/confirmation/);
    await expect(call("spaces:delete", { id, confirm: "yes" })).rejects.toThrow(/confirmation/);
    await expect(call("spaces:switch", { id, confirm: false })).rejects.toThrow(/confirmation/);
    expect(restarts).toBe(0);
  });

  it("a switch answers first and restarts once; choosing the running space again restarts nothing", async () => {
    const id = asList(await call("spaces:list", null)).spaces[1]?.id ?? "";
    const chosen = asList(await call("spaces:switch", { id, confirm: true }));
    expect(chosen).toMatchObject({ runningId: "main", selectedId: id });
    expect(restarts).toBe(0);
    await pause(300);
    expect(restarts).toBe(1);
    const back = asList(await call("spaces:switch", { id: "main", confirm: true }));
    expect(back.selectedId).toBe("main");
    await pause(300);
    expect(restarts).toBe(1);
    const same = asList(await call("spaces:switch", { id: "main", confirm: true }));
    expect(same.selectedId).toBe("main");
    await pause(300);
    expect(restarts).toBe(1);
  });

  it("describe, rename, archive, restore and delete work for a client space; main is protected", async () => {
    const id = asList(await call("spaces:list", null)).spaces[1]?.id ?? "";
    expect(isSpaceDescription(await call("spaces:describe", { id }))).toBe(true);
    expect(asList(await call("spaces:rename", { id, name: "Client B" })).spaces[1]?.name).toBe("Client B");
    expect(asList(await call("spaces:archive", { id })).spaces[1]?.archivedAt).not.toBeNull();
    expect(asList(await call("spaces:restore", { id })).spaces[1]?.archivedAt).toBeNull();
    await expect(call("spaces:delete", { id: "main", confirm: true })).rejects.toThrow(/main space/);
    expect(asList(await call("spaces:delete", { id, confirm: true })).spaces).toHaveLength(1);
  });
});
