import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { expect, it } from "vitest";
import { createMockOpenBot } from "../stories/mock-openbot";
import { App } from "./App";

it("reloads the conversation after switching the active thread", async () => {
  window.localStorage.clear();
  const previous = window.openbot;
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  try {
    const view = render(() => <App />);
    const bot = (await mock.api.agent.listBots())[0];
    if (!bot || !mock.api.threads) throw new Error("Missing demo agent");
    const original = await mock.api.agent.readConversation(bot.id);
    const created = await mock.api.threads.create({ botId: bot.id, title: "Separate history" });
    await waitFor(() => expect(screen.getByText("Threads: Separate history")).toBeInTheDocument());
    await fireEvent.click(screen.getByText("Threads: Separate history"));
    expect((await mock.api.agent.readConversation(bot.id)).messages).toEqual([]);
    if (!original.threadId) throw new Error("Missing original thread");
    await mock.api.threads.select({ botId: bot.id, threadId: original.threadId });
    await waitFor(() => expect(screen.queryByText("Threads: Separate history")).toBeNull());
    expect((await mock.api.agent.readConversation(bot.id)).messages).toEqual(original.messages);
    expect(created.activeThreadId).not.toBe(original.threadId);
    view.unmount();
  } finally {
    mock.dispose();
    window.openbot = previous;
  }
});
