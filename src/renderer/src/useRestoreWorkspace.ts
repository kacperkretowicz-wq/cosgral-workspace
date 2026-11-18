import { APP_PAGE_IDS, type AppPageId } from "@openbot/contracts/ipc";
import { type Accessor, createEffect, onCleanup } from "solid-js";

export interface WorkspacePlace {
  page: string;
  botId: string;
}

const isAppPage = (page: string): page is AppPageId => APP_PAGE_IDS.some((id) => id === page);

/**
 * "Restore the last workspace on launch" (window.openbot.appSettings, the `workspace` part). Once the agents are loaded it reads where the
 * person was and opens that page and agent when the setting is on (the engine drops an agent that no longer exists, and `hasBot` is a
 * second check). From then on it writes the place on every change of page or agent, a short time after the last change. The thread is not
 * remembered yet: only the page and the agent.
 */
export function useRestoreWorkspace(options: {
  ready: Accessor<boolean>;
  place: Accessor<WorkspacePlace>;
  hasBot: (botId: string) => boolean;
  open: (place: { page: AppPageId | null; botId: string | null }) => void;
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
            options.open({
              page: last.page,
              botId: last.botId && options.hasBot(last.botId) ? last.botId : null,
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
            workspace: { last: { page, botId: place.botId || null, threadId: null } },
          })
          .catch(() => undefined);
      }, options.delayMs ?? 500);
    },
  );

  onCleanup(() => clearTimeout(timer));
}
