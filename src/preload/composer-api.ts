// COSGRAL W11 (U3-U6): the window APIs of the search, the message box and the thread tabs. Answers are checked with the contract guards.

import {
  type ComposerDesktopApi,
  IPC_CHANNELS,
  isMentionCandidate,
  isSearchResult,
  isSideQuestionState,
  isSlashCommand,
  isThreadTabs,
  type MentionCandidate,
  type SearchDesktopApi,
  type SideQuestionState,
  type SlashCommand,
  type ThreadTabs,
  type ThreadTabsDesktopApi,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createSearchApi(invoke: Invoke): SearchDesktopApi {
  return {
    query: (input) =>
      invoke(IPC_CHANNELS.searchQuery, input, (value) => {
        if (!isSearchResult(value)) throw new Error("Invalid search result.");
        return value;
      }),
  };
}

export function createComposerApi(invoke: Invoke): ComposerDesktopApi {
  return {
    askSideQuestion: (input) => invoke(IPC_CHANNELS.composerAskSideQuestion, input, decodeSideQuestion),
    cancelSideQuestion: (input) => invoke(IPC_CHANNELS.composerCancelSideQuestion, input, decodeSideQuestion),
    listSlashCommands: (input) => invoke(IPC_CHANNELS.composerListSlashCommands, input, decodeSlashCommands),
    searchMentions: (input) => invoke(IPC_CHANNELS.composerSearchMentions, input, decodeMentions),
  };
}

export function createThreadTabsApi(invoke: Invoke): ThreadTabsDesktopApi {
  return {
    get: (input) => invoke(IPC_CHANNELS.threadTabsGet, input, decodeTabs),
    open: (input) => invoke(IPC_CHANNELS.threadTabsOpen, input, decodeTabs),
    close: (input) => invoke(IPC_CHANNELS.threadTabsClose, input, decodeTabs),
    reorder: (input) => invoke(IPC_CHANNELS.threadTabsReorder, input, decodeTabs),
  };
}

function decodeSideQuestion(value: unknown): SideQuestionState {
  if (!isSideQuestionState(value)) throw new Error("Invalid side question.");
  return value;
}

function decodeSlashCommands(value: unknown): SlashCommand[] {
  if (!Array.isArray(value) || !value.every(isSlashCommand)) throw new Error("Invalid slash commands.");
  return value;
}

function decodeMentions(value: unknown): MentionCandidate[] {
  if (!Array.isArray(value) || !value.every(isMentionCandidate)) throw new Error("Invalid mention candidates.");
  return value;
}

function decodeTabs(value: unknown): ThreadTabs {
  if (!isThreadTabs(value)) throw new Error("Invalid thread tabs.");
  return value;
}
