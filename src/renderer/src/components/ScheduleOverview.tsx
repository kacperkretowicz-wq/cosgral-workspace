import type { ScheduleEntry, ScheduleFeedItem, ScheduleView } from "@openbot/contracts/ipc";
import { createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";
import type { BotProfile } from "../data";
import { appLocale, t, tDataParts } from "../i18n";
import { addMonths, localDayKey, monthCells, monthWindow, startOfMonth } from "../schedule-month";
import { AgentAvatar } from "./AgentAvatar";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { CosgralPanelState } from "./CosgralPanelState";
import { Button } from "./ui";
import { ChevronLeft, ChevronRight } from "./ui/icons";

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

const MISSED_RUN = "COSGRAL Workspace was not running at the planned time; missed runs are not made up.";

/**
 * Why a run was skipped or ended, in the language of the window. Runs saved before 24.11.2026 have the time inside the
 * missed-run sentence ("was not running at 23/11/2026, 16:06; …"); the row shows the time anyway, so they read the same.
 */
export function runReasonText(reason: string): string {
  const fixed = /^COSGRAL Workspace was not running at .+; missed runs are not made up\.$/.test(reason)
    ? MISSED_RUN
    : reason;
  return tDataParts(fixed);
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
  const [mode, setMode] = createSignal<"list" | "month">("list");
  const [month, setMonth] = createSignal(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = createSignal<string | null>(localDayKey(new Date()));
  const [view, setView] = createSignal<ScheduleView | null>(null);
  const [feed, setFeed] = createSignal<ScheduleFeedItem[]>([]);
  const [error, setError] = createSignal("");
  let serial = 0;

  // Signal writes are batched: the new values are passed in instead of read back right after setting them.
  async function reload(
    next: { mode: "list" | "month"; days: WindowDays; month: Date } = { mode: mode(), days: days(), month: month() },
  ) {
    if (!api) return;
    const n = ++serial;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const range =
      next.mode === "month"
        ? monthWindow(monthCells(next.month))
        : {
            from: new Date(start.getTime() - DAY).toISOString(),
            to: new Date(start.getTime() + next.days * DAY).toISOString(),
          };
    try {
      const [window, latest] = await Promise.all([api.view(range), api.feed({ limit: 20 })]);
      if (n !== serial) return;
      setView(window);
      setFeed(latest);
      setError("");
    } catch (cause) {
      if (n === serial) setError(cause instanceof Error ? cause.message : t("Could not load the schedule."));
    }
  }

  function load(next: WindowDays) {
    setDays(next);
    return reload({ mode: mode(), days: next, month: month() });
  }

  function showMode(next: "list" | "month") {
    if (mode() === next) return;
    setMode(next);
    return reload({ mode: next, days: days(), month: month() });
  }

  function moveMonth(delta: number) {
    const target = addMonths(month(), delta);
    setMonth(target);
    setSelectedDay(null);
    return reload({ mode: "month", days: days(), month: target });
  }

  onSettled(() => {
    void reload();
    const listen = window.openbot?.agent?.onEvent;
    const off = listen?.((event) => {
      if (event.type === "routines-changed" || event.type === "routine-run") void reload();
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
    const all = [...byDay.entries()];
    if (mode() !== "month") return all;
    // The month shows one chosen day under the grid.
    return all.filter(([, entries]) => localDayKey(new Date(entries[0]?.at ?? 0)) === selectedDay());
  });

  const cells = createMemo(() => monthCells(month()));
  const countsByDay = createMemo(() => {
    const counts = new Map<string, { planned: number; ran: number; failed: number }>();
    for (const entry of view()?.entries ?? []) {
      const key = localDayKey(new Date(entry.at));
      const count = counts.get(key) ?? { planned: 0, ran: 0, failed: 0 };
      if (entry.kind === "planned") count.planned += 1;
      else if (entry.status === "failed") count.failed += 1;
      else count.ran += 1;
      counts.set(key, count);
    }
    return counts;
  });
  const monthTitle = () => month().toLocaleDateString(appLocale(), { month: "long", year: "numeric" });
  const weekdayNames = () =>
    Array.from({ length: 7 }, (_, index) =>
      new Date(2026, 0, 5 + index).toLocaleDateString(appLocale(), { weekday: "short" }),
    );

  return (
    <section class="schedule-overview" aria-label={t("Schedule overview")}>
      <Show
        when={api}
        fallback={
          <CosgralPanelState kind="unavailable" title={t("The schedule overview is not available in this version.")} />
        }
      >
        <nav class="schedule-windows" aria-label={t("View")}>
          <Button
            type="button"
            variant="ghost"
            aria-current={mode() === "list" ? "page" : undefined}
            onClick={() => void showMode("list")}
          >
            {t("List")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-current={mode() === "month" ? "page" : undefined}
            onClick={() => void showMode("month")}
          >
            {t("Month")}
          </Button>
        </nav>
        <Show when={mode() === "list"}>
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
        </Show>
        <Show when={error()}>
          {(message) => (
            <CosgralPanelState kind="error" title={message()} actionLabel={t("Retry")} onAction={() => void reload()} />
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
              <Show when={mode() === "month"}>
                <div class="schedule-month">
                  <div class="schedule-month-bar">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t("Previous month")}
                      onClick={() => void moveMonth(-1)}
                    >
                      <ChevronLeft aria-hidden="true" />
                    </Button>
                    <h3>{monthTitle()}</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={t("Next month")}
                      onClick={() => void moveMonth(1)}
                    >
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                  <div class="schedule-month-head" aria-hidden="true">
                    <For each={weekdayNames()}>{(name) => <span>{name}</span>}</For>
                  </div>
                  <section class="schedule-month-grid" aria-label={monthTitle()}>
                    <For each={cells()}>
                      {(cell) => {
                        const key = localDayKey(cell);
                        const count = () => countsByDay().get(key) ?? { planned: 0, ran: 0, failed: 0 };
                        return (
                          <button
                            type="button"
                            class="schedule-month-cell"
                            data-outside={cell.getMonth() !== month().getMonth() ? "true" : undefined}
                            data-today={key === localDayKey(new Date()) ? "true" : undefined}
                            aria-pressed={selectedDay() === key ? "true" : "false"}
                            aria-label={t("{date}: planned {planned}, done {ran}, failed {failed}", {
                              date: cell.toLocaleDateString(appLocale(), { day: "numeric", month: "long" }),
                              planned: count().planned,
                              ran: count().ran,
                              failed: count().failed,
                            })}
                            onClick={() => void setSelectedDay(key)}
                          >
                            <span class="schedule-month-number">{cell.getDate()}</span>
                            <span class="schedule-month-counts" aria-hidden="true">
                              <Show when={count().planned > 0}>
                                <span data-kind="planned">{count().planned}</span>
                              </Show>
                              <Show when={count().ran > 0}>
                                <span data-kind="done">{count().ran}</span>
                              </Show>
                              <Show when={count().failed > 0}>
                                <span data-kind="failed">{count().failed}</span>
                              </Show>
                            </span>
                          </button>
                        );
                      }}
                    </For>
                  </section>
                  <Show when={!selectedDay() || groups().length === 0}>
                    <p class="schedule-note">
                      {selectedDay()
                        ? t("Nothing is planned or has run on this day.")
                        : t("Pick a day to see its runs.")}
                    </p>
                  </Show>
                </div>
              </Show>
              <Show when={mode() === "list" && current().entries.length === 0}>
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
                                    {entry.kind === "ran" && entry.reason ? ` · ${runReasonText(entry.reason)}` : ""}
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
