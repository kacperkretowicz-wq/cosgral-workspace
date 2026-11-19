import { type AgentApproval, APPROVAL_RULES_NEVER_COVER, type ApprovalRuleScope } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { alwaysAllowChoice } from "../always-allow";
import { t } from "../i18n";
import { Button, NativeSelect, Text } from "./ui";

/** What "Always allow" would save for this approval, and the button that opens its choices; nothing for kinds it cannot cover. */
export function AlwaysAllowPanel(props: {
  approval: AgentApproval;
  busy: boolean;
  onConfirm: (scope: ApprovalRuleScope) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const choice = () => alwaysAllowChoice(props.approval);
  const [prefix, setPrefix] = createSignal<string | null>(null);
  const prefixes = () => {
    const current = choice();
    return current.available && current.kind === "command" ? current.prefixes : [];
  };
  const chosenPrefix = () => prefix() ?? prefixes().at(-1) ?? "";
  return (
    <div class="always-allow">
      <Show
        when={open()}
        fallback={
          <Show when={choice()} keyed>
            {(current) =>
              current.available ? (
                <Button
                  type="button"
                  class="approval-button approval-button-ghost"
                  disabled={props.busy}
                  onClick={() => setOpen(true)}
                >
                  {t("Always allow…")}
                </Button>
              ) : (
                <Text class="always-allow-note" tone="muted" title={current.reason}>
                  {t("Only once: {reason}", { reason: current.reason })}
                </Text>
              )
            }
          </Show>
        }
      >
        <section class="always-allow-panel" aria-label={t("Always allow")}>
          <Show when={choice()} keyed>
            {(current) => {
              if (!current.available) return null;
              if (current.kind === "command") {
                return (
                  <label class="always-allow-field">
                    <Text variant="label-sm">{t("Always allow commands that start with")}</Text>
                    <NativeSelect value={chosenPrefix()} onChange={(event) => setPrefix(event.currentTarget.value)}>
                      <For each={current.prefixes}>{(item) => <option value={item}>{item}</option>}</For>
                    </NativeSelect>
                  </label>
                );
              }
              if (current.kind === "file-change") {
                return (
                  <Text as="p">
                    {t("Always allow this agent to change files in {folder} and the folders inside it.", {
                      folder: current.folder,
                    })}
                  </Text>
                );
              }
              return (
                <Text as="p">
                  {current.writes
                    ? t(
                        "Always allow this agent to read and write in the folder that contains everything it asks for now.",
                      )
                    : t("Always allow this agent to read in the folder that contains everything it asks for now.")}
                </Text>
              );
            }}
          </Show>
          <Text as="p" tone="muted" class="always-allow-note">
            {t("For this agent only. It never covers {kinds}. You can remove the rule in the agent's settings.", {
              kinds: APPROVAL_RULES_NEVER_COVER.join(", "),
            })}
          </Text>
          <div class="approval-card-actions">
            <Button type="button" class="approval-button approval-button-ghost" onClick={() => setOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              class="approval-button approval-button-primary"
              disabled={props.busy}
              onClick={() => {
                const current = choice();
                props.onConfirm(current.available && current.kind === "command" ? { prefix: chosenPrefix() } : {});
              }}
            >
              {t("Always allow")}
            </Button>
          </div>
        </section>
      </Show>
    </div>
  );
}
