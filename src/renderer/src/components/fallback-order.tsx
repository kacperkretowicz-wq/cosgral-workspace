import { type AgentModelId, PROVIDER_LIMITS } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { t } from "../i18n";
import { Badge, Button, NativeSelect, Text } from "./ui";
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  if (from === to || from < 0 || to < 0 || from >= copy.length || to >= copy.length) return copy;
  copy.splice(to, 0, ...copy.splice(from, 1));
  return copy;
}

export interface FallbackModelOption {
  id: AgentModelId;
  name: string;
}

/**
 * The order of one agent's fallback models. Drag a row, or focus it and press Alt+Up or Alt+Down; the buttons do the
 * same. The agent's own model is tried first and is not in this list.
 */
export function FallbackOrder(props: {
  botName: string;
  ownModel?: AgentModelId;
  confirmAdd?: boolean;
  unavailable?: AgentModelId[];
  items: AgentModelId[];
  options: FallbackModelOption[];
  dirty: boolean;
  saving: boolean;
  onChange: (items: AgentModelId[]) => void;
  onSave: () => void;
}) {
  const [selected, setSelected] = createSignal<AgentModelId | null>(null);
  const [dragFrom, setDragFrom] = createSignal<number | null>(null);
  const [announce, setAnnounce] = createSignal("");
  const nameOf = (id: AgentModelId) => props.options.find((option) => option.id === id)?.name ?? id;
  const full = () => props.items.length >= PROVIDER_LIMITS.fallbackModels;
  const addable = () => props.options.filter((o) => o.id !== props.ownModel && !props.items.includes(o.id));
  function move(from: number, to: number) {
    if (props.saving || to < 0 || to >= props.items.length || from === to) return;
    const id = props.items[from];
    props.onChange(moveItem(props.items, from, to));
    if (id !== undefined)
      setAnnounce(
        t("{name} moved to position {n} of {total}.", {
          name: nameOf(id),
          n: to + 1,
          total: props.items.length,
        }),
      );
  }
  return (
    <section class="providers-fallback" aria-label={t("Fallback models for {name}", { name: props.botName })}>
      <Text as="p" tone="secondary">
        {t("After account retries, these models are tried in order. Each is tried at most once per message.")}
      </Text>
      <Show
        when={props.items.length}
        fallback={
          <Text as="p" tone="muted">
            {t("This list is empty. Later fallback layers may still apply.")}
          </Text>
        }
      >
        <ol class="providers-order" aria-label={t("Fallback order")}>
          <For each={props.items}>
            {(model, index) => (
              <li
                class="providers-order-item"
                data-dragging={dragFrom() === index() ? "" : undefined}
                draggable="true"
                tabindex="0"
                aria-label={t("{n}. {name}. Press Alt and Up or Down arrow to reorder.", {
                  n: index() + 1,
                  name: nameOf(model),
                })}
                onDragStart={(event) => {
                  setDragFrom(index());
                  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = dragFrom();
                  setDragFrom(null);
                  if (from !== null) move(from, index());
                }}
                onDragEnd={() => setDragFrom(null)}
                onKeyDown={(event) => {
                  if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                  event.preventDefault();
                  move(index(), index() + (event.key === "ArrowUp" ? -1 : 1));
                }}
              >
                <span class="providers-order-number" aria-hidden="true">
                  {index() + 1}
                </span>
                <span class="providers-order-name">{nameOf(model)}</span>
                <Show when={props.unavailable?.includes(model)}>
                  <Badge tone="warning">{t("Unavailable")}</Badge>
                </Show>
                <Button
                  type="button"
                  size="xs"
                  aria-label={t("Move {name} up", { name: nameOf(model) })}
                  disabled={props.saving || index() === 0}
                  onClick={() => move(index(), index() - 1)}
                >
                  {t("Up")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  aria-label={t("Move {name} down", { name: nameOf(model) })}
                  disabled={props.saving || index() === props.items.length - 1}
                  onClick={() => move(index(), index() + 1)}
                >
                  {t("Down")}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="danger"
                  disabled={props.saving}
                  aria-label={t("Remove {name} from fallbacks", { name: nameOf(model) })}
                  onClick={() => props.onChange(props.items.filter((_, i) => i !== index()))}
                >
                  {t("Remove")}
                </Button>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <span class="providers-sr-only" role="status" aria-live="polite">
        {announce()}
      </span>
      <Text as="p" tone="secondary">
        {t("At most {n} models. Duplicate models cannot be added.", { n: PROVIDER_LIMITS.fallbackModels })}
      </Text>
      <div class="providers-add">
        <NativeSelect
          aria-label={t("Add fallback model")}
          value={props.confirmAdd ? (selected() ?? "") : ""}
          disabled={props.saving || full() || !addable().length}
          onChange={(event) => {
            const chosen = addable().find((option) => option.id === event.currentTarget.value);
            event.currentTarget.value = "";
            if (props.confirmAdd) setSelected(chosen?.id ?? null);
            else if (chosen && !full()) props.onChange([...props.items, chosen.id]);
          }}
        >
          <option value="">
            {full() ? t("At most {n} models", { n: PROVIDER_LIMITS.fallbackModels }) : t("Add a fallback model...")}
          </option>
          <For each={addable()}>{(option) => <option value={option.id}>{option.name}</option>}</For>
        </NativeSelect>
        <Show when={props.confirmAdd}>
          <Button
            type="button"
            disabled={props.saving || full() || !addable().some((option) => option.id === selected())}
            onClick={() => {
              const id = selected();
              if (id && !full() && addable().some((option) => option.id === id)) props.onChange([...props.items, id]);
              setSelected(null);
            }}
          >
            {t("Add fallback")}
          </Button>
        </Show>
        <Button type="button" variant="primary" disabled={!props.dirty} loading={props.saving} onClick={props.onSave}>
          {t("Save order")}
        </Button>
      </div>
    </section>
  );
}
