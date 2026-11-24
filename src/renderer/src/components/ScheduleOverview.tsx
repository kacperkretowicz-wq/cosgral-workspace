import type { ScheduleEntry, ScheduleFeedItem, ScheduleView } from "@openbot/contracts/ipc";
import { createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";
import type { BotProfile } from "../data";
import { appLocale, t, tDataParts } from "../i18n";
import { AgentAvatar } from "./AgentAvatar";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { CosgralPanelState } from "./CosgralPanelState";
import { Button } from "./ui";

const DAY = 86_400_000;
const WINDOWS = [7, 14, 30] as const;

type WindowDays = (typeof WINDOWS)[number];

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(appLocale(), { weekday: "long", day: "numeric", month: "long" });
}

/** "Today" and "Tomorrow" read faster than a date; other days keep the weekday and date. */
function dayLabel(iso: string, now: Date = new Date()): { label: string; relative: boolean } {
  const date = new Date(iso);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diff = Math.floor((date.getTime() - start.getTime()) / DAY);
  if (diff === 0) return { label: t("Today"), relative: true };
  if (diff === 1) return { label: t("Tomorrow"), relative: true };
  if (diff === -1) return { label: t("Yesterday"), relative: true };
  return { label: dayKey(iso), relative: false };
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(appLocale(), { hour: "2-digit", minute: "2-digit" });
}

/** The status of a routine run in the language of the window. */
export function runStatusLabel(status: ScheduleFeedItem["run"]["status"]): string {
  switch (status) {
    case "running":
      return t("Running");
    case "done":
      return t("Done");
    case "failed":
      return t("Failed");
    case "skipped":
      return t("Skipped");
    default:
      return t("Ignored");
  }
}

function statusLabel(entry: ScheduleEntry): string {
  return entry.kind === "planned" ? t("Planned") : runStatusLabel(entry.status);
}

/**
 * The schedule overview (window.openbot.schedule): what the routines will start in the next days, what already ran,
 * the routines that wait for a message from outside or are paused, and a feed of the latest runs.
 */
