import { Button } from "../components/ui";
// COSGRAL W3: the Dynamic Island window (`#island`). A working minimal view on the island contract; the UI Designer
// owns the final look. A click opens the main window at the Needs you card.

import { emptyIslandState, type IslandState, type IslandStatusKind } from "@openbot/contracts/ipc";
import { createSignal, flush, onSettled, Show } from "solid-js";
import { t } from "../i18n";

function islandLabel(kind: IslandStatusKind): string {
  switch (kind) {
    case "takeover":
      return t("Take over");
    case "approval":
      return t("Approval");
    case "question":
      return t("Question");
    case "error":
      return t("Error");
    case "message":
      return t("Message");
    case "working":
      return t("Working");
  }
}

export function IslandApp() {
  const [state, setState] = createSignal<IslandState>(emptyIslandState());

  onSettled(() => {
    document.documentElement.classList.add("is-island");
    const unsubscribe = window.openbot.agent.onEvent((event) => {
      if (event.type === "island-changed") flush(() => setState(event.state));
    });
    void window.openbot.island?.getState().then(setState);
    return unsubscribe;
  });

  return (
    <Show when={state().status}>
      {(status) => (
        <div class={`island is-${status().kind}`} data-testid="island">
          <Button unstyled type="button" class="island-main" onClick={() => void window.openbot.island?.activate()}>
            <span class="island-kind">{islandLabel(status().kind)}</span>
            <span class="island-text">
              <strong>{status().botName}</strong> {status().summary}
            </span>
            <Show when={state().waiting > 1}>
              <span class="island-count">{state().waiting}</span>
            </Show>
          </Button>
          <Show when={status().kind === "message" || status().kind === "error"}>
            <Button
              unstyled
              type="button"
              class="island-dismiss"
              title={t("Dismiss")}
              onClick={() => void window.openbot.island?.dismiss().then(setState)}
            >
              ×
            </Button>
          </Show>
        </div>
      )}
    </Show>
  );
}
