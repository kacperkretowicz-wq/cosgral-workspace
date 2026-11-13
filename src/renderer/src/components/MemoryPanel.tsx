import type { AgentMemorySettings, MemoryInclusion } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
type Entry = { id: string; text: string; inclusion?: MemoryInclusion };
export function MemoryPanel(props: {
  entries: Entry[];
  settings?: AgentMemorySettings;
  channel?: boolean;
  onSave: (text: string, inclusion: MemoryInclusion, id?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSearch?: (query: string) => void;
  onLimit?: (limit: number | null) => Promise<void>;
}) {
  const [text, setText] = createSignal("");
  const [inclusion, setInclusion] = createSignal<MemoryInclusion>("searchable");
  const [editing, setEditing] = createSignal<string>();
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update memory.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="w2-panel" aria-label={props.channel ? "Channel memory" : "Agent memory"}>
      <h3>{props.channel ? "Channel memory" : "Memory"}</h3>
      <Show when={props.settings}>
        {(s) => (
          <>
            <p>
              {s().essentialCount + s().searchableCount} / {s().maxMemories} memories · {s().essentialPromptBytes} /
              8192 bytes in always-on prompt
            </p>
            <label>
              Memory limit{" "}
              <input
                type="number"
                min="0"
                max="10000"
                value={s().maxMemories}
                onChange={(e) => void run(() => props.onLimit!(Number(e.currentTarget.value)))}
              />
            </label>
          </>
        )}
      </Show>
      <Show when={props.onSearch}>
        <label>
          Search memories <input type="search" onInput={(e) => props.onSearch?.(e.currentTarget.value)} />
        </label>
      </Show>
      <For each={props.entries}>
        {(entry) => (
          <article class="w2-item">
            <p>{entry.text}</p>
            <Show when={entry.inclusion}>
              <small>{entry.inclusion === "essential" ? "Always" : "When needed"}</small>
            </Show>
            <div>
              <button
                type="button"
                onClick={() => {
                  setText(entry.text);
                  setInclusion(entry.inclusion ?? "searchable");
                  setEditing(entry.id);
                }}
              >
                Edit
              </button>{" "}
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Delete this memory?")) void run(() => props.onDelete(entry.id));
                }}
              >
                Delete
              </button>
            </div>
          </article>
        )}
      </For>
      <label>
        Memory text
        <textarea
          aria-label="Memory text"
          maxlength={props.channel ? 500 : 10000}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
        />
      </label>
      <Show when={!props.channel}>
        <label>
          Inclusion{" "}
          <select
            aria-label="Inclusion"
            value={inclusion()}
            onChange={(e) => setInclusion(e.currentTarget.value as MemoryInclusion)}
          >
            <option value="searchable">When needed</option>
            <option value="essential">Always</option>
          </select>
        </label>
      </Show>
      <button
        type="button"
        disabled={busy() || !text().trim()}
        onClick={() =>
          void run(async () => {
            await props.onSave(text().trim(), inclusion(), editing());
            setText("");
            setEditing(undefined);
          })
        }
      >
        Save memory
      </button>
      <Show when={editing()}>
        <button
          type="button"
          onClick={() => {
            setEditing(undefined);
            setText("");
          }}
        >
          Cancel edit
        </button>
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </section>
  );
}
