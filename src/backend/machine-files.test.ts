import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MachineFiles } from "./machine-files";

const AT = new Date("2026-11-19T10:00:00.000Z");

let root: string;
let machine: MachineFiles;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cosgral-machine-"));
  await mkdir(join(root, "docs", "deep"), { recursive: true });
  await writeFile(join(root, "docs", "readme.txt"), "hello");
  await writeFile(join(root, "docs", "deep", "note.md"), "# note");
  await writeFile(join(root, "docs", ".env"), "SECRET=1");
  await writeFile(join(root, "docs", "id_rsa"), "key");
  await writeFile(join(root, "docs", "big.bin"), Buffer.alloc(2048));
  machine = new MachineFiles({
    now: () => AT,
    limits: { fileBytes: 1024, entriesPerListing: 3 },
    homeDir: "/home-not-used",
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("granting a folder", () => {
  it("records the folder the person chose", async () => {
    const grant = await machine.grant(join(root, "docs"), { botIds: ["chief"], label: "Docs" });
    expect(grant).toMatchObject({ label: "Docs", botIds: ["chief"], grantedAt: AT.toISOString() });
    expect(machine.grants()).toEqual([grant]);
  });

  it("defaults the label to the folder name and to the person only", async () => {
    const grant = await machine.grant(join(root, "docs"));
    expect(grant.label).toBe("docs");
    expect(grant.botIds).toEqual([]);
  });

  it("refuses a folder that does not exist or a file", async () => {
    await expect(machine.grant(join(root, "nope"))).rejects.toThrow(/not found/i);
    await expect(machine.grant(join(root, "docs", "readme.txt"))).rejects.toThrow(/folder/i);
  });

  it("refuses a drive root, the home folder and system or secret folders", async () => {
    await expect(machine.grant(parse(root).root)).rejects.toThrow(/too broad/i);
    const home = new MachineFiles({ homeDir: root });
    await expect(home.grant(root)).rejects.toThrow(/too broad/i);
    const secret = join(root, ".ssh");
    await mkdir(secret);
    await expect(machine.grant(secret)).rejects.toThrow(/not allowed/i);
    const appData = join(root, "AppData", "Local");
    await mkdir(appData, { recursive: true });
    await expect(machine.grant(appData)).rejects.toThrow(/not allowed/i);
  });

  it("does not grant the same folder twice and limits the number of grants", async () => {
    const first = await machine.grant(join(root, "docs"));
    expect(await machine.grant(join(root, "docs"))).toEqual(first);
    expect(machine.grants()).toHaveLength(1);
    const small = new MachineFiles({ limits: { grants: 1 }, homeDir: "/h" });
    await small.grant(join(root, "docs"));
    await expect(small.grant(join(root, "docs", "deep"))).rejects.toThrow(/at most 1/i);
  });

  it("revokes a grant", async () => {
    const grant = await machine.grant(join(root, "docs"));
    expect(machine.revoke(grant.id)).toBe(true);
    expect(machine.revoke(grant.id)).toBe(false);
    expect(machine.grants()).toEqual([]);
  });
});

describe("listing", () => {
  it("lists folders first, hides secret files, and cuts at the limit", async () => {
    const grant = await machine.grant(join(root, "docs"));
    const listing = await machine.list({ grantId: grant.id, actor: null });
    expect(listing.status).toBe("ok");
    if (listing.status !== "ok") return;
    expect(listing.entries.map((entry) => entry.name)).toEqual(["deep", "big.bin", "readme.txt"]);
    expect(listing.entries[0]).toMatchObject({ kind: "folder", relativePath: "deep" });
    expect(listing.truncated).toBe(false);
  });

  it("marks a longer listing as truncated", async () => {
    await writeFile(join(root, "docs", "a.txt"), "a");
    const grant = await machine.grant(join(root, "docs"));
    const listing = await machine.list({ grantId: grant.id, actor: null });
    expect(listing.status === "ok" && listing.truncated).toBe(true);
    expect(listing.status === "ok" && listing.entries).toHaveLength(3);
  });

  it("lists a sub folder", async () => {
    const grant = await machine.grant(join(root, "docs"));
    const listing = await machine.list({ grantId: grant.id, relativePath: "deep", actor: null });
    expect(listing.status === "ok" && listing.entries.map((entry) => entry.relativePath)).toEqual(["deep/note.md"]);
  });

  it("refuses unknown grants, other agents and paths outside the folder", async () => {
    const grant = await machine.grant(join(root, "docs"), { botIds: ["chief"] });
    expect(await machine.list({ grantId: "nope", actor: null })).toEqual({ status: "refused", reason: "not-granted" });
    expect(await machine.list({ grantId: grant.id, actor: "other" })).toEqual({
      status: "refused",
      reason: "bot-not-allowed",
    });
    expect((await machine.list({ grantId: grant.id, actor: "chief" })).status).toBe("ok");
    for (const relativePath of ["..", "../docs", "deep/../..", "/etc", "C:\\Windows", "deep\0x"]) {
      expect(await machine.list({ grantId: grant.id, relativePath, actor: null })).toEqual({
        status: "refused",
        reason: "outside-folder",
      });
    }
    expect(await machine.list({ grantId: grant.id, relativePath: "missing", actor: null })).toEqual({
      status: "refused",
      reason: "not-found",
    });
    expect(await machine.list({ grantId: grant.id, relativePath: "readme.txt", actor: null })).toEqual({
      status: "refused",
      reason: "not-a-folder",
    });
  });

  it("does not follow a link that leaves the folder", async () => {
    const outside = join(root, "outside");
    await mkdir(outside);
    await writeFile(join(outside, "secret.txt"), "x");
    const grant = await machine.grant(join(root, "docs"));
    try {
      await symlink(outside, join(root, "docs", "link"), "junction");
    } catch {
      return; // links are not allowed on this machine
    }
    const listing = await machine.list({ grantId: grant.id, actor: null });
    expect(listing.status === "ok" && listing.entries.some((entry) => entry.name === "link")).toBe(false);
    expect(await machine.list({ grantId: grant.id, relativePath: "link", actor: null })).toEqual({
      status: "refused",
      reason: "outside-folder",
    });
  });
});

describe("resolving a file", () => {
  it("returns the real path, name and size of a file inside the folder", async () => {
    const grant = await machine.grant(join(root, "docs"));
    const result = await machine.resolveFile({ grantId: grant.id, relativePath: "deep/note.md", actor: null });
    expect(result).toMatchObject({ status: "ok", name: "note.md", size: 6 });
    expect(result.status === "ok" && result.path.endsWith("note.md")).toBe(true);
    expect(result.status === "ok" && result.root).toBe(grant.root);
  });

  it("refuses secret names, big files, folders and paths outside", async () => {
    const grant = await machine.grant(join(root, "docs"));
    const refuse = async (relativePath: string, actor: string | null = null) =>
      machine.resolveFile({ grantId: grant.id, relativePath, actor });
    expect(await refuse(".env")).toEqual({ status: "refused", reason: "blocked-name" });
    expect(await refuse("id_rsa")).toEqual({ status: "refused", reason: "blocked-name" });
    expect(await refuse("big.bin")).toEqual({ status: "refused", reason: "too-large" });
    expect(await refuse("deep")).toEqual({ status: "refused", reason: "not-a-file" });
    expect(await refuse("nope.txt")).toEqual({ status: "refused", reason: "not-found" });
    expect(await refuse("../../etc/passwd")).toEqual({ status: "refused", reason: "outside-folder" });
    expect(await refuse("readme.txt", "agent")).toEqual({ status: "refused", reason: "bot-not-allowed" });
  });

  it("stops serving files after the grant is revoked", async () => {
    const grant = await machine.grant(join(root, "docs"));
    machine.revoke(grant.id);
    expect(await machine.resolveFile({ grantId: grant.id, relativePath: "readme.txt", actor: null })).toEqual({
      status: "refused",
      reason: "not-granted",
    });
  });
});
