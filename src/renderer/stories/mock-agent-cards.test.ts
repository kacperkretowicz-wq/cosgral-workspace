// @vitest-environment node
import {
  AGENT_DETAIL_CARD_IDS,
  type AgentEvent,
  isAgentCardDetails,
  isAgentCardsOverview,
} from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockAgentCards } from "./mock-agent-cards";

const setup = () => {
  const events: AgentEvent[] = [];
  return { mock: createMockAgentCards((event) => events.push(event)), events };
};

describe("mock agent cards (W12 BE-G)", () => {
  it("opens every card that has a detail with a well-formed detail", async () => {
    const { mock } = setup();
    for (const card of AGENT_DETAIL_CARD_IDS) {
      expect(isAgentCardDetails(await mock.details({ botId: "chief", card })), card).toBe(true);
    }
  });

  it("publishes and unpublishes an agent as a template and says so in the list of cards", async () => {
    const { mock } = setup();
    const before = await mock.overview({ botId: "chief" });
    expect(isAgentCardsOverview(before)).toBe(true);
    const publishCard = (overview: typeof before) => overview.cards.find((card) => card.id === "publish");
    expect(publishCard(before)).toMatchObject({ available: true, summary: "Not saved as a template" });
    const published = await mock.publishTemplate({ botId: "chief", name: "Chief" });
    expect(published.template).toMatchObject({ name: "Chief" });
    expect(publishCard(await mock.overview({ botId: "chief" }))?.summary).toBe("Saved as a template");
    expect(publishCard(await mock.overview({ botId: "writer" }))?.summary).toBe("Not saved as a template");
    expect((await mock.unpublishTemplate({ botId: "chief" })).template).toBeNull();
    await expect(mock.publishTemplate({ botId: "chief", name: "   " })).rejects.toThrow();
  });
});
