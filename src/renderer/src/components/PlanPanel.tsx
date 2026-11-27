import { type AgentPlan, type PlansDesktopApi, planProgress } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, Show, untrack } from "solid-js";
import { errorText } from "../errors";
import { t } from "../i18n";
import { createThreadRecords } from "../thread-records";
import { Button, Heading, Text } from "./ui";
import "../styles/thread-work.css";

function phaseLabel(phase: AgentPlan["phase"]): string {
  if (phase === "proposed") return t("Awaiting approval");
  if (phase === "approved") return t("Approved");
  if (phase === "rejected") return t("Rejected");
  if (phase === "expired") return t("Expired — not approved");
  if (phase === "stopped") return t("Stopped");
  return t("Completed");
}

function stepLabel(status: AgentPlan["steps"][number]["status"]): string {
  if (status === "pending") return t("Pending");
  if (status === "in-progress") return t("In progress");
  if (status === "done") return t("Done");
  return t("Skipped");
}

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
      if (value().requestId === id) setError(errorText(e, t("Could not answer this plan.")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section class="thread-work-card" aria-label={t("Plan: {title}", { title: value().title })}>
      <header class="thread-work-heading">
        <Heading as="h3" size="sm">
          {value().title}
        </Heading>
        <Text tone="secondary">{phaseLabel(value().phase)}</Text>
      </header>
      <Show when={value().summary}>
        <Text as="p">{value().summary}</Text>
      </Show>
      <Text as="p" tone="secondary">
        {t("{finished} of {total} steps finished", {
          finished: planProgress(value()).finished,
          total: planProgress(value()).total,
        })}
      </Text>
      <progress
        class="thread-work-progress"
        aria-label={t("Plan progress")}
        value={planProgress(value()).finished}
        max={Math.max(1, planProgress(value()).total)}
      />
      <ol class="thread-work-steps">
        <For each={value().steps}>
          {(step) => (
            <li>
              <Text as="span">{step.title}</Text>{" "}
              <Text as="span" tone="secondary">
                {stepLabel(step.status)}
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
          {t("No steps are approved until you choose Approve plan.")}
        </Text>
        <div class="thread-work-actions">
          <Button disabled={!api || busy()} onClick={() => void respond("approve")}>
            {t("Approve plan")}
          </Button>
          <Button disabled={!api || busy()} variant="secondary" onClick={() => void respond("reject")}>
            {t("Reject plan")}
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
        <summary>{t("Plans ({count})", { count: visible().length })}</summary>
        <section class="thread-work-list" aria-label={t("Thread plans")} tabindex={0}>
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
