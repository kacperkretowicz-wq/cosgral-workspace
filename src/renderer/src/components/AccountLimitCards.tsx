import { Show } from "solid-js";
import { t } from "../i18n";
import type { AccountLimitReachedView, AccountSwitchedView } from "./account-usage-view";
import { formatResetTime } from "./ProvidersPage";
import { Button, Card, Heading, Text } from "./ui";

/** Conversation card when the account of a turn hit its usage limit (W5-K1 `account-limit-reached`). */
export function AccountLimitReachedCard(props: {
  view: AccountLimitReachedView;
  nowMs: number;
  onDismiss?: () => void;
}) {
  const reset = () => formatResetTime(props.view.resetsAt, props.nowMs);

  return (
    <Card
      class="account-limit-card"
      role="region"
      aria-label={t("Account limit reached")}
      data-kind="limit-reached"
      tabindex={0}
    >
      <Heading as="h3" size="sm">
        Limit reached
      </Heading>
      <Text as="p" tone="danger" role="alert">
        {props.view.reason}
      </Text>
      <Text as="p" tone="secondary">
        Account: {props.view.exhaustedAccountLabel}
      </Text>
      <Show when={props.view.outcome === "switched" && props.view.nextAccountLabel}>
        {(label) => (
          <>
            <Text as="p" role="status">
              Switched to account {label()} for this turn.
            </Text>
            <Text as="p" tone="muted">
              The agent goes back to its first account by itself once the limit has passed.
            </Text>
          </>
        )}
      </Show>
      <Show when={props.view.outcome === "asks" && props.view.nextAccountLabel}>
        {(label) => (
          <Text as="p" tone="warning" role="status">
            A card in Needs you asks whether to continue on {label()}.
          </Text>
        )}
      </Show>
      <Show when={props.view.outcome === "exhausted"}>
        <Text as="p" tone="warning" role="status">
          Every account in the pool is exhausted. Wait for a reset before continuing.
        </Text>
      </Show>
      <Show when={reset()}>
        <Text as="p" tone="secondary">
          {props.view.resetsAtAssumed ? "Assumed reset at" : "Resets at"} {reset()}
        </Text>
      </Show>
      <Show when={!reset()}>
        <Text as="p" tone="muted">
          No reset time was given
        </Text>
      </Show>
      <Show when={props.onDismiss}>
        <div class="account-limit-card-actions">
          <Button type="button" variant="ghost" onClick={() => props.onDismiss?.()}>
            Dismiss
          </Button>
        </div>
      </Show>
    </Card>
  );
}

/** Informational notice after an automatic account switch (dismissible). */
export function AccountSwitchedCard(props: { view: AccountSwitchedView; onDismiss: () => void }) {
  return (
    <Card
      class="account-switched-card"
      role="status"
      aria-live="polite"
      aria-label={t("Switched to account {label}", { label: props.view.toAccountLabel })}
      data-kind="account-switched"
      tabindex={0}
    >
      <Heading as="h3" size="sm">
        {t("Switched to account {label}", { label: props.view.toAccountLabel })}
      </Heading>
      <Show when={props.view.fromAccountLabel}>
        <Text as="p" tone="secondary">
          Previous account: {props.view.fromAccountLabel}
        </Text>
      </Show>
      <Show when={props.view.reason}>
        <Text as="p" tone="muted">
          {props.view.reason}
        </Text>
      </Show>
      <div class="account-limit-card-actions">
        <Button type="button" variant="ghost" onClick={() => props.onDismiss()}>
          Dismiss
        </Button>
      </div>
    </Card>
  );
}
