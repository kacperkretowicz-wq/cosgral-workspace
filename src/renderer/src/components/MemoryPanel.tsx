import { type AgentMemorySettings, isMemoryInclusion, type MemoryInclusion } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { t } from "../i18n";
import { Button, Input, NativeSelect, Textarea } from "./ui";

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
      setError(e instanceof Error ? e.message : t("Could not update memory."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="w2-panel" aria-label={props.channel ? t("Channel memory") : t("Agent memory")}>
      <h3>{props.channel ? t("Channel memory") : t("Memory")}</h3>
      <Show when={props.settings}>
        {(s) => (
          <>
            <p>
              {s().essentialCount + s().searchableCount} / {s().maxMemories} memories · {s().essentialPromptBytes} /
              8192 bytes in always-on prompt
            </p>
            <label>
              Memory limit{" "}
              <Input
                unstyled
                type="number"
                min="0"
                max="10000"
                value={s().maxMemories}
                onChange={(e) => {
                  const onLimit = props.onLimit;
                  const limit = Number(e.currentTarget.value);
                  if (onLimit) void run(() => onLimit(limit));
                }}
              />
            </label>
          </>
        )}
      </Show>
      <Show when={props.onSearch}>
        <label>
          Search memories <Input unstyled type="search" onInput={(e) => props.onSearch?.(e.currentTarget.value)} />
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
              <Button
                unstyled
                type="button"
                onClick={() => {
                  setText(entry.text);
                  setInclusion(entry.inclusion ?? "searchable");
                  setEditing(entry.id);
                }}
              >
                Edit
              </Button>{" "}
              <Button
                unstyled
                type="button"
                onClick={() => {
                  if (window.confirm("Delete this memory?")) void run(() => props.onDelete(entry.id));
                }}
              >
                Delete
              </Button>
            </div>
          </article>
        )}
      </For>
      <label>
        {t("Memory text")}
        <Textarea
          unstyled
          aria-label={t("Memory text")}
          maxlength={props.channel ? 500 : 10000}
          value={text()}
          onInput={(e) => setText(e.currentTarget.value)}
        />
      </label>
      <Show when={!props.channel}>
        <label>
          {t("Inclusion")}{" "}
          <NativeSelect
            unstyled
            aria-label={t("Inclusion")}
            value={inclusion()}
            onChange={(e) => {
              const value = e.currentTarget.value;
              if (isMemoryInclusion(value)) setInclusion(value);
            }}
          >
            <option value="searchable">{t("When needed")}</option>
            <option value="essential">{t("Always")}</option>
          </NativeSelect>
        </label>
      </Show>
      <Button
        unstyled
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
      </Button>
      <Show when={editing()}>
        <Button
          unstyled
          type="button"
          onClick={() => {
            setEditing(undefined);
            setText("");
          }}
        >
          Cancel edit
        </Button>
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
    </section>
  );
}
