// COSGRAL W3: the Dynamic Island window (`#island`). A working minimal view on the island contract; the UI Designer
// owns the final look. A click opens the main window at the Needs you card.

import { emptyIslandState, type IslandState, type IslandStatusKind } from "@openbot/contracts/ipc";
import { createSignal, flush, onSettled, Show } from "solid-js";

const LABELS: Record<IslandStatusKind, string> = {
  takeover: "Take over",
  approval: "Approval",
  question: "Question",
  error: "Error",
  message: "Message",
  working: "Working",
};

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
          <button type="button" class="island-main" onClick={() => void window.openbot.island?.activate()}>
            <span class="island-kind">{LABELS[status().kind]}</span>
            <span class="island-text">
              <strong>{status().botName}</strong> {status().summary}
            </span>
            <Show when={state().waiting > 1}>
              <span class="island-count">{state().waiting}</span>
            </Show>
          </button>
          <Show when={status().kind === "message" || status().kind === "error"}>
            <button
              type="button"
              class="island-dismiss"
              title="Dismiss"
              onClick={() => void window.openbot.island?.dismiss().then(setState)}
            >
              ×
            </button>
          </Show>
        </div>
      )}
    </Show>
  );
}
