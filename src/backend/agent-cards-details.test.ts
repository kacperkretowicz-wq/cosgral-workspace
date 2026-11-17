// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_DETAIL_CARD_IDS,
  type AgentCardsOverview,
  defaultNotificationPreferences,
  isAgentCardDetails,
} from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { type AgentCardDetailPorts, AgentCardsService } from "./agent-cards";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const status = {
  scope: { kind: "agent" as const, botId: "chief" },
  budget: null,
  usage: { periodStart: "a", periodEnd: "b", tokens: 5, turns: 1, costUsd: 0, pricedTurns: 0, costComplete: false },
  state: "ok" as const,
  tokenPercent: null,
  costPercent: null,
  blocked: false,
  reason: null,
  enforceable: true,
};

interface StoredTemplate {
  id: string;
  name: string;
  summary: string;
  createdAt: string | null;
}

function ports(templates: Map<string, StoredTemplate>, saveFails = false, fileTotal = 3): AgentCardDetailPorts {
  let counter = 0;
  return {
    files: (_botId, limit) => ({
      items: Array.from({ length: Math.min(fileTotal, limit) }, (_, index) => ({
        id: `f-${index}`,
        name: `file-${index}.md`,
        size: 10,
        origin: "agent" as const,
        createdAt: "2026-11-17T10:00:00.000Z",
      })),
      total: fileTotal,
    }),
    folders: () => ({ workspace: "C:/w", level: "ask-first", additional: ["C:/a"], excluded: [] }),
    usage: () => status,
    advanced: async () => ({ hasSession: true, messages: 7 }),
    notifications: () => ({ muted: true, matrix: defaultNotificationPreferences().matrix }),
    templates: {
      find: (id) => templates.get(id) ?? null,
      count: () => templates.size,
      max: 100,
      save: async (botId, input) => {
        if (saveFails) throw new Error("Too many saved templates.");
        counter += 1;
        const template = {
          id: `template-${counter}`,
          name: input.name ?? botId,
          summary: input.summary ?? "",
          createdAt: "2026-11-17T10:00:00.000Z",
        };
        templates.set(template.id, template);
        return template;
      },
      remove: (id) => void templates.delete(id),
    },
  };
}

async function setup(options: { saveFails?: boolean; fileTotal?: number; noDetails?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "agent-cards-details-"));
  roots.push(root);
  const templates = new Map<string, StoredTemplate>();
  const make = () =>
    new AgentCardsService({
      file: join(root, "agent-preferences.json"),
      publishedFile: join(root, "agent-published.json"),
      agentExists: (botId) => botId === "chief" || botId === "writer",
      steerSupported: () => true,
      emit: () => undefined,
      ...(options.noDetails ? {} : { details: ports(templates, options.saveFails, options.fileTotal) }),
    });
  return { cards: make(), make, templates };
}

const publishCard = (overview: AgentCardsOverview) => overview.cards.find((card) => card.id === "publish");

describe("AgentCardsService details (W12 BE-G)", () => {
  it("opens each card with the data of the service that owns it, checked by the contract", async () => {
    const { cards } = await setup();
    for (const card of AGENT_DETAIL_CARD_IDS) {
      expect(isAgentCardDetails(await cards.details({ botId: "chief", card })), card).toBe(true);
    }
    expect(await cards.details({ botId: "chief", card: "files" })).toMatchObject({ total: 3, truncated: false });
    expect(await cards.details({ botId: "chief", card: "advanced" })).toMatchObject({ hasSession: true, messages: 7 });
    expect(await cards.details({ botId: "chief", card: "notifications" })).toMatchObject({ muted: true, level: "all" });
  });

  it("marks a long file list as cut at the limit", async () => {
    const { cards } = await setup({ fileTotal: 120 });
    const files = await cards.details({ botId: "chief", card: "files" });
    expect(files).toMatchObject({ card: "files", total: 120, truncated: true });
    expect(files.card === "files" ? files.items.length : -1).toBe(50);
  });

  it("refuses an unknown agent and says plainly when a card has no data here", async () => {
    const { cards } = await setup();
    await expect(cards.details({ botId: "ghost", card: "files" })).rejects.toThrow("does not exist");
    const bare = await setup({ noDetails: true });
    await expect(bare.cards.details({ botId: "chief", card: "usage" })).rejects.toThrow("not available");
    expect(publishCard(bare.cards.overview({ botId: "chief" }))?.available).toBe(false);
  });

  it("publishes an agent as a template, remembers it over a restart and shows it in the list of cards", async () => {
    const { cards, make } = await setup();
    const published = await cards.publishTemplate({ botId: "chief", name: "Chief", summary: "Leads" });
    expect(published).toMatchObject({
      card: "publish",
      savedTemplates: 1,
      maxTemplates: 100,
      template: { name: "Chief" },
    });
    expect(publishCard(cards.overview({ botId: "chief" }))).toMatchObject({
      available: true,
      summary: "Saved as a template: Chief",
    });
    expect(publishCard(cards.overview({ botId: "writer" }))?.summary).toBe("Not saved as a template");
    expect(await make().details({ botId: "chief", card: "publish" })).toMatchObject({ template: { name: "Chief" } });
  });

  it("replaces the old template when an agent is published again, and removes it on unpublish", async () => {
    const { cards, templates } = await setup();
    await cards.publishTemplate({ botId: "chief", name: "One" });
    await cards.publishTemplate({ botId: "chief", name: "Two" });
    expect([...templates.values()].map((template) => template.name)).toEqual(["Two"]);
    expect((await cards.unpublishTemplate({ botId: "chief" })).template).toBeNull();
    expect(templates.size).toBe(0);
    expect((await cards.unpublishTemplate({ botId: "chief" })).template).toBeNull();
  });

  it("treats a template deleted elsewhere as not published, and keeps nothing when saving fails", async () => {
    const { cards, templates } = await setup();
    await cards.publishTemplate({ botId: "chief", name: "One" });
    templates.clear();
    expect(await cards.details({ botId: "chief", card: "publish" })).toMatchObject({ template: null });
    const failing = await setup({ saveFails: true });
    await expect(failing.cards.publishTemplate({ botId: "chief" })).rejects.toThrow("Too many");
    expect(await failing.cards.details({ botId: "chief", card: "publish" })).toMatchObject({ template: null });
    const none = await setup({ noDetails: true });
    await expect(none.cards.publishTemplate({ botId: "chief" })).rejects.toThrow("not available");
  });
});
