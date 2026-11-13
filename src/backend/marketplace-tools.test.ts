// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DraftPreviewResolution } from "@openbot/contracts/ipc";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { afterEach, expect, it } from "vitest";
import { Marketplace } from "./marketplace";
import type { DynamicToolCallParams, DynamicToolResult } from "./protocol";
import { SkillLibrary } from "./skill-library";
import { SKILLS_DYNAMIC_TOOLS, type SkillToolContext, SkillTools, skillInstructions } from "./skill-tools";
import { closeTestDatabases, testDatabase } from "./testing/databases";

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(withMarketplace = true) {
  const dir = await mkdtemp(join(tmpdir(), "marketplace-tools-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const workspaceFor = (botId: string) => join(dir, "Bots", botId);
  const library = new SkillLibrary({ database, root: join(dir, "Skills"), workspaceFor });
  const decision: { value: DraftPreviewResolution } = { value: "send" };
  const cards: string[] = [];
  const scout = { id: "scout", name: "Scout", role: "Research", description: "You research the web." };
  const marketplace = new Marketplace({
    database,
    library,
    bots: () => [scout],
    createAgent: async () => {
      throw new Error("not used");
    },
    deleteBot: async () => undefined,
    confirm: async (_context, input) => {
      cards.push(input.preview);
      return decision.value;
    },
    emit: () => undefined,
  });
  const tools = new SkillTools(library, () => (withMarketplace ? marketplace : null));
  const context: SkillToolContext = {
    botId: "scout",
    workspacePath: workspaceFor("scout"),
    sharedRoot: join(dir, "Shared"),
    card: { botId: "scout", threadId: "thread", providerThreadId: "thread", turnId: "turn" },
  };
  return { library, tools, context, decision, cards };
}

function call(tool: string, args: unknown): DynamicToolCallParams {
  return {
    threadId: "thread",
    turnId: "turn",
    callId: `${tool}-call`,
    namespace: "cosgral_skills",
    tool,
    arguments: args,
  };
}

function payload(result: DynamicToolResult): DynamicRecord {
  const item = result.contentItems[0];
  if (item?.type !== "inputText") throw new Error("Expected a text result.");
  const value = JSON.parse(item.text);
  if (!isDynamicRecord(value)) throw new Error(`Expected a JSON object: ${item.text}`);
  return value;
}

function text(result: DynamicToolResult): string {
  const item = result.contentItems[0];
  return item?.type === "inputText" ? item.text : "";
}

it("offers search_marketplace and suggest_marketplace_item in cosgral_skills and mentions them in the instructions", () => {
  const names = SKILLS_DYNAMIC_TOOLS.tools.map((tool) => tool.name);
  expect(names).toEqual(expect.arrayContaining(["search_marketplace", "suggest_marketplace_item"]));
  expect(skillInstructions([])).toContain("suggest_marketplace_item");
});

it("searches the catalog with the agent's own install state", async () => {
  const { tools, context } = await setup();
  const result = await tools.handleDynamicTool(
    call("search_marketplace", { query: "research", kind: "skill" }),
    context,
  );
  expect(result.success).toBe(true);
  const list = payload(result).items;
  const items = Array.isArray(list) ? list.filter(isDynamicRecord) : [];
  expect(items[0]).toMatchObject({ id: "skill:research-brief", kind: "skill", installedForYou: false });
  expect(items.every((item) => item.kind === "skill")).toBe(true);
});

it("installs a suggested item only after the person approves the card", async () => {
  const { tools, context, library, decision, cards } = await setup();
  decision.value = "edit";
  const declined = await tools.handleDynamicTool(
    call("suggest_marketplace_item", { itemId: "skill:research-brief", reason: "You often ask me for sources." }),
    context,
  );
  expect(declined.success).toBe(true);
  expect(payload(declined)).toMatchObject({ decision: "declined", installed: false });
  expect(cards[0]).toContain("You often ask me for sources.");
  expect(library.list()).toEqual([]);

  decision.value = "send";
  const approved = await tools.handleDynamicTool(
    call("suggest_marketplace_item", { itemId: "skill:research-brief", reason: "You often ask me for sources." }),
    context,
  );
  expect(payload(approved)).toMatchObject({ decision: "installed", installed: true });
  expect(String(payload(approved).instruction)).toContain("SKILL.md");
  expect((await library.listInstalls({ botId: "scout" })).map((install) => install.name)).toEqual(["research-brief"]);
});

it("explains what is missing instead of failing silently", async () => {
  const { tools, context } = await setup();
  const unknown = await tools.handleDynamicTool(
    call("suggest_marketplace_item", { itemId: "skill:nope", reason: "x" }),
    context,
  );
  expect(unknown.success).toBe(false);
  expect(text(unknown)).toContain("does not exist");
  const noReason = await tools.handleDynamicTool(
    call("suggest_marketplace_item", { itemId: "skill:research-brief" }),
    context,
  );
  expect(noReason.success).toBe(false);
  expect(text(noReason)).toContain("reason");
  const noTurn = await tools.handleDynamicTool(
    call("suggest_marketplace_item", { itemId: "skill:research-brief", reason: "x" }),
    { ...context, card: undefined },
  );
  expect(noTurn.success).toBe(false);

  const off = await setup(false);
  const result = await off.tools.handleDynamicTool(call("search_marketplace", {}), off.context);
  expect(result.success).toBe(false);
  expect(text(result)).toContain("Marketplace is not available");
});
