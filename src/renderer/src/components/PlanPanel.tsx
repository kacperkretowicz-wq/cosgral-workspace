import { type AgentPlan, type PlansDesktopApi, planProgress } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";
import { createThreadRecords } from "../thread-records";
import { Button, Heading, Text } from "./ui";
import "../styles/thread-work.css";

const PHASE_LABELS = {
  proposed: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  expired: "Expired — not approved",
  stopped: "Stopped",
  completed: "Completed",
};
const STEP_LABELS = { pending: "Pending", "in-progress": "In progress", done: "Done", skipped: "Skipped" };
export function PlanCard(props: { plan: AgentPlan; api?: PlansDesktopApi }) {
  const api = untrack(() => props.api ?? window.openbot?.plans);
  const [value, setValue] = createSignal(untrack(() => props.plan));
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  createEffect(
    () => props.plan,
    (next) => {
      setValue(next);
      setError("");
    },
  );
  async function respond(decision: "approve" | "reject") {
    if (!api || busy() || value().phase !== "proposed") return;
    const id = value().requestId;
    setBusy(true);
    setError("");
    try {
      const next = await api.respond({ requestId: id, decision });
      if (value().requestId === id) setValue(next);
    } catch (e) {
      if (value().requestId === id) setError(e instanceof Error ? e.message : "Could not answer this plan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="thread-work-card" aria-label={`Plan: ${value().title}`}>
      <header class="thread-work-heading">
        <Heading as="h3" size="sm">
          {value().title}
        </Heading>
        <Text tone="secondary">{PHASE_LABELS[value().phase]}</Text>
      </header>
      <Show when={value().summary}>
        <Text as="p">{value().summary}</Text>
      </Show>
      <Text as="p" tone="secondary">
        {planProgress(value()).finished} of {planProgress(value()).total} steps finished
      </Text>
      <progress
        class="thread-work-progress"
        aria-label="Plan progress"
        value={planProgress(value()).finished}
        max={Math.max(1, planProgress(value()).total)}
      />
      <ol class="thread-work-steps">
        <For each={value().steps}>
          {(step) => (
            <li>
              <Text as="span">{step.title}</Text>{" "}
              <Text as="span" tone="secondary">
                {STEP_LABELS[step.status]}
              </Text>
              <Show when={step.detail}>
                <Text as="p" tone="secondary">
                  {step.detail}
                </Text>
              </Show>
            </li>
          )}
        </For>
      </ol>
      <Show when={value().phase === "proposed"}>
        <Text as="p" tone="secondary">
          No steps are approved until you choose Approve plan.
        </Text>
        <div class="thread-work-actions">
          <Button disabled={!api || busy()} onClick={() => void respond("approve")}>
            Approve plan
          </Button>
          <Button disabled={!api || busy()} variant="secondary" onClick={() => void respond("reject")}>
            Reject plan
          </Button>
        </div>
      </Show>
      <Show when={error()}>
        <Text as="p" tone="danger" role="alert">
          {error()}
        </Text>
      </Show>
    </section>
  );
}
export function PlanPanel(props: { botId: string; threadId?: string | null; activeRequestId?: string | number }) {
  const api = untrack(() => window.openbot?.plans);
  const feed = createThreadRecords<AgentPlan>({
    enabled: Boolean(api),
    params: () => ({ botId: props.botId, threadId: props.threadId }),
    list: (params) => api?.list(params) ?? Promise.resolve([]),
    key: (plan) => plan.requestId,
    fromEvent: (event) => (event.type === "plan-changed" ? event.plan : undefined),
  });
  const visible = () => feed.records().filter((plan) => plan.requestId !== props.activeRequestId);
  return (
    <Show when={api && (visible().length > 0 || feed.error())}>
      <details class="thread-work-section" open>
        <summary>Plans ({visible().length})</summary>
        <section class="thread-work-list" aria-label="Thread plans" tabindex={0}>
          <Show when={feed.error()}>
            <Text role="alert" tone="danger">
              {feed.error()}
            </Text>
          </Show>
          <For each={visible()}>{(plan) => <PlanCard plan={plan} api={api} />}</For>
        </section>
      </details>
    </Show>
  );
}
