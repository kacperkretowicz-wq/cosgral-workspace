import type { AgentEvent } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockIsolation } from "./mock-isolation";

function setup() {
  const events: AgentEvent[] = [];
  const isolation = createMockIsolation((event) => events.push(event), {
    claude: { name: "Claude agent", ownProcesses: true },
    codex: { name: "Codex agent", ownProcesses: false },
  });
  return { isolation, events };
}

describe("mock isolation", () => {
  it("shows an agent with its own processes as active and one on a shared program as shared (W8-09)", async () => {
    const { isolation } = setup();
    expect((await isolation.get({ botId: "claude" })).state).toBe("active");
    expect((await isolation.get({ botId: "codex" })).state).toBe("shared-process");
    expect(await isolation.list()).toHaveLength(2);
  });

  it("turning it off is a card that changes nothing until it is allowed", async () => {
    const { isolation, events } = setup();
    const result = await isolation.setEnabled({ botId: "claude", enabled: false });
    expect(result).toMatchObject({ offRequested: true, isolation: { state: "active" } });
    expect(isolation.pendingOffs()).toHaveLength(1);
    const [card] = isolation.pendingOffs();
    expect(card?.title).toContain("Claude agent");
    expect(events).toHaveLength(0);
    isolation.allowOff(card?.requestId ?? "");
    expect((await isolation.get({ botId: "claude" })).state).toBe("off");
    expect(events.at(-1)).toMatchObject({ type: "isolation-changed" });
  });

  it("denying the card keeps it on; turning it on again is immediate", async () => {
    const { isolation } = setup();
    await isolation.setEnabled({ botId: "claude", enabled: false });
    isolation.denyOff(isolation.pendingOffs()[0]?.requestId ?? "");
    expect((await isolation.get({ botId: "claude" })).state).toBe("active");
    await isolation.setEnabled({ botId: "claude", enabled: false });
    isolation.allowOff(isolation.pendingOffs()[0]?.requestId ?? "");
    const back = await isolation.setEnabled({ botId: "claude", enabled: true });
    expect(back).toMatchObject({ offRequested: false, isolation: { state: "active" } });
  });

  it("a computer that cannot isolate shows 'unavailable' with the reason (W8-11)", async () => {
    const { isolation, events } = setup();
    isolation.setAvailability({
      checkedAt: null,
      mechanism: "none",
      jobObject: { ok: false, reason: "Windows only." },
      appContainer: { ok: false, reason: "Windows only." },
      windows: null,
    });
    expect((await isolation.get({ botId: "claude" })).state).toBe("unavailable");
    expect((await isolation.getAvailability()).jobObject.reason).toBe("Windows only.");
    expect(events.at(-1)).toMatchObject({ type: "isolation-changed", availability: { mechanism: "none" } });
  });
});
