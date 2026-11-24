// @vitest-environment node
// Library › Files › This computer: the `machine-files:*` handlers with the real MachineFiles on a temporary folder, a fake
// folder picker and shell, and a library that records what it was asked to copy.

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMachineFolderGrant, isMachineListing, type MachineFolderGrant } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MachineFiles } from "../backend/machine-files";
import { type MachineFilesLibrary, registerMachineFilesIpc } from "./machine-files-ipc";
import { ipcRegistry } from "./trusted-ipc";

type Listener = (event: { senderFrame?: { url?: string | null } | null }, ...args: unknown[]) => unknown;
const handlers = new Map<string, Listener>();
const MAIN = "openbot-app://app/index.html";
const call = async (channel: string, payload: unknown, serverId = "local") => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler({ senderFrame: { url: MAIN } }, { serverId, payload });
};

let root = "";
let picked: string | null = null;
let copied: string[][] = [];
let opened: string[] = [];
let revealed: string[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cosgral-machine-ipc-"));
  await mkdir(join(root, "docs", "deep"), { recursive: true });
  await writeFile(join(root, "docs", "readme.txt"), "hello");
  await writeFile(join(root, "docs", ".env"), "SECRET=1");
  await writeFile(join(root, "docs", "big.bin"), Buffer.alloc(2048));
  await writeFile(join(root, "outside.txt"), "not shared");
  picked = join(root, "docs");
  copied = [];
  opened = [];
  revealed = [];
  handlers.clear();
  ipcRegistry.register = (channel, listener) => {
    handlers.set(channel, listener);
  };
  const library: MachineFilesLibrary = {
    addFiles: async (input) => {
      copied.push(input.paths ?? []);
      return (input.paths ?? []).map((path) => ({ id: path }));
    },
  };
  registerMachineFilesIpc({
    files: new MachineFiles({ homeDir: "/home-not-used", limits: { fileBytes: 1024 } }),
    library: () => library,
    window: () => null,
    pickFolder: async () => picked,
    openPath: async (path) => {
      opened.push(path);
      return "";
    },
    reveal: (path) => {
      revealed.push(path);
    },
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function share(): Promise<MachineFolderGrant> {
  const grant = await call("machine-files:grant", null);
  if (!isMachineFolderGrant(grant)) throw new Error("not granted");
  return grant;
}

describe("machine files IPC", () => {
  it("shares a picked folder, lists it without secret files, and stops sharing", async () => {
    expect(await call("machine-files:grants", null)).toEqual([]);
    const grant = await share();
    expect(await call("machine-files:grants", null)).toEqual([grant]);
    const listing = await call("machine-files:list", { grantId: grant.id });
    if (!isMachineListing(listing) || listing.status !== "ok") throw new Error("not listed");
    const names = listing.entries.map((entry) => entry.name);
    expect(names).toEqual(["deep", "big.bin", "readme.txt"]);
    await call("machine-files:revoke", { grantId: grant.id });
    expect(await call("machine-files:grants", null)).toEqual([]);
    expect(await call("machine-files:list", { grantId: grant.id })).toEqual({
      status: "refused",
      reason: "not-granted",
    });
  });

  it("a cancelled picker shares nothing", async () => {
    picked = null;
    expect(await call("machine-files:grant", null)).toBeNull();
    expect(await call("machine-files:grants", null)).toEqual([]);
  });

  it("never leaves the shared folder", async () => {
    const grant = await share();
    expect(await call("machine-files:list", { grantId: grant.id, relativePath: ".." })).toEqual({
      status: "refused",
      reason: "outside-folder",
    });
    await expect(
      call("machine-files:open", { grantId: grant.id, relativePath: "../outside.txt", action: "open" }),
    ).rejects.toThrow(/outside the shared folder/);
    await expect(
      call("machine-files:open", { grantId: grant.id, relativePath: ".env", action: "open" }),
    ).rejects.toThrow(/looks like a secret/);
    expect(opened).toEqual([]);
  });

  it("opens and reveals files (also those too large to copy) and reveals folders", async () => {
    const grant = await share();
    await call("machine-files:open", { grantId: grant.id, relativePath: "big.bin", action: "open" });
    await call("machine-files:open", { grantId: grant.id, relativePath: "readme.txt", action: "reveal" });
    await call("machine-files:open", { grantId: grant.id, relativePath: "deep", action: "reveal" });
    expect(opened.map((path) => path.endsWith("big.bin"))).toEqual([true]);
    expect(revealed.map((path) => path.split(/[\\/]/).pop())).toEqual(["readme.txt", "deep"]);
  });

  it("copies allowed files into the library and reports the refused ones", async () => {
    const grant = await share();
    const result = await call("machine-files:copy", {
      grantId: grant.id,
      relativePaths: ["readme.txt", "big.bin", ".env", "../outside.txt"],
    });
    expect(result).toEqual({
      added: 1,
      refused: [
        { relativePath: "big.bin", reason: "too-large" },
        { relativePath: ".env", reason: "blocked-name" },
        { relativePath: "../outside.txt", reason: "outside-folder" },
      ],
    });
    expect(copied).toHaveLength(1);
    expect(copied[0]?.map((path) => path.split(/[\\/]/).pop())).toEqual(["readme.txt"]);
  });

  it("is for this computer only", async () => {
    expect(await call("machine-files:grants", null, "remote-1")).toEqual([]);
    await expect(call("machine-files:grant", null, "remote-1")).rejects.toThrow(/this computer only/);
  });
});
