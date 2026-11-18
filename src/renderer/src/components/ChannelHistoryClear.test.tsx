import type { ChannelHistoryCleared } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { ChannelHistoryClear } from "./ChannelHistoryClear";

afterEach(cleanup);

const result: ChannelHistoryCleared = { channelId: "c1", removedMessages: 4, removedTasks: 2 };

it("asks first and clears nothing until the person says yes", async () => {
  const onClear = vi.fn().mockResolvedValue(result);
  render(() => <ChannelHistoryClear onClear={onClear} />);
  fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
  expect(
    await screen.findByText("Clear the whole history of this channel? This cannot be undone."),
  ).toBeInTheDocument();
  expect(onClear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Clear history" })).toBeInTheDocument());
  expect(onClear).not.toHaveBeenCalled();
});

it("clears after yes and says how much was removed", async () => {
  const onClear = vi.fn().mockResolvedValue(result);
  render(() => <ChannelHistoryClear onClear={onClear} />);
  fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
  fireEvent.click(await screen.findByRole("button", { name: "Yes, clear" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Removed 4 messages and 2 tasks."));
  expect(onClear).toHaveBeenCalledTimes(1);
});

it("shows the sentence of the refusal as it comes and keeps going", async () => {
  const refusal = "This channel has 1 task in progress or paused. Stop or archive it first.";
  const onClear = vi.fn().mockRejectedValue(new Error(refusal));
  render(() => <ChannelHistoryClear onClear={onClear} />);
  fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
  fireEvent.click(await screen.findByRole("button", { name: "Yes, clear" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(refusal));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Clear history" })).toBeEnabled());
});
