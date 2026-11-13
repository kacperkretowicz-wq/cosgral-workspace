// COSGRAL W2-BE3 sandbox: shared tables and the file library with the deterministic Codex fixture.
// No model, network or real data. Run with a sandbox USERPROFILE, APPDATA and LOCALAPPDATA (see the report).
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AgentEvent, BotSummary } from "@openbot/contracts/ipc";
import { AgentService } from "../src/backend/agent-service";
import { BotStore } from "../src/backend/bot-store";
import { SharedDataTools } from "../src/backend/data-tools";
import { MailboxStore } from "../src/backend/mailbox-store";
import { OpenBotDatabase } from "../src/backend/openbot-database";
import { writeFakeCli } from "../src/backend/testing/fake-cli";

async function main() {
  const root = process.env.COSGRAL_DATA_SANDBOX;
  assert(
    root && process.env.USERPROFILE && resolve(process.env.USERPROFILE).startsWith(resolve(root)),
    "Use a dedicated sandbox USERPROFILE",
  );
  assert(
    process.env.APPDATA?.startsWith(root) && process.env.LOCALAPPDATA?.startsWith(root),
    "Sandbox APPDATA and LOCALAPPDATA required",
  );
  await mkdir(root, { recursive: true });
  process.env.OPENBOT_CODEX_PATH = await writeFakeCli(
    join(root, "Codex Fixture"),
    "codex",
    await readFile(join(process.cwd(), "src/backend/testing/channel-codex.cjs"), "utf8"),
  );
  process.env.OPENBOT_CLAUDE_PATH = join(root, "missing-claude");
  const db = new OpenBotDatabase(join(root, "data"));
  const bots = new BotStore(join(root, "data"), join(root, "home"), db);
  const mailbox = new MailboxStore(join(root, "data"), bots.sharedRoot, db);
  const service = new AgentService(bots, mailbox, {
    onChanged: () => () => {},
    onControlChanged: () => () => {},
    clearControls: () => {},
    endControl: () => {},
    handleDynamicTool: async () => ({ success: true, contentItems: [{ type: "inputText", text: "{}" }] }),
  });
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  const wait = async (predicate: () => Promise<boolean> | boolean) => {
    const end = Date.now() + 30_000;
    while (!(await predicate())) {
      assert(Date.now() < end, "Sandbox step timed out");
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  const replies = async (bot: BotSummary) =>
    (await service.readConversation(bot.id)).messages.filter(
      (message) => message.author === "assistant" && message.status !== "streaming" && message.text,
    );
  /** Sends a message as the person and returns the agent's reply (the fixture answers with DATA-RESULT JSON). */
  const say = async (bot: BotSummary, text: string, attachmentDraftIds?: string[]) => {
    const before = (await replies(bot)).length;
    await service.sendMessage({ botId: bot.id, text, ...(attachmentDraftIds ? { attachmentDraftIds } : {}) });
    await wait(async () => (await replies(bot)).length > before);
    const reply = (await replies(bot)).at(-1)?.text ?? "";
    assert(!reply.startsWith("Error"), reply);
    return reply.startsWith("DATA-RESULT ") ? JSON.parse(reply.slice("DATA-RESULT ".length)) : reply;
  };
  try {
    await service.initialize();
    const lead = await service.createBot(),
      a = await service.createBot(),
      b = await service.createBot();

    // 1. An agent creates a shared table with a row.
    const created = await say(lead, "DATA CREATE");
    assert.equal(created.created.table.name, "Sandbox leads");
    const tables = service.sharedData.tables.list();
    assert.equal(tables.length, 1);
    assert.equal(tables[0]?.ownerBotId, lead.id);
    assert.equal(tables[0]?.rowCount, 1);

    // 2. Two agents read the same row (version 1); the first write wins, the second gets a conflict.
    const readA = await say(a, "DATA READ");
    const readB = await say(b, "DATA READ");
    assert.equal(readA.version, 1);
    assert.equal(readB.version, 1);
    assert.match(readA.note, /not instructions/);
    const writeA = await say(a, "DATA WRITE 200");
    assert.equal(writeA.status, "updated");
    assert.equal(writeA.row.version, 2);
    const writeB = await say(b, "DATA WRITE 300");
    assert.equal(writeB.status, "conflict");
    assert.equal(writeB.current.version, 2);
    assert.equal(writeB.current.values.value, 200);
    assert.match(writeB.instruction, /nothing was written/);
    const [row] = service.sharedData.tables.queryRows({ tableId: tables[0]?.id ?? "" }).rows;
    assert.equal(row?.version, 2);
    assert.equal(row?.values.value, 200, "No silent overwrite by the second writer");
    assert.equal(row?.updatedByBotId, a.id);

    // 3. An agent saves a file into the library and sends it to another agent as an attachment.
    const filed = await say(lead, `DATA FILE to ${a.id}`);
    assert.equal(filed.saved.file.origin, "agent");
    await wait(async () =>
      (await service.readConversation(a.id)).messages.some((m) => m.text === "Sandbox report attached"),
    );
    const libraryFiles = service.sharedData.library.list({ origin: "agent" });
    const chatFiles = service.sharedData.library.list({ origin: "chat" });
    assert.equal(libraryFiles.length, 1);
    assert.equal(libraryFiles[0]?.name, "sandbox-report.md");
    assert.equal(libraryFiles[0]?.createdByBotId, lead.id);
    assert.equal(chatFiles.length, 1, "The same store shows the attachment in the chat view");
    assert.equal(chatFiles[0]?.name, "sandbox-report.md");
    assert.equal(chatFiles[0]?.createdByBotId, lead.id);
    assert(chatFiles[0]?.messageId);
    const fromLibrary = await service.sharedData.library.resolve(libraryFiles[0]?.id ?? "");
    const fromChat = await service.sharedData.library.resolve(chatFiles[0]?.id ?? "");
    assert(fromLibrary && fromChat);
    assert.equal(await readFile(fromChat.path, "utf8"), await readFile(fromLibrary.path, "utf8"));

    // 4. The person attaches the library file to their own message (what library.attachToDraft does).
    const drafts = await service.prepareAttachments([fromLibrary.path]);
    await say(
      b,
      "Please check this report",
      drafts.map((draft) => draft.id),
    );
    assert.equal(service.sharedData.library.list({ origin: "chat" }).length, 2);

    const usage = service.sharedData.library.usage();
    const libraryState = service.sharedData.library.list();
    const eventTypes = [...new Set(events.map((event) => event.type))].filter((type) =>
      ["tables-changed", "table-rows-changed", "library-changed"].includes(type),
    );
    assert.deepEqual(eventTypes.sort(), ["library-changed", "table-rows-changed", "tables-changed"]);
    await writeFile(
      join(root, "evidence.json"),
      JSON.stringify(
        {
          fixture: true,
          agents: { lead: lead.id, a: a.id, b: b.id },
          tables: service.sharedData.tables.list(),
          rows: service.sharedData.tables.queryRows({ tableId: tables[0]?.id ?? "" }).rows,
          reads: { a: readA, b: readB },
          writes: { a: writeA, b: writeB },
          library: libraryState,
          usage,
          agentFile: filed,
          events: events.filter((event) =>
            ["tables-changed", "table-rows-changed", "library-changed"].includes(event.type),
          ),
        },
        null,
        2,
      ),
    );
    await service.stop();
    db.close();

    // 5. After a restart the table, the row version and both views of the library are still there.
    const reopened = new OpenBotDatabase(join(root, "data"));
    await reopened.initialize();
    const after = new SharedDataTools({ database: reopened, sharedRoot: bots.sharedRoot, emit: () => {} });
    const [tableAfter] = after.tables.list();
    assert.equal(tableAfter?.name, "Sandbox leads");
    const [rowAfter] = after.tables.queryRows({ tableId: tableAfter?.id ?? "" }).rows;
    assert.equal(rowAfter?.version, 2);
    assert.equal(rowAfter?.values.value, 200);
    assert.deepEqual(
      after.library.list().map((item) => [item.id, item.origin]),
      libraryState.map((item) => [item.id, item.origin]),
    );
    const restoredFile = await after.library.resolve(libraryFiles[0]?.id ?? "");
    assert.equal(await readFile(restoredFile?.path ?? "", "utf8"), "# Sandbox report\nFixture data only.\n");
    const libraryItemsAfterRestart = after.library.list().length;
    reopened.close();
    console.log(
      JSON.stringify({
        ok: true,
        fixture: true,
        agents: 3,
        tableCreatedByAgent: true,
        secondWriterConflict: { status: writeB.status, currentVersion: writeB.current.version },
        rowAfterRestart: { version: rowAfter?.version, value: rowAfter?.values.value },
        agentFileInLibrary: true,
        agentFileAsAttachment: true,
        personAttachedLibraryFile: true,
        libraryItemsAfterRestart,
        evidence: join(root, "evidence.json"),
      }),
    );
  } finally {
    await service.stop();
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
