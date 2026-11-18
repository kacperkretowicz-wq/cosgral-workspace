import type { AgentEvent, ContextDesktopApi, ContextState } from "@openbot/contracts/ipc";
import { CONTEXT_SETTINGS_LIMITS } from "@openbot/contracts/ipc";
import { createEffect, createSignal, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { providerError } from "./provider-error";
import { Badge, Button, Heading, Text } from "./ui";
import "../styles/context.css";
export type ContextEvents = (listener: (event: AgentEvent) => void) => () => void;
export function ContextMeter(props: { state: ContextState; pending?: boolean; onCompact: () => void }) {
  const reported = () =>
    props.state.source === "reported" &&
    props.state.used !== null &&
    props.state.limit !== null &&
    props.state.percent !== null;
  const warning = () =>
    reported() && (props.state.warning || (props.state.percent ?? 0) >= CONTEXT_SETTINGS_LIMITS.warnPercent);
  return (
    <section
      class="context-panel"
      aria-label="Conversation context"
      aria-busy={props.pending || props.state.compacting ? "true" : "false"}
    >
      <div class="context-panel-heading">
        <Heading as="h2" size="sm">
          Context
        </Heading>
        <Show when={warning()}>
          <Badge tone="warning">Context is getting full</Badge>
        </Show>
      </div>
      <Show
        when={reported()}
        fallback={
          <Text as="p" tone="secondary">
            Context unavailable. {props.state.unavailableReason ?? "This provider does not report its context size."}
          </Text>
        }
      >
        <Text as="p">
          {props.state.used?.toLocaleString("en-US")} / {props.state.limit?.toLocaleString("en-US")} tokens (
          {props.state.percent}%)
        </Text>
        <progress
          class="context-meter"
          max={100}
          value={props.state.percent ?? undefined}
          aria-label="Context used"
          style={{ "accent-color": warning() ? "var(--openbot-warning)" : "var(--openbot-accent)" }}
        />
        <Show when={props.state.stale}>
          <Text as="p" tone="secondary">
            Last reported numbers; waiting for a new report after compaction.
          </Text>
        </Show>
      </Show>
      <Show when={props.state.compacting}>
        <Text as="p" role="status">
          Compacting context. This may wait for the current turn to finish.
        </Text>
      </Show>
      <Show when={props.state.canCompact}>
        <Button size="sm" disabled={props.pending || props.state.compacting} onClick={props.onCompact}>
          Compact
        </Button>
      </Show>
      <Text as="p" tone="secondary">
        Compactions: {props.state.compactions}
        <Show when={props.state.lastCompactedAt}>
          . Last compacted:{" "}
          {props.state.lastCompactedAt ? new Date(props.state.lastCompactedAt).toLocaleString("en-US") : ""}
        </Show>
      </Text>
    </section>
  );
}
export function ContextIndicator(props: {
  botId: string;
  threadId?: string | null;
  api?: ContextDesktopApi;
  onEvent?: ContextEvents;
}) {
  const api = untrack(() => props.api ?? window.openbot?.context);
  const [state, setState] = createSignal<ContextState>();
  const [error, setError] = createSignal("");
  const [pending, setPending] = createSignal(false);
  let generation = 0;
  const matches = (value: ContextState) =>
    value.botId === props.botId && (!props.threadId || value.threadId === props.threadId);
  createEffect(
    () => [props.botId, props.threadId] as const,
    ([botId, threadId]) => {
      const serial = ++generation;
      setState(undefined);
      setError("");
      setPending(false);
      if (!api) return;
      void api
        .getState({ botId, threadId })
        .then((next) => {
          if (serial === generation && matches(next)) setState(next);
        })
        .catch((e) => {
          if (serial === generation) setError(providerError(e, "Could not load context."));
        });
    },
  );
  onSettled(() => {
    const subscribe = props.onEvent ?? window.openbot?.agent?.onEvent;
    const off = subscribe?.((event) => {
      if (event.type === "context-changed" && matches(event)) {
        generation++;
        setState(event);
      }
    });
    return () => {
      generation++;
      off?.();
    };
  });
  async function compact() {
    if (!api || !state()?.canCompact || pending() || state()?.compacting) return;
    const serial = ++generation;
    const input = { botId: props.botId, threadId: props.threadId };
    setPending(true);
    setError("");
    try {
      const next = await api.compact(input);
      if (serial === generation && matches(next)) setState(next);
    } catch (e) {
      if (input.botId === props.botId && input.threadId === props.threadId)
        setError(providerError(e, "Could not compact context."));
    } finally {
      if (input.botId === props.botId && input.threadId === props.threadId) setPending(false);
    }
  }
  return (
    <>
      <Show when={error()}>
        <Text as="p" role="alert" tone="danger">
          {error()}
        </Text>
      </Show>
      <Show
        when={state()}
        fallback={
          <Show
            when={api && !error()}
            fallback={
              <Text as="p" tone="secondary">
                {!api
                  ? t("Context information is unavailable in this version.")
                  : t("Context information is unavailable.")}
              </Text>
            }
          >
            <CosgralLoadingSkeleton label={t("Loading context…")} />
          </Show>
        }
      >
        {(value) => <ContextMeter state={value()} pending={pending()} onCompact={() => void compact()} />}
      </Show>
    </>
  );
}
