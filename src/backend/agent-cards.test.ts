// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AGENT_CARD_IDS,
  type AgentEvent,
  defaultAgentPreferences,
  isAgentCardsOverview,
  isAgentEvent,
  isAgentPreferences,
} from "@openbot/contracts/ipc";
import { afterEach, describe, expect, it } from "vitest";
import { AgentCardsService } from "./agent-cards";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(options: { steer?: boolean; reset?: (botId: string) => Promise<void> } = {}) {
  const root = await mkdtemp(join(tmpdir(), "agent-cards-"));
  roots.push(root);
  const file = join(root, "agent-preferences.json");
  const events: AgentEvent[] = [];
  const make = () =>
    new AgentCardsService({
      file,
      agentExists: (botId) => botId === "chief" || botId === "writer",
      steerSupported: () => options.steer ?? true,
      counts: (botId) =>
        botId === "chief"
          ? { memory: { count: 12, summary: "12 memories" }, folders: { count: 2 }, publish: { available: false } }
          : {},
      resetSession: options.reset,
      emit: (event) => events.push(event),
    });
  return { file, events, cards: make(), make };
}

describe("AgentCardsService (W12 BE-D)", () => {
  it("gives every agent the 14 cards in order, with counts from the services and a readable line", async () => {
    const { cards } = await setup();
    const overview = cards.overview({ botId: "chief" });
    expect(isAgentCardsOverview(overview)).toBe(true);
    expect(overview.cards.map((card) => card.id)).toEqual([...AGENT_CARD_IDS]);
    const byId = Object.fromEntries(overview.cards.map((card) => [card.id, card]));
    expect(byId.memory).toMatchObject({ available: true, count: 12, summary: "12 memories" });
    // Without `details` ports the openable cards stay listed but unavailable (UI must not call `details`).
    expect(byId.folders).toMatchObject({ available: false, count: null, summary: "Not available in this build" });
    expect(byId.publish.available).toBe(false);
    expect(byId.skills).toMatchObject({ available: true, count: null });
  });

  it("refuses an agent that does not exist", async () => {
    const { cards } = await setup();
    expect(() => cards.overview({ botId: "ghost" })).toThrow("does not exist");
    expect(() => cards.getPreferences({ botId: "ghost" })).toThrow("does not exist");
    expect(() => cards.updatePreferences({ botId: "ghost", chatColor: "blue" })).toThrow("does not exist");
  });

  it("starts from the defaults, keeps what was left out and sends one event with the whole preferences", async () => {
    const { cards, events } = await setup();
    expect(cards.getPreferences({ botId: "chief" })).toEqual(defaultAgentPreferences("chief"));
    const first = cards.updatePreferences({ botId: "chief", chatColor: "blue", localScripts: true });
    const second = cards.updatePreferences({ botId: "chief", notificationLevel: "mentions" });
    expect(second).toMatchObject({ chatColor: "blue", localScripts: true, notificationLevel: "mentions" });
    expect(isAgentPreferences(first)).toBe(true);
    expect(events.map((event) => event.type)).toEqual(["agent-preferences-changed", "agent-preferences-changed"]);
    expect(events.every(isAgentEvent)).toBe(true);
  });

  it("says nothing when a change changes nothing", async () => {
    const { cards, events } = await setup();
    cards.updatePreferences({ botId: "chief", chatColor: "blue" });
    events.length = 0;
    cards.updatePreferences({ botId: "chief", chatColor: "blue" });
    expect(events).toEqual([]);
  });

  it("keeps the choices over a restart and per agent", async () => {
    const { cards, make } = await setup();
    cards.updatePreferences({ botId: "chief", busyMessage: "steer", quickAcknowledgement: true });
    const again = make();
    expect(again.getPreferences({ botId: "chief" })).toMatchObject({
      busyMessage: "steer",
      quickAcknowledgement: true,
    });
    expect(again.getPreferences({ botId: "writer" })).toEqual(defaultAgentPreferences("writer"));
  });

  it("survives a damaged file by starting from the defaults", async () => {
    const { file, make } = await setup();
    await writeFile(file, "{ not json");
    expect(make().getPreferences({ botId: "chief" })).toEqual(defaultAgentPreferences("chief"));
    await writeFile(
      file,
      JSON.stringify({ chief: { chatColor: "purple", busyMessage: "steer", localScripts: "yes" } }),
    );
    expect(make().getPreferences({ botId: "chief" })).toMatchObject({
      chatColor: "default",
      busyMessage: "steer",
      localScripts: false,
    });
  });

  it("reports steerSupported as a fact of the provider, never from the file", async () => {
    const { file, make } = await setup({ steer: false });
    await writeFile(file, JSON.stringify({ chief: { steerSupported: true } }));
    expect(make().getPreferences({ botId: "chief" }).steerSupported).toBe(false);
  });

  it("decides what a message sent while the agent works does", async () => {
    const steerer = await setup({ steer: true });
    expect(steerer.cards.busyMode("chief", "queue")).toBe("queue");
    steerer.cards.updatePreferences({ botId: "chief", busyMessage: "steer" });
    expect(steerer.cards.busyMode("chief", "queue")).toBe("steer");
    const acp = await setup({ steer: false });
    acp.cards.updatePreferences({ botId: "chief", busyMessage: "steer" });
    expect(acp.cards.busyMode("chief", "queue")).toBe("queue");
    expect(acp.cards.busyMode("ghost", "steer")).toBe("queue");
  });

  it("resets the provider session through the port and returns a fresh overview", async () => {
    const calls: string[] = [];
    const { cards } = await setup({ reset: async (botId) => void calls.push(botId) });
    const overview = await cards.resetSession({ botId: "chief" });
    expect(calls).toEqual(["chief"]);
    expect(isAgentCardsOverview(overview)).toBe(true);
  });

  it("says plainly when the session cannot be reset", async () => {
    const none = await setup();
    await expect(none.cards.resetSession({ botId: "chief" })).rejects.toThrow("cannot be reset");
    const busy = await setup({
      reset: async () => {
        throw new Error("Wait for the running turn to finish.");
      },
    });
    await expect(busy.cards.resetSession({ botId: "chief" })).rejects.toThrow("running turn");
  });

  it("prunes the choices of agents that are gone", async () => {
    const { cards, make } = await setup();
    cards.updatePreferences({ botId: "writer", chatColor: "red" });
    cards.updatePreferences({ botId: "chief", chatColor: "blue" });
    cards.prune(["chief"]);
    expect(make().getPreferences({ botId: "writer" }).chatColor).toBe("default");
    expect(make().getPreferences({ botId: "chief" }).chatColor).toBe("blue");
  });

  it("forgets the choices of an agent that was deleted", async () => {
    const { cards, make } = await setup();
    cards.updatePreferences({ botId: "writer", chatColor: "red" });
    cards.forget("writer");
    expect(make().getPreferences({ botId: "writer" })).toEqual(defaultAgentPreferences("writer"));
  });
});
