import { type AgentApproval, APPROVAL_RULES_NEVER_COVER, type ApprovalRuleScope } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { alwaysAllowChoice } from "../always-allow";
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
                  Always allow…
                </Button>
              ) : (
                <Text class="always-allow-note" tone="muted" title={current.reason}>
                  Only once: {current.reason}
                </Text>
              )
            }
          </Show>
        }
      >
        <section class="always-allow-panel" aria-label="Always allow">
          <Show when={choice()} keyed>
            {(current) => {
              if (!current.available) return null;
              if (current.kind === "command") {
                return (
                  <label class="always-allow-field">
                    <Text variant="label-sm">Always allow commands that start with</Text>
                    <NativeSelect value={chosenPrefix()} onChange={(event) => setPrefix(event.currentTarget.value)}>
                      <For each={current.prefixes}>{(item) => <option value={item}>{item}</option>}</For>
                    </NativeSelect>
                  </label>
                );
              }
              if (current.kind === "file-change") {
                return (
                  <Text as="p">
                    Always allow this agent to change files in <strong>{current.folder}</strong> and the folders inside
                    it.
                  </Text>
                );
              }
              return (
                <Text as="p">
                  Always allow this agent to {current.writes ? "read and write" : "read"} in the folder that contains
                  everything it asks for now.
                </Text>
              );
            }}
          </Show>
          <Text as="p" tone="muted" class="always-allow-note">
            For this agent only. It never covers {APPROVAL_RULES_NEVER_COVER.join(", ")}. You can remove the rule in the
            agent's settings.
          </Text>
          <div class="approval-card-actions">
            <Button type="button" class="approval-button approval-button-ghost" onClick={() => setOpen(false)}>
              Cancel
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
              Always allow
            </Button>
          </div>
        </section>
      </Show>
    </div>
  );
}
