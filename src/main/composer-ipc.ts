// COSGRAL W11 (U3-U6): the `search:*`, `composer:*` and `thread-tabs:*` IPC (this computer only). The order of every call: the server
// is checked first, then the request is parsed by the contract (a wrong request is refused before anything else), and only then
// the engine is asked. The thread tabs need the active threads of an agent, which the thread store answers asynchronously: before
// each call the list is read once and handed to the engine (which also learns of every change from `threads-changed`).

import {
  IPC_CHANNELS,
  parseBotIdInput,
  parseCloseThreadTabsInput,
  parseReorderThreadTabsInput,
  parseSearchInput,
  parseSearchMentionsInput,
  parseSideQuestionIdInput,
  parseSideQuestionInput,
  parseThreadTabInput,
  type ThreadList,
} from "@openbot/contracts/ipc";
import type { ComposerService } from "../backend/composer-service";
import type { SearchService } from "../backend/search-service";
import type { ThreadTabsService } from "../backend/thread-tabs";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export interface ComposerIpcDeps {
  search: () => SearchService | null;
  composer: () => ComposerService | null;
  tabs: () => ThreadTabsService | null;
  /** The threads of an agent (the thread store's own list). */
  threads: (botId: string) => Promise<ThreadList>;
}

export function registerComposerIpc(deps: ComposerIpcDeps): void {
  const need = <T>(value: T | null): T => {
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  /** Server check, then parse, then the engine. */
  const handle = <T, R>(channel: string, parse: (payload: unknown) => T, work: (parsed: T) => R): void =>
    handleTrusted(channel, (input: unknown) => {
      const request = parseAgentRequest(input);
      if (request.serverId !== "local") throw new Error("This is available on this computer only.");
      return work(parse(request.payload));
    });

  handle(IPC_CHANNELS.searchQuery, parseSearchInput, (parsed) => need(deps.search()).query(parsed));
  handle(IPC_CHANNELS.composerAskSideQuestion, parseSideQuestionInput, (parsed) =>
    need(deps.composer()).askSideQuestion(parsed),
  );
  handle(IPC_CHANNELS.composerCancelSideQuestion, parseSideQuestionIdInput, (parsed) =>
    need(deps.composer()).cancelSideQuestion(parsed),
  );
  handle(IPC_CHANNELS.composerListSlashCommands, parseBotIdInput, (parsed) =>
    need(deps.composer()).listSlashCommands(parsed),
  );
  handle(IPC_CHANNELS.composerSearchMentions, parseSearchMentionsInput, (parsed) =>
    need(deps.composer()).searchMentions(parsed),
  );

  const tabs = <T extends { botId: string }, R>(
    channel: string,
    parse: (payload: unknown) => T,
    work: (service: ThreadTabsService, parsed: T) => R,
  ): void =>
    handle(channel, parse, async (parsed) => {
      const service = need(deps.tabs());
      service.learn(await deps.threads(parsed.botId));
      return work(service, parsed);
    });
  tabs(IPC_CHANNELS.threadTabsGet, parseBotIdInput, (service, parsed) => service.get(parsed.botId));
  tabs(IPC_CHANNELS.threadTabsOpen, parseThreadTabInput, (service, parsed) => service.open(parsed));
  tabs(IPC_CHANNELS.threadTabsClose, parseCloseThreadTabsInput, (service, parsed) => service.close(parsed));
  tabs(IPC_CHANNELS.threadTabsReorder, parseReorderThreadTabsInput, (service, parsed) => service.reorder(parsed));
}
