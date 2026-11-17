import type { AgentEvent, SideQuestionState, SlashCommand } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SideQuestionPanel } from "./SideQuestionPanel";
import { SkillQuickPick } from "./SkillQuickPick";

function state(patch: Partial<SideQuestionState>): SideQuestionState {
  return {
    questionId: "q1",
    botId: "bot",
    threadId: null,
    question: "What now?",
    status: "running",
    answer: "",
    error: null,
    startedAt: "2026-11-17T12:00:00.000Z",
    ...patch,
  };
}

let emit: (event: AgentEvent) => void = () => undefined;
const askSideQuestion = vi.fn(async () => state({}));
const cancelSideQuestion = vi.fn(async () => state({ status: "cancelled" }));
const listSlashCommands = vi.fn(
  async (): Promise<SlashCommand[]> => [
    { name: "compact", hint: "Shorten the context", kind: "program" },
    { name: "research", hint: "Look things up", kind: "skill" },
  ],
);

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(window, {
    openbot: {
      composer: { askSideQuestion, cancelSideQuestion, listSlashCommands },
      agent: {
        onEvent: (listener: (event: AgentEvent) => void) => {
          emit = listener;
          return () => undefined;
        },
      },
    },
  });
});
afterEach(cleanup);

it("asks, shows the running state with Stop and then the answer", async () => {
  render(() => <SideQuestionPanel botId="bot" onClose={vi.fn()} />);
  const box = screen.getByRole("textbox", { name: "Side question" });
  await fireEvent.input(box, { target: { value: "What now?" } });
  await fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await waitFor(() => expect(askSideQuestion).toHaveBeenCalledWith({ botId: "bot", text: "What now?" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Thinking…");
  expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
  emit({ type: "side-question-changed", state: state({ status: "done", answer: "Ship it." }) });
  expect(await screen.findByText("Ship it.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Stop" })).not.toBeInTheDocument();
});

it("says why it failed (not connected) instead of staying silent", async () => {
  askSideQuestion.mockResolvedValueOnce(
    state({ status: "failed", error: "Side questions are not connected to an agent yet." }),
  );
  render(() => <SideQuestionPanel botId="bot" onClose={vi.fn()} />);
  await fireEvent.input(screen.getByRole("textbox", { name: "Side question" }), { target: { value: "Hi" } });
  await fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("not connected");
  expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
});

it("ignores answers of another agent", async () => {
  render(() => <SideQuestionPanel botId="bot" onClose={vi.fn()} />);
  emit({ type: "side-question-changed", state: state({ botId: "other", status: "done", answer: "Not mine" }) });
  expect(screen.queryByText("Not mine")).not.toBeInTheDocument();
});

it("lists only skills and hands the chosen one back", async () => {
  const onPick = vi.fn();
  render(() => <SkillQuickPick botId="bot" onPick={onPick} />);
  expect(await screen.findByRole("button", { name: /research/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /compact/ })).not.toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: /research/ }));
  expect(onPick).toHaveBeenCalledWith({ name: "research", hint: "Look things up", kind: "skill" });
});

it("says so when there is no composer contract", async () => {
  Object.assign(window, { openbot: {} });
  render(() => <SkillQuickPick botId="bot" onPick={vi.fn()} />);
  expect(screen.getByText("Skills are not available in this version.")).toBeInTheDocument();
});
