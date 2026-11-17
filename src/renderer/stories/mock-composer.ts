// COSGRAL W11 (U3-U6): the search, the message box and the thread tabs for Storybook and the preview. Demo data only; nothing is
// contacted. The same rules as the program: a search is checked and trimmed, hits are cut to the limits, a side question answers
// through `side-question-changed` and never touches the chat, tabs are never created for unknown threads. `simulate` plays the answer.

import {
  type AgentEvent,
  type ComposerDesktopApi,
  clipSearchHit,
  clipSideAnswer,
  closeTabs,
  filterSlashCommands,
  isTabPermutation,
  type MentionCandidate,
  openTab,
  parseBotIdInput,
  parseCloseThreadTabsInput,
  parseReorderThreadTabsInput,
  parseSearchInput,
  parseSearchMentionsInput,
  parseSideQuestionIdInput,
  parseSideQuestionInput,
  parseThreadTabInput,
  type SearchDesktopApi,
  type SearchHit,
  type SideQuestionState,
  type SlashCommand,
  type ThreadTabs,
  type ThreadTabsDesktopApi,
} from "@openbot/contracts/ipc";

const DEMO_HITS: SearchHit[] = [
  { kind: "agents", id: "chief", title: "Chief", snippet: "", botId: "chief" },
  { kind: "agents", id: "research", title: "Research", snippet: "", botId: "research" },
  { kind: "channels", id: "launch", title: "Launch plan", snippet: "Lead: Chief", channelId: "launch" },
  {
    kind: "messages",
    id: "m-1",
    title: "Chief",
    snippet: "…the launch plan needs a second review…",
    botId: "chief",
    threadId: "t-1",
    messageId: "m-1",
  },
  { kind: "files", id: "f-1", title: "launch-plan.md", snippet: "Library" },
  { kind: "routines", id: "r-1", title: "Morning brief", snippet: "Every day at 08:00", botId: "research" },
];

const DEMO_COMMANDS: SlashCommand[] = [
  { name: "compact", hint: "Shorten the conversation to free context", kind: "program" },
  { name: "new-thread", hint: "Start an empty thread", kind: "program" },
  { name: "side", hint: "Ask a side question", kind: "program" },
  { name: "weekly-report", hint: "Write the weekly report", kind: "skill" },
];

const DEMO_MENTIONS: MentionCandidate[] = [
  { kind: "agent", id: "research", label: "Research", detail: "Finds sources" },
  { kind: "agent", id: "writer", label: "Writer", detail: "Drafts texts" },
  { kind: "channel", id: "launch", label: "Launch plan", detail: "Channel" },
  { kind: "file", id: "f-1", label: "launch-plan.md", detail: "Library" },
];

export function createMockSearch(): SearchDesktopApi {
  return {
    query: async (raw) => {
      const { q, kinds, limit } = parseSearchInput(raw);
      const needle = q.toLowerCase();
      const hits: SearchHit[] = [];
      let truncated = false;
      for (const kind of kinds) {
        const matches = DEMO_HITS.filter(
          (hit) => hit.kind === kind && `${hit.title} ${hit.snippet}`.toLowerCase().includes(needle),
        );
        if (matches.length > limit) truncated = true;
        hits.push(...matches.slice(0, limit).map(clipSearchHit));
      }
      return { q, hits, truncated };
    },
  };
}

export interface MockComposer extends Required<ComposerDesktopApi> {
  simulate: {
    /** The answer grows (the whole text so far) and, with `done`, ends. */
    answer: (questionId: string, text: string, done?: boolean) => void;
    /** The side question failed. */
    fail: (questionId: string, reason: string) => void;
  };
}

export function createMockComposer(emit: (event: AgentEvent) => void): MockComposer {
  let counter = 0;
  const questions = new Map<string, SideQuestionState>();
  const publish = (state: SideQuestionState): SideQuestionState => {
    questions.set(state.questionId, state);
    emit({ type: "side-question-changed", state: structuredClone(state) });
    return structuredClone(state);
  };
  const get = (questionId: string): SideQuestionState => {
    const state = questions.get(questionId);
    if (!state) throw new Error("This side question does not exist.");
    return state;
  };
  return {
    askSideQuestion: async (raw) => {
      const input = parseSideQuestionInput(raw);
      counter += 1;
      return publish({
        questionId: `side-${counter}`,
        botId: input.botId,
        threadId: input.threadId ?? null,
        question: input.text,
        status: "running",
        answer: "",
        error: null,
        startedAt: new Date(Date.parse("2026-11-17T12:00:00.000Z") + counter * 1000).toISOString(),
      });
    },
    cancelSideQuestion: async (raw) => {
      const state = get(parseSideQuestionIdInput(raw).questionId);
      return state.status === "running" ? publish({ ...state, status: "cancelled" }) : structuredClone(state);
    },
    listSlashCommands: async (raw) => {
      parseBotIdInput(raw);
      return filterSlashCommands(DEMO_COMMANDS, "");
    },
    searchMentions: async (raw) => {
      const { q, limit } = parseSearchMentionsInput(raw);
      const needle = q.toLowerCase();
      return DEMO_MENTIONS.filter((candidate) => candidate.label.toLowerCase().includes(needle)).slice(0, limit);
    },
    simulate: {
      answer: (questionId, text, done = false) => {
        const state = get(questionId);
        if (state.status !== "running") return;
        publish({ ...state, answer: clipSideAnswer(text), status: done ? "done" : "running" });
      },
      fail: (questionId, reason) => {
        const state = get(questionId);
        if (state.status === "running") publish({ ...state, status: "failed", error: reason });
      },
    },
  };
}

export interface MockThreadTabs extends Required<ThreadTabsDesktopApi> {
  /** The threads that exist (and may become tabs), per agent: set by the story. */
  simulate: { setThreads: (botId: string, threadIds: string[]) => void };
}

export function createMockThreadTabs(emit: (event: AgentEvent) => void): MockThreadTabs {
  const open = new Map<string, string[]>();
  const threads = new Map<string, string[]>([["chief", ["t-1", "t-2", "t-3", "t-4"]]]);
  const state = (botId: string): ThreadTabs => ({ botId, open: [...(open.get(botId) ?? [])] });
  const publish = (botId: string): ThreadTabs => {
    const tabs = state(botId);
    emit({ type: "thread-tabs-changed", ...tabs });
    return tabs;
  };
  return {
    get: async (raw) => state(parseBotIdInput(raw).botId),
    open: async (raw) => {
      const { botId, threadId } = parseThreadTabInput(raw);
      if (!(threads.get(botId) ?? []).includes(threadId)) throw new Error("This thread does not exist.");
      const before = open.get(botId) ?? [];
      const after = openTab(before, threadId);
      if (after.join() === before.join()) return state(botId);
      open.set(botId, after);
      return publish(botId);
    },
    close: async (raw) => {
      const input = parseCloseThreadTabsInput(raw);
      const before = open.get(input.botId) ?? [];
      const after = closeTabs(before, input.threadId, input.mode);
      if (after.join() === before.join()) return state(input.botId);
      open.set(input.botId, after);
      return publish(input.botId);
    },
    reorder: async (raw) => {
      const input = parseReorderThreadTabsInput(raw);
      const before = open.get(input.botId) ?? [];
      if (!isTabPermutation(before, input.threadIds))
        throw new Error("The new order must hold the same open tabs, each once.");
      open.set(input.botId, input.threadIds);
      return publish(input.botId);
    },
    simulate: { setThreads: (botId, threadIds) => void threads.set(botId, threadIds) },
  };
}
