import { Show } from "solid-js";
import type { AccountLimitReachedView, AccountSwitchedView } from "./account-usage-view";
import { formatResetTime } from "./ProvidersPage";
import { Button, Card, Heading, Text } from "./ui";

/** Conversation card when a pool account hits a limit (guessed shape until W5-K1). */
export function AccountLimitReachedCard(props: {
  view: AccountLimitReachedView;
  nowMs: number;
  onReturnAfterReset?: () => void;
  onDismiss?: () => void;
}) {
  const reset = () => formatResetTime(props.view.resetsAt, props.nowMs);
  const showReturn = () =>
    props.view.canReturnAfterReset && !!props.view.returnAccountLabel && !!props.onReturnAfterReset;

  return (
    <Card
      class="account-limit-card"
      role="region"
      aria-label="Account limit reached"
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
        Exhausted account: {props.view.exhaustedAccountLabel}
      </Text>
      <Show
        when={props.view.switchedToAccountLabel}
        fallback={
          <Text as="p" tone="warning" role="status">
            Every account in the pool is exhausted. Wait for a reset before continuing.
          </Text>
        }
      >
        {(label) => (
          <Text as="p" role="status">
            Switched to account {label()} for this turn.
          </Text>
        )}
      </Show>
      <Show when={reset()}>
        <Text as="p" tone="secondary">
          Resets at {reset()}
        </Text>
      </Show>
      <Show when={!reset()}>
        <Text as="p" tone="muted">
          No reset time was given
        </Text>
      </Show>
      <div class="account-limit-card-actions">
        <Show when={showReturn()}>
          <Button type="button" variant="secondary" onClick={() => props.onReturnAfterReset?.()}>
            Return to {props.view.returnAccountLabel} after reset
          </Button>
        </Show>
        <Show when={props.onDismiss}>
          <Button type="button" variant="ghost" onClick={() => props.onDismiss?.()}>
            Dismiss
          </Button>
        </Show>
      </div>
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
      aria-label={`Switched to account ${props.view.toAccountLabel}`}
      data-kind="account-switched"
      tabindex={0}
    >
      <Heading as="h3" size="sm">
        Switched to account {props.view.toAccountLabel}
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
