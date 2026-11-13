import type { DraftAttachment, LibraryItem } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
export function LibraryItems(props: {
  items: LibraryItem[];
  onAttach?: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <For each={props.items} fallback={<p>No files found.</p>}>
      {(item) => (
        <article class="w2-item">
          <strong>{item.name}</strong>
          <small>
            {item.origin} · {item.size} bytes
          </small>
          <div>
            <button type="button" onClick={() => props.onOpen(item.id)}>
              Open
            </button>{" "}
            <Show when={props.onAttach}>
              <button type="button" onClick={() => props.onAttach?.(item.id)}>
                Attach
              </button>
            </Show>{" "}
            <Show when={item.origin !== "chat"}>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete ${item.name}?`)) props.onDelete(item.id);
                }}
              >
                Delete
              </button>
            </Show>
          </div>
        </article>
      )}
    </For>
  );
}
export function LibraryPanel(props: { onAttach?: (draft: DraftAttachment) => void }) {
  const [items, setItems] = createSignal<LibraryItem[]>([]);
  const [query, setQuery] = createSignal("");
  const [error, setError] = createSignal("");
  let seq = 0;
  async function refresh(search = query()) {
    const api = window.openbot.library;
    if (!api) {
      setError("File library unavailable in this build.");
      return;
    }
    const n = ++seq;
    try {
      const result = await api.list({ query: search.trim() });
      if (n === seq) {
        setItems(result);
        setError("");
      }
    } catch (e) {
      if (n === seq) setError(e instanceof Error ? e.message : "Could not load files.");
    }
  }
  async function action(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "File action failed.");
    }
  }
  onSettled(() => {
    void refresh();
    if (!window.openbot.library) return;
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "library-changed" || event.type === "conversation" || event.type === "conversation-delta")
        void refresh();
    });
    return () => {
      seq++;
      off();
    };
  });
  return (
    <section class="w2-panel" aria-label="File library">
      <h2>Files</h2>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <label>
        Search files
        <input
          type="search"
          value={query()}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            void refresh(e.currentTarget.value);
          }}
        />
      </label>
      <button
        type="button"
        onClick={() =>
          void action(async () => {
            const api = window.openbot.library;
            if (!api) throw new Error("File library unavailable");
            await api.choose();
          })
        }
      >
        Add files
      </button>
      <LibraryItems
        items={items()}
        onOpen={(fileId) =>
          void action(async () => {
            const api = window.openbot.library;
            if (!api) throw new Error("File library unavailable");
            await api.open({ fileId, action: "open" });
          })
        }
        onDelete={(fileId) =>
          void action(async () => {
            const api = window.openbot.library;
            if (!api) throw new Error("File library unavailable");
            await api.delete({ fileId });
          })
        }
        onAttach={
          props.onAttach
            ? (fileId) =>
                void action(async () => {
                  const api = window.openbot.library;
                  if (!api) throw new Error("File library unavailable");
                  props.onAttach?.(await api.attachToDraft({ fileId }));
                })
            : undefined
        }
      />
    </section>
  );
}