export function ScheduleOverview(props: { bots?: ReadonlyArray<BotProfile> } = {}) {
  const botOf = (botId: string) => props.bots?.find((bot) => bot.id === botId);
  const api = untrack(() => window.openbot?.schedule);
  const [days, setDays] = createSignal<WindowDays>(14);
  const [view, setView] = createSignal<ScheduleView | null>(null);
  const [feed, setFeed] = createSignal<ScheduleFeedItem[]>([]);
  const [error, setError] = createSignal("");
  let serial = 0;

  async function load(next: WindowDays) {
    if (!api) return;
    const n = ++serial;
    setDays(next);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    try {
      const [window, latest] = await Promise.all([
        api.view({
          from: new Date(start.getTime() - DAY).toISOString(),
          to: new Date(start.getTime() + next * DAY).toISOString(),
        }),
        api.feed({ limit: 20 }),
      ]);
      if (n !== serial) return;
      setView(window);
      setFeed(latest);
      setError("");
    } catch (cause) {
      if (n === serial) setError(cause instanceof Error ? cause.message : t("Could not load the schedule."));
    }
  }

  onSettled(() => {
    void load(days());
    const listen = window.openbot?.agent?.onEvent;
    const off = listen?.((event) => {
      if (event.type === "routines-changed" || event.type === "routine-run") void load(days());
    });
    return () => {
      serial++;
      off?.();
    };
  });

  const groups = createMemo(() => {
    const current = view();
    if (!current) return [];
    const byDay = new Map<string, ScheduleEntry[]>();
    for (const entry of current.entries) {
      const key = dayKey(entry.at);
      byDay.set(key, [...(byDay.get(key) ?? []), entry]);
    }
    return [...byDay.entries()];
  });

  return (
    <section class="schedule-overview" aria-label={t("Schedule overview")}>
      <Show
        when={api}
        fallback={
          <CosgralPanelState kind="unavailable" title={t("The schedule overview is not available in this version.")} />
        }
      >
        <nav class="schedule-windows" aria-label={t("Window")}>
          <For each={WINDOWS}>
            {(value) => (
              <Button
                type="button"
                variant="ghost"
                aria-current={days() === value ? "page" : undefined}
                onClick={() => void load(value)}
              >
                {t("Next {days} days", { days: value })}
              </Button>
            )}
          </For>
        </nav>
        <Show when={error()}>
          {(message) => (
            <CosgralPanelState
              kind="error"
              title={message()}
              actionLabel={t("Retry")}
              onAction={() => void load(days())}
            />
          )}
        </Show>
        <Show
          when={view()}
          fallback={
            <Show when={!error()}>
              <CosgralLoadingSkeleton label={t("Loading schedule…")} />
            </Show>
          }
        >
          {(current) => (
            <>
              <Show when={current().entries.length === 0}>
                <CosgralPanelState
                  kind="empty"
                  title={t("Nothing is planned or has run in this window.")}
                  detail={t("Scheduled and finished routine runs for this period show up here.")}
                />
              </Show>
              <For each={groups()}>
                {([day, entries]) => {
                  const heading = () => dayLabel(entries[0]?.at ?? new Date().toISOString());
                  return (
                    <section class="schedule-day" data-relative={heading().relative ? "true" : undefined}>
                      <h3>
                        <span>{heading().label}</span>
                        <Show when={heading().relative}>
                          <small>{day}</small>
                        </Show>
                      </h3>
                      <ul>
                        <For each={entries}>
                          {(entry) => (
                            <li class="schedule-entry" data-kind={entry.kind}>
                              <time datetime={entry.at}>{timeOf(entry.at)}</time>
                              <span class="schedule-dot" aria-hidden="true" />
                              <Show when={botOf(entry.botId)}>
                                {(bot) => (
                                  <AgentAvatar
                                    bot={bot()}
                                    class="schedule-avatar"
                                    mood={entry.kind === "ran" && entry.status === "running" ? "working" : "idle"}
                                  />
                                )}
                              </Show>
                              <span class="schedule-entry-copy">
                                <strong>{entry.routineName}</strong>
                                <Show when={botOf(entry.botId)?.name ?? (entry.kind === "ran" ? entry.reason : null)}>
                                  <small>
                                    {botOf(entry.botId)?.name}
                                    {entry.kind === "ran" && entry.reason ? ` · ${tDataParts(entry.reason)}` : ""}
                                  </small>
                                </Show>
                              </span>
                              <span
                                class="schedule-status"
                                data-status={entry.kind === "ran" ? entry.status : "planned"}
                              >
                                {statusLabel(entry)}
                              </span>
                            </li>
                          )}
                        </For>
                      </ul>
                    </section>
                  );
                }}
              </For>
              <Show when={current().truncated}>
                <p class="schedule-note">{t("The list is cut; narrow the window to see everything.")}</p>
              </Show>
              <Show when={current().webhooks.length + current().paused.length > 0}>
                <section class="schedule-aside" aria-label={t("Routines without planned starts")}>
                  <Show when={current().webhooks.length > 0}>
                    <p>
                      <strong>{t("Start by a message from outside")}:</strong>{" "}
                      {current()
                        .webhooks.map((routine) => routine.routineName)
                        .join(", ")}
                    </p>
                  </Show>
                  <Show when={current().paused.length > 0}>
                    <p>
                      <strong>{t("Paused")}:</strong>{" "}
                      {current()
                        .paused.map((routine) => routine.routineName)
                        .join(", ")}
                    </p>
                  </Show>
                </section>
              </Show>
            </>
          )}
        </Show>

        <Show when={feed().length > 0}>
          <section class="schedule-feed" aria-label={t("Latest runs")}>
            <h3>{t("Latest runs")}</h3>
            <ul>
              <For each={feed()}>
                {(item) => (
                  <li class="schedule-entry schedule-feed-entry" data-kind="ran">
                    <Show when={botOf(item.run.botId)} fallback={<span class="schedule-dot" aria-hidden="true" />}>
                      {(bot) => <AgentAvatar bot={bot()} class="schedule-avatar" />}
                    </Show>
                    <span class="schedule-entry-copy">
                      <strong>{item.routineName}</strong>
                      <small>
                        {item.agentName ?? t("Removed agent")} · {dayLabel(item.run.startedAt).label}{" "}
                        <time datetime={item.run.startedAt}>{timeOf(item.run.startedAt)}</time>
                      </small>
                    </span>
                    <span class="schedule-status" data-status={item.run.status}>
                      {runStatusLabel(item.run.status)}
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
      </Show>
    </section>
  );
}
