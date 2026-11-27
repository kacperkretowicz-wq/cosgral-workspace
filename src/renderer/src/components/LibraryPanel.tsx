import type { DraftAttachment, LibraryItem } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { errorText } from "../errors";
import { t } from "../i18n";
import { Button, Input } from "./ui";

export function LibraryItems(props: {
  items: LibraryItem[];
  onAttach?: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (id: string, action?: "open" | "download" | "reveal") => void;
}) {
  return (
    <For each={props.items} fallback={<p>{t("No files found.")}</p>}>
      {(item) => (
        <article class="w2-item">
          <strong>{item.name}</strong>
          <small>{t("{origin} · {size} bytes", { origin: item.origin, size: item.size })}</small>
          <div>
            <Button unstyled type="button" onClick={() => props.onOpen(item.id)}>
              {t("Open")}
            </Button>{" "}
            <Button type="button" variant="secondary" onClick={() => props.onOpen(item.id, "download")}>
              {t("Download")}
            </Button>{" "}
            <Button type="button" variant="secondary" onClick={() => props.onOpen(item.id, "reveal")}>
              {t("Show in folder")}
            </Button>{" "}
            <Show when={props.onAttach}>
              <Button unstyled type="button" onClick={() => props.onAttach?.(item.id)}>
                {t("Attach")}
              </Button>
            </Show>{" "}
            <Show when={item.origin !== "chat"}>
              <Button
                unstyled
                type="button"
                onClick={() => {
                  if (window.confirm(t("Delete {name}?", { name: item.name }))) props.onDelete(item.id);
                }}
              >
                {t("Delete")}
              </Button>
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
      setError(t("File library unavailable in this build."));
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
      if (n === seq) setError(errorText(e, t("Could not load files.")));
    }
  }
  async function action(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorText(e, t("File action failed.")));
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
    <section class="w2-panel" aria-label={t("File library")}>
      <h2>{t("Files")}</h2>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <label>
        {t("Search files")}
        <Input
          unstyled
          type="search"
          value={query()}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            void refresh(e.currentTarget.value);
          }}
        />
      </label>
      <Button
        unstyled
        type="button"
        onClick={() =>
          void action(async () => {
            const api = window.openbot.library;
            if (!api) throw new Error(t("File library unavailable"));
            await api.choose();
          })
        }
      >
        {t("Add files")}
      </Button>
      <LibraryItems
        items={items()}
        onOpen={(fileId, fileAction = "open") =>
          void action(async () => {
            const api = window.openbot.library;
            if (!api) throw new Error(t("File library unavailable"));
            await api.open({ fileId, action: fileAction });
          })
        }
        onDelete={(fileId) =>
          void action(async () => {
            const api = window.openbot.library;
            if (!api) throw new Error(t("File library unavailable"));
            await api.delete({ fileId });
          })
        }
        onAttach={
          props.onAttach
            ? (fileId) =>
                void action(async () => {
                  const api = window.openbot.library;
                  if (!api) throw new Error(t("File library unavailable"));
                  props.onAttach?.(await api.attachToDraft({ fileId }));
                })
            : undefined
        }
      />
    </section>
  );
}
