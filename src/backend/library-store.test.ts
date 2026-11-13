// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LibraryStore } from "./library-store";
import { MailboxStore } from "./mailbox-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 10, 13, 6, 0, tick++));

async function open(root?: string, limits?: { fileBytes?: number; totalBytes?: number; files?: number }) {
  const dir = root ?? (await mkdtemp(join(tmpdir(), "library-store-")));
  if (!root) roots.push(dir);
  const userData = join(dir, "data");
  const shared = join(dir, "Shared");
  const database = testDatabase(userData);
  const mailbox = new MailboxStore(userData, shared, database);
  await mailbox.initialize();
  const library = new LibraryStore({ database, transfersRoot: join(shared, "Transfers"), now: clock, limits });
  const changes: string[][] = [];
  library.on("changed", (fileIds: string[]) => changes.push(fileIds));
  const workspace = join(dir, "Agents", "chief");
  await mkdir(workspace, { recursive: true });
  return { dir, shared, workspace, database, mailbox, library, changes };
}

function inside(root: string, path: string): boolean {
  const between = relative(root, path);
  return !!between && !between.startsWith("..");
}

describe("LibraryStore", () => {
  it("saves files of the person into the store and keeps only an index in the database", async () => {
    const { dir, library, changes } = await open();
    const source = join(dir, "Q3 report.pdf");
    await writeFile(source, "%PDF-1.4 test");

    const [fromDisk] = await library.addFiles({ paths: [source] }, null);
    const [pasted] = await library.addFiles(
      { data: [{ name: "notes.txt", mimeType: "text/plain", bytes: new TextEncoder().encode("hello") }] },
      null,
    );

    expect(fromDisk).toMatchObject({
      name: "Q3 report.pdf",
      size: 13,
      origin: "upload",
      createdByBotId: null,
      messageId: null,
      mimeType: "application/pdf",
      previewKind: "pdf",
    });
    expect(pasted).toMatchObject({ name: "notes.txt", size: 5, origin: "upload", previewKind: "text" });
    expect(library.list().map((item) => item.name)).toEqual(["notes.txt", "Q3 report.pdf"]);
    expect(library.usage()).toMatchObject({ files: 2, bytes: 18 });
    expect(changes).toEqual([[fromDisk?.id], [pasted?.id]]);

    const resolved = await library.resolve(fromDisk?.id ?? "");
    expect(resolved && inside(await realpath(library.root), resolved.path)).toBe(true);
    expect(await readFile(resolved?.path ?? "", "utf8")).toBe("%PDF-1.4 test");
    await rm(source);
    expect(existsSync(resolved?.path ?? "")).toBe(true);
  });

  it("lets an agent save only files from its own folders", async () => {
    const { dir, workspace, library } = await open();
    const report = join(workspace, "out", "summary.md");
    await mkdir(dirname(report), { recursive: true });
    await writeFile(report, "# Summary");
    const outside = join(dir, "private.txt");
    await writeFile(outside, "not for the library");

    const [saved] = await library.addFiles({ paths: [report] }, "chief", { allowedRoots: [workspace] });
    expect(saved).toMatchObject({ name: "summary.md", origin: "agent", createdByBotId: "chief" });

    await expect(library.addFiles({ paths: [outside] }, "chief", { allowedRoots: [workspace] })).rejects.toThrow(
      /outside/,
    );
    await expect(
      library.addFiles({ paths: [join(workspace, "..", "..", "private.txt")] }, "chief", { allowedRoots: [workspace] }),
    ).rejects.toThrow(/outside/);
    await expect(
      library.addFiles({ paths: [join(workspace, "missing.txt")] }, "chief", { allowedRoots: [workspace] }),
    ).rejects.toThrow(/not found|no such file|ENOENT/i);
    expect(library.list()).toHaveLength(1);
  });

  it("shows chat attachments as the second view of the same store", async () => {
    const { dir, mailbox, library } = await open();
    const source = join(dir, "Żółta oferta.csv");
    await writeFile(source, "a,b\n1,2\n");
    const receipt = await mailbox.enqueue({
      sender: { kind: "bot", botId: "chief" },
      recipientBotIds: ["sales"],
      text: "Offer attached",
      sourcePaths: [source],
    });
    await library.addFiles(
      { data: [{ name: "logo.png", mimeType: "image/png", bytes: new Uint8Array([1, 2]) }] },
      null,
    );

    const chat = library.list({ origin: "chat" });
    expect(chat).toHaveLength(1);
    expect(chat[0]).toMatchObject({
      name: "Żółta oferta.csv",
      origin: "chat",
      messageId: receipt.messageId,
      createdByBotId: "chief",
    });
    expect(
      library
        .list()
        .map((item) => item.origin)
        .sort(),
    ).toEqual(["chat", "upload"]);
    expect(library.list({ query: "żÓŁTA" }).map((item) => item.name)).toEqual(["Żółta oferta.csv"]);
    expect(library.list({ query: "LOGO" }).map((item) => item.name)).toEqual(["logo.png"]);
    expect(library.list({ origin: "upload", query: "oferta" })).toEqual([]);
    expect(library.list({ limit: 1 })).toHaveLength(1);
    expect(library.usage()).toMatchObject({ files: 1, bytes: 2 });

    const resolved = await library.resolve(chat[0]?.id ?? "");
    expect(await readFile(resolved?.path ?? "", "utf8")).toBe("a,b\n1,2\n");

    const kept = await library.saveFromChat(chat[0]?.id ?? "", null);
    expect(kept).toMatchObject({ name: "Żółta oferta.csv", origin: "upload", messageId: null });
    await expect(library.delete(chat[0]?.id ?? "", null)).rejects.toThrow(/stays with its message/);
  });

  it("deletes library files for good; an agent deletes only its own files", async () => {
    const { workspace, library } = await open();
    const file = join(workspace, "draft.txt");
    await writeFile(file, "draft");
    const [byAgent] = await library.addFiles({ paths: [file] }, "chief", { allowedRoots: [workspace] });
    const [byPerson] = await library.addFiles(
      { data: [{ name: "keep.txt", mimeType: "text/plain", bytes: new Uint8Array([65]) }] },
      null,
    );
    const agentPath = (await library.resolve(byAgent?.id ?? ""))?.path ?? "";

    await expect(library.delete(byPerson?.id ?? "", "chief")).rejects.toThrow(/only the files it saved/);
    await expect(library.delete(byAgent?.id ?? "", "sales")).rejects.toThrow(/only the files it saved/);
    await library.delete(byAgent?.id ?? "", "chief");
    expect(existsSync(agentPath)).toBe(false);
    await library.delete(byPerson?.id ?? "", null);
    expect(library.list()).toEqual([]);
    expect(library.usage()).toMatchObject({ files: 0, bytes: 0 });
    await expect(library.delete("missing", null)).rejects.toThrow(/no longer exists/);
  });

  it("refuses files over the limits from one place of configuration", async () => {
    const { library } = await open(undefined, { fileBytes: 10, totalBytes: 15, files: 2 });
    const bytes = (size: number) => new Uint8Array(size);

    await expect(
      library.addFiles({ data: [{ name: "big.bin", mimeType: "application/octet-stream", bytes: bytes(11) }] }, null),
    ).rejects.toThrow(/at most 10 B/);
    await library.addFiles({ data: [{ name: "a.bin", mimeType: "", bytes: bytes(10) }] }, null);
    await expect(library.addFiles({ data: [{ name: "b.bin", mimeType: "", bytes: bytes(6) }] }, null)).rejects.toThrow(
      /full/,
    );
    await library.addFiles({ data: [{ name: "c.bin", mimeType: "", bytes: bytes(5) }] }, null);
    await expect(library.addFiles({ data: [{ name: "d.bin", mimeType: "", bytes: bytes(0) }] }, null)).rejects.toThrow(
      /at most 2 files/,
    );
    expect(library.usage()).toMatchObject({ files: 2, bytes: 15, limitBytes: 15 });
  });

  it("refuses a stored path that points outside the store", async () => {
    const { dir, database, library } = await open();
    const [item] = await library.addFiles(
      { data: [{ name: "a.txt", mimeType: "text/plain", bytes: new Uint8Array([65]) }] },
      null,
    );
    const outside = join(dir, "outside.txt");
    await writeFile(outside, "secret");
    database.connection
      .prepare("UPDATE projection_attachments SET path = ? WHERE attachment_id = ?")
      .run(outside, item?.id ?? "");

    expect(await library.resolve(item?.id ?? "")).toBeNull();
    await expect(library.saveFromChat(item?.id ?? "", null)).rejects.toThrow(/not a chat attachment/);
  });

  it("keeps the library after a restart", async () => {
    const { dir, database, library } = await open();
    const [item] = await library.addFiles(
      { data: [{ name: "kept.txt", mimeType: "text/plain", bytes: new TextEncoder().encode("kept") }] },
      null,
    );
    database.close();

    const reopened = await open(dir);
    expect(reopened.library.list()).toMatchObject([{ id: item?.id, name: "kept.txt", origin: "upload", size: 4 }]);
    const resolved = await reopened.library.resolve(item?.id ?? "");
    expect(await readFile(resolved?.path ?? "", "utf8")).toBe("kept");
  });
});
