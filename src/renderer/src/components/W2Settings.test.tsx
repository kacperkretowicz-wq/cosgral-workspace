import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { AgentMemorySettingsView, ChannelMemorySettingsView } from "./MemorySettings";
import { McpSettings } from "./McpSettings";

describe("W2 settings with mock API", () => {
  it("saves agent and channel memories and updates after events", async () => {
    const mock = createMockOpenBot();
    Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
    const view = render(() => (
      <>
        <AgentMemorySettingsView botId="chief" />
        <ChannelMemorySettingsView channelId="demo-channel" />
      </>
    ));
    await screen.findByText("Prefers concise updates.");
    const channel = within(screen.getByRole("region", { name: "Channel memory" }));
    await channel.findByText("The team meets on Monday.");
    await fireEvent.input(channel.getByLabelText("Memory text"), { target: { value: "Review on Friday" } });
    await fireEvent.click(channel.getByRole("button", { name: "Save memory" }));
    await channel.findByText("Review on Friday");
    await mock.api.memory!.saveAgentMemory({ botId: "chief", text: "External change" });
    await screen.findByText("External change");
    view.unmount();
    mock.dispose();
  });
  it("changes the per-agent MCP switch", async () => {
    const mock = createMockOpenBot();
    Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
    const view = render(() => <McpSettings botId="chief" />);
    const toggle = await screen.findByRole("checkbox", { name: "Enabled for this agent" });
    expect(toggle).toBeChecked();
    await fireEvent.click(toggle);
    await waitFor(async () => expect((await mock.api.mcp!.listAgentSettings("chief"))[0]?.enabled).toBe(false));
    view.unmount();
    mock.dispose();
  });
  it("keeps MCP secrets write-only and restores a skill as a new version", async () => {
    const mock = createMockOpenBot();
    const server = await mock.api.mcp!.add({
      name: "remote",
      transport: "http",
      url: "http://localhost:1234",
      secrets: { Authorization: "demo-only" },
    });
    expect(server.secretNames).toEqual(["Authorization"]);
    expect(JSON.stringify(await mock.api.mcp!.list())).not.toContain("demo-only");
    const restored = await mock.api.skills!.restoreVersion({ skillId: "skill-demo", version: 1 });
    expect(restored.version).toBe(3);
    expect((await mock.api.skills!.listInstalls({ botId: "chief" }))[0]?.installedVersion).toBe(1);
    mock.dispose();
  });
});
