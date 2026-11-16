import type { AgentEvent } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { createMockContext } from "../../stories/mock-context";
import { ContextIndicator, ContextMeter } from "./ContextIndicator";
import { ContextSettingsSection } from "./ContextSettingsSection";

function fixture() {
  const listeners = new Set<(event: AgentEvent) => void>();
  const api = createMockContext((event) =>
    listeners.forEach((listener) => {
      listener(event);
    }),
  );
  const onEvent = (listener: (event: AgentEvent) => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return { api, onEvent };
}
describe("conversation context controls", () => {
  it("shows unavailable reason without percentages or a progress bar", async () => {
    const { api, onEvent } = fixture();
    api.simulate.silent("chief", "one", "This provider reports no context data.", false);
    render(() => <ContextIndicator botId="chief" threadId="one" api={api} onEvent={onEvent} />);
    const r = within(await screen.findByRole("region", { name: "Conversation context" }));
    expect(r.getByText(/This provider reports no context data/)).toBeInTheDocument();
    expect(r.queryByRole("progressbar")).toBeNull();
    expect(r.queryByRole("button", { name: "Compact" })).toBeNull();
    expect(screen.getByRole("region", { name: "Conversation context" })).not.toHaveTextContent("%");
  });
  it("renders only reported counts and warns at eighty percent", async () => {
    const { api, onEvent } = fixture();
    api.simulate.report("chief", "one", 8000, 10000);
    render(() => <ContextIndicator botId="chief" threadId="one" api={api} onEvent={onEvent} />);
    await screen.findByRole("progressbar");
    expect(screen.getByText("8,000 / 10,000 tokens (80%)")).toBeInTheDocument();
    expect(screen.getByText("Context is getting full")).toBeInTheDocument();
  });
  it("compacts only on click, blocks repeat requests and retains stale counts/history", async () => {
    const { api, onEvent } = fixture();
    api.simulate.report("chief", "one", 5000, 10000);
    const compact = vi.spyOn(api, "compact");
    render(() => <ContextIndicator botId="chief" threadId="one" api={api} onEvent={onEvent} />);
    const button = await screen.findByRole("button", { name: "Compact" });
    expect(compact).not.toHaveBeenCalled();
    await fireEvent.click(button);
    await screen.findByText(/Compacting context/);
    expect(button).toBeDisabled();
    api.simulate.finishCompaction("chief", "one");
    await screen.findByText(/Last reported numbers/);
    expect(screen.getByText(/Compactions: 1/)).toHaveTextContent("Last compacted:");
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "50");
    await waitFor(() => expect(button).toBeEnabled());
  });
  it("ignores events from other threads and agents", async () => {
    const { api, onEvent } = fixture();
    api.simulate.report("chief", "one", 2000, 10000);
    render(() => <ContextIndicator botId="chief" threadId="one" api={api} onEvent={onEvent} />);
    await screen.findByText("2,000 / 10,000 tokens (20%)");
    api.simulate.report("chief", "two", 9000, 10000);
    api.simulate.report("scout", "one", 9000, 10000);
    expect(screen.queryByText("Context is getting full")).toBeNull();
  });
  it("changes the requested thread without showing the previous thread's numbers", async () => {
    const { api, onEvent } = fixture();
    api.simulate.report("chief", "one", 2000, 10000);
    api.simulate.silent("chief", "two", "No report in this thread.", false);
    const [thread, setThread] = createSignal("one");
    render(() => <ContextIndicator botId="chief" threadId={thread()} api={api} onEvent={onEvent} />);
    await screen.findByRole("progressbar");
    setThread("two");
    await screen.findByText(/No report in this thread/);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("does not display estimated percentages as provider reports", async () => {
    const { api } = fixture();
    api.simulate.report("chief", "one", 2500, 10000);
    const state = { ...(await api.getState({ botId: "chief", threadId: "one" })), source: "estimated" as const };
    render(() => <ContextMeter state={state} onCompact={() => {}} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("region", { name: "Conversation context" })).not.toHaveTextContent("%");
  });
  it("shows a compact failure and leaves retry available", async () => {
    const { api, onEvent } = fixture();
    api.simulate.report("chief", "one", 2500, 10000);
    vi.spyOn(api, "compact").mockRejectedValue(new Error("Demo compaction failed."));
    render(() => <ContextIndicator botId="chief" threadId="one" api={api} onEvent={onEvent} />);
    await fireEvent.click(await screen.findByRole("button", { name: "Compact" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Compact" })).toBeEnabled();
  });
  it("loads default settings and saves the switch with a valid threshold", async () => {
    const { api, onEvent } = fixture();
    render(() => <ContextSettingsSection api={api} onEvent={onEvent} />);
    const threshold = await screen.findByLabelText("Compaction threshold (%)");
    expect(threshold).toHaveValue(90);
    await fireEvent.click(screen.getByRole("switch", { name: "Automatically compact context" }));
    await fireEvent.input(threshold, { target: { value: "85" } });
    await fireEvent.click(screen.getByRole("button", { name: "Save context settings" }));
    await screen.findByText("Context settings saved.");
    expect(await api.getSettings()).toEqual({ autoCompact: false, thresholdPercent: 85 });
  });
  it("rejects an out-of-range or fractional threshold without saving", async () => {
    const { api, onEvent } = fixture();
    const update = vi.spyOn(api, "updateSettings");
    render(() => <ContextSettingsSection api={api} onEvent={onEvent} />);
    const input = await screen.findByLabelText("Compaction threshold (%)");
    for (const value of ["49", "96", "75.5"]) {
      await fireEvent.input(input, { target: { value } });
      await fireEvent.click(screen.getByRole("button", { name: "Save context settings" }));
      await screen.findByRole("alert");
    }
    expect(update).not.toHaveBeenCalled();
  });
});
