import { APPROVAL_RULES_NEVER_COVER, type ApprovalRule, describeApprovalRule } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { Button, Heading, Text } from "./ui";

function whenUsed(rule: ApprovalRule): string {
  if (!rule.uses || !rule.lastUsedAt) return "Not used yet";
  const date = new Date(rule.lastUsedAt);
  const last = Number.isNaN(date.getTime()) ? rule.lastUsedAt : date.toLocaleString();
  return `Used ${rule.uses} ${rule.uses === 1 ? "time" : "times"}, last ${last}`;
}

/** The "always allow" rules of one agent, with a way to take each one back. */
export function ApprovalRulesList(props: {
  rules: ApprovalRule[];
  error: string;
  busy: boolean;
  onRevoke: (ruleId: string) => void;
}) {
  return (
    <section class="approval-rules" aria-label="Always-allow rules">
      <Heading as="h4" size="sm">
        Always allowed
      </Heading>
      <Show when={props.error}>
        <Text as="p" tone="danger" role="alert">
          {props.error}
        </Text>
      </Show>
      <Show
        when={props.rules.length}
        fallback={
          <Text as="p" tone="muted">
            Nothing is allowed for good. Choose “Always allow…” on an approval card to add a rule.
          </Text>
        }
      >
        <ul class="approval-rules-list">
          <For each={props.rules}>
            {(rule) => (
              <li class="approval-rules-row">
                <div>
                  <Text as="strong">{describeApprovalRule(rule)}</Text>
                  <Text as="p" tone="muted">
                    {whenUsed(rule)}
                  </Text>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={props.busy}
                  aria-label={`Remove rule: ${describeApprovalRule(rule)}`}
                  onClick={() => props.onRevoke(rule.id)}
                >
                  Remove
                </Button>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Text as="p" tone="muted">
        These rules never cover {APPROVAL_RULES_NEVER_COVER.join(", ")}.
      </Text>
    </section>
  );
}

export function ApprovalRulesSettings(props: { botId: string }) {
  const [rules, setRules] = createSignal<ApprovalRule[]>([]);
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  onSettled(() => {
    const api = window.openbot.approvalRules;
    if (!api) return;
    void api
      .list(props.botId)
      .then(setRules)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the rules."));
    return window.openbot.agent.onEvent((event) => {
      if (event.type === "approval-rules-changed") setRules(event.rules.filter((rule) => rule.botId === props.botId));
    });
  });
  return (
    <Show when={window.openbot.approvalRules}>
      {(api) => (
        <ApprovalRulesList
          rules={rules()}
          error={error()}
          busy={busy()}
          onRevoke={(ruleId) => {
            setBusy(true);
            void api()
              .revoke({ ruleId })
              .then((left) => {
                setRules(left.filter((rule) => rule.botId === props.botId));
                setError("");
              })
              .catch((e) => setError(e instanceof Error ? e.message : "Could not remove the rule."))
              .finally(() => setBusy(false));
          }}
        />
      )}
    </Show>
  );
}
