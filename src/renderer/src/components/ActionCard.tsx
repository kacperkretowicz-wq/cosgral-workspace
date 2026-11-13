import type { RespondToBrowserTakeoverInput, RespondToDraftPreviewInput } from "@openbot/contracts/ipc";
import { createEffect, createSignal, Show } from "solid-js";
import type { PendingCard } from "../pending-cards";

type Action = Extract<PendingCard, { kind: "draft-preview" | "browser-takeover" }>;
export function ActionCard(props: {
  card: Action;
  onDraft: (input: RespondToDraftPreviewInput) => Promise<void>;
  onTakeover: (input: RespondToBrowserTakeoverInput) => Promise<void>;
}) {
  const [editing, setEditing] = createSignal(false);
  const [text, setText] = createSignal("");
  createEffect(
    () => props.card,
    (card) => {
      setEditing(false);
      setText(card.kind === "draft-preview" ? card.card.preview : "");
    },
  );
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  async function run(action: () => Promise<void>) {
    if (busy()) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div class="action-card">
      <Show when={props.card.kind === "draft-preview" ? props.card : undefined}>
        {(item) => (
          <>
            <strong>{item().card.title}</strong>
            <Show when={item().card.recipient}>
              <div>
                To: <span>{item().card.recipient}</span>
              </div>
            </Show>
            <Show when={item().card.channel}>
              <div>Via: {item().card.channel}</div>
            </Show>
            <Show when={editing()} fallback={<pre class="action-card-preview">{item().card.preview}</pre>}>
              <label>
                Draft text
                <textarea aria-label="Draft text" value={text()} onInput={(e) => setText(e.currentTarget.value)} />
              </label>
            </Show>
            <div class="action-card-buttons">
              <Show
                when={!editing()}
                fallback={
                  <>
                    <button
                      disabled={busy()}
                      onClick={() =>
                        void run(() => props.onDraft({ requestId: item().requestId, decision: "edit", text: text() }))
                      }
                    >
                      Request revision
                    </button>
                    <button onClick={() => setEditing(false)}>Back</button>
                  </>
                }
              >
                <button
                  disabled={busy()}
                  onClick={() => void run(() => props.onDraft({ requestId: item().requestId, decision: "send" }))}
                >
                  {item().card.variant === "draft" ? "Send" : "Confirm"}
                </button>
                <button disabled={busy()} onClick={() => setEditing(true)}>
                  Edit
                </button>
                <button
                  disabled={busy()}
                  onClick={() => void run(() => props.onDraft({ requestId: item().requestId, decision: "keep-draft" }))}
                >
                  {item().card.variant === "draft" ? "Keep draft" : "Cancel"}
                </button>
              </Show>
            </div>
          </>
        )}
      </Show>
      <Show when={props.card.kind === "browser-takeover" ? props.card : undefined}>
        {(item) => (
          <>
            <strong>Browser help requested</strong>
            <p>{item().request.reason}</p>
            <p>{item().request.url}</p>
            <div class="action-card-buttons">
              <Show
                when={item().phase === "taken-over"}
                fallback={
                  <>
                    <button
                      disabled={busy()}
                      onClick={() =>
                        void run(() => props.onTakeover({ requestId: item().requestId, action: "take-over" }))
                      }
                    >
                      Take over
                    </button>
                    <button
                      disabled={busy()}
                      onClick={() =>
                        void run(() => props.onTakeover({ requestId: item().requestId, action: "decline" }))
                      }
                    >
                      Decline
                    </button>
                  </>
                }
              >
                <button
                  disabled={busy()}
                  onClick={() => void run(() => props.onTakeover({ requestId: item().requestId, action: "return" }))}
                >
                  Return to agent
                </button>
              </Show>
            </div>
          </>
        )}
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </div>
  );
}
