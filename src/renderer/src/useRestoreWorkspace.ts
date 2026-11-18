import { APP_PAGE_IDS, type AppPageId } from "@openbot/contracts/ipc";
import { type Accessor, createEffect, onCleanup } from "solid-js";

export interface WorkspacePlace {
  page: string;
  botId: string;
  threadId: string | null;
}

const isAppPage = (page: string): page is AppPageId => APP_PAGE_IDS.some((id) => id === page);

/**
 * "Restore the last workspace on launch" (window.openbot.appSettings, the `workspace` part). Once the agents are loaded it reads where the
 * person was and opens that page, agent and thread when the setting is on (the engine drops an agent that no longer exists, and `hasBot` /
 * `hasThread` are a second check). From then on it writes the place on every change of page, agent or thread, a short time after the last
 * change. Coordinate here — do not also write workspace.last from Conversation/ThreadPanel.
 */
export function useRestoreWorkspace(options: {
  ready: Accessor<boolean>;
  place: Accessor<WorkspacePlace>;
  hasBot: (botId: string) => boolean;
  hasThread?: (botId: string, threadId: string) => boolean;
  open: (place: { page: AppPageId | null; botId: string | null; threadId: string | null }) => void;
  delayMs?: number;
}): void {
  let restored = false;
  let started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  createEffect(
    () => options.ready(),
    (ready) => {
      if (!ready || started) return;
      started = true;
      const api = window.openbot?.appSettings;
      if (!api) {
        restored = true;
        return;
      }
      void api
        .get()
        .then((settings) => {
          const last = settings.workspace.last;
          if (settings.workspace.restore && last) {
            const botId = last.botId && options.hasBot(last.botId) ? last.botId : null;
            const threadId =
              botId && last.threadId && (options.hasThread?.(botId, last.threadId) ?? true) ? last.threadId : null;
            options.open({
              page: last.page,
              botId,
              threadId,
            });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          restored = true;
        });
    },
  );

  createEffect(
    () => options.place(),
    (place) => {
      const page = place.page;
      if (!restored || !isAppPage(page)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void window.openbot?.appSettings
          ?.update({
            workspace: {
              last: {
                page,
                botId: place.botId || null,
                threadId: place.botId && place.threadId ? place.threadId : null,
              },
            },
          })
          .catch(() => undefined);
      }, options.delayMs ?? 500);
    },
  );

  onCleanup(() => clearTimeout(timer));
}
