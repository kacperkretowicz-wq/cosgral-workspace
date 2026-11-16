import { For, Show } from "solid-js";
import {
  type AccountUsageView,
  type AccountUsageWindowView,
  clampPercent,
  stateLabel,
  stateTone,
} from "./account-usage-view";
import { formatResetTime } from "./ProvidersPage";
import { Badge, Card, Heading, Text } from "./ui";

function meterValueText(window: AccountUsageWindowView, nowMs: number): string {
  const percent = clampPercent(window.usedPercent);
  const parts: string[] = [];
  if (percent !== null) parts.push(`${Math.round(percent)} percent used`);
  else parts.push("usage unknown");
  parts.push(stateLabel(window.state).toLowerCase());
  const reset = formatResetTime(window.resetsAt, nowMs);
  if (reset) parts.push(`resets at ${reset}`);
  else if (window.state !== "ok") parts.push("no reset time given");
  return parts.join(", ");
}

export function UsageWindowMeter(props: { window: AccountUsageWindowView; nowMs: number }) {
  const percent = () => clampPercent(props.window.usedPercent);
  const reset = () => formatResetTime(props.window.resetsAt, props.nowMs);
  return (
    <fieldset
      class="account-usage-window"
      data-state={props.window.state}
      aria-label={`${props.window.label}: ${meterValueText(props.window, props.nowMs)}`}
    >
      <div class="account-usage-window-head">
        <Text as="strong">{props.window.label}</Text>
        <Badge tone={stateTone(props.window.state)} size="sm" dot>
          {stateLabel(props.window.state)}
        </Badge>
      </div>
      <Show
        when={percent() !== null}
        fallback={
          <div class="account-usage-track account-usage-track-unknown" aria-hidden="true">
            <div class="account-usage-fill" data-state="unknown" style={{ width: "100%" }} />
          </div>
        }
      >
        <meter
          class="account-usage-track"
          min={0}
          max={100}
          value={Math.round(percent() ?? 0)}
          aria-label={props.window.label}
          title={meterValueText(props.window, props.nowMs)}
        />
      </Show>
      <Show when={percent() !== null}>
        <Text as="p" tone="secondary">
          {Math.round(percent() ?? 0)}% used
        </Text>
      </Show>
      <Show when={percent() === null}>
        <Text as="p" tone="muted">
          Usage not reported
        </Text>
      </Show>
      <Show when={reset()}>
        <Text as="p" tone="secondary">
          Resets at {reset()}
        </Text>
      </Show>
      <Show when={!reset() && props.window.state !== "ok"}>
        <Text as="p" tone="muted">
          No reset time was given
        </Text>
      </Show>
    </fieldset>
  );
}

/** Per-account usage panel for Providers / Usage (mock-ready until K1). */
export function AccountUsageMeter(props: { usage: AccountUsageView; nowMs: number }) {
  const providerName = () => (props.usage.provider === "codex" ? "Codex" : "Claude");
  return (
    <Card
      class="account-usage-meter"
      role="region"
      aria-label={`Usage for ${props.usage.accountLabel}`}
      data-state={props.usage.state}
      tabindex={0}
    >
      <div class="account-usage-meter-head">
        <div>
          <Heading as="h3" size="sm">
            {props.usage.accountLabel}
          </Heading>
          <Text as="p" tone="muted">
            {providerName()}
          </Text>
        </div>
        <Badge tone={stateTone(props.usage.state)} dot>
          {stateLabel(props.usage.state)}
        </Badge>
      </div>
      <Show when={props.usage.reason}>
        <Text as="p" tone={props.usage.state === "exhausted" ? "danger" : "muted"} role="status">
          {props.usage.reason}
        </Text>
      </Show>
      <Show
        when={props.usage.windows.length}
        fallback={
          <Text as="p" tone="muted">
            No usage windows for this account yet.
          </Text>
        }
      >
        <div class="account-usage-windows">
          <For each={props.usage.windows}>{(window) => <UsageWindowMeter window={window} nowMs={props.nowMs} />}</For>
        </div>
      </Show>
    </Card>
  );
}
