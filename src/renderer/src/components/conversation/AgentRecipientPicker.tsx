import { INPUT_LIMITS } from "@openbot/contracts/input-limits";
import { createMemo, Show } from "solid-js";
import type { BotProfile } from "../../data";
import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { Combobox, Input } from "../ui";
import { PlusIcon } from "./ConversationIcons";

type AgentPickerOption = { kind: "create" } | { kind: "bot"; bot: BotProfile };

/**
 * The "To:" field that replaces the conversation header while the person is choosing who to write to: search the
 * agents, pick one, or create a new one. Which agent is chosen and what "create" does stay with the caller.
 */
export function AgentRecipientPicker(props: {
  bots: BotProfile[];
  open: boolean;
  creating: boolean;
  onCreate: () => void;
  onSelect: (botId: string) => void;
  onClose: () => void;
  /** Receives the search input, so the caller can focus it when the picker opens. */
  inputRef: (element: HTMLInputElement) => void;
}) {
  const options = createMemo<AgentPickerOption[]>(() => [
    { kind: "create" },
    ...props.bots.map((bot) => ({ kind: "bot" as const, bot })),
  ]);
  return (
    <div class="agent-picker-root no-drag">
      <Combobox.Root<AgentPickerOption>
        options={options()}
        open={true}
        modal={false}
        triggerMode="input"
        closeOnSelection={false}
        shouldFocusWrap={true}
        defaultFilter={(option, inputValue) =>
          option.kind === "create" ||
          `${option.bot.name} ${option.bot.role}`.toLocaleLowerCase().includes(inputValue.toLocaleLowerCase())
        }
        optionValue={(option) => (option.kind === "create" ? "create" : option.bot.id)}
        optionTextValue={(option) =>
          option.kind === "create" ? t("Create new agent") : `${option.bot.name} ${option.bot.role}`
        }
        optionLabel={(option) => (option.kind === "create" ? t("Create new agent") : option.bot.name)}
        optionDisabled={(option) => option.kind === "create" && props.creating}
        onChange={(option) => {
          if (!option) return;
          if (option.kind === "create") props.onCreate();
          else props.onSelect(option.bot.id);
        }}
        itemComponent={(itemProps) => {
          const option = itemProps.item.rawValue;
          return (
            <Combobox.Item
              item={itemProps.item}
              class={["agent-picker-option", { "agent-picker-create": option.kind === "create" }]}
            >
              <Show
                when={option.kind === "bot" ? option.bot : undefined}
                fallback={
                  <span class="agent-picker-plus">
                    <PlusIcon />
                  </span>
                }
              >
                {(bot) => <AgentAvatar bot={bot()} />}
              </Show>
              <Combobox.ItemLabel>
                {option.kind === "create"
                  ? props.creating
                    ? t("Creating agent…")
                    : t("Create new agent")
                  : option.bot.name}
              </Combobox.ItemLabel>
            </Combobox.Item>
          );
        }}
      >
        <Combobox.Control class="agent-recipient-field">
          <Combobox.Label>{t("To:")}</Combobox.Label>
          <Combobox.Input
            as={Input}
            ref={props.inputRef}
            aria-label={t("To:")}
            placeholder={t("Search or create agents")}
            maxlength={INPUT_LIMITS.agentName}
            onKeyDown={(event) => {
              if (event.key === "Escape") props.onClose();
            }}
          />
        </Combobox.Control>
        <Combobox.Content class="agent-picker-menu" aria-hidden={props.open ? undefined : "true"}>
          <Combobox.Listbox />
        </Combobox.Content>
      </Combobox.Root>
    </div>
  );
}
