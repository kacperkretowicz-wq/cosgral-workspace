import type {
  ChannelTaskState,
  TaskDetail,
  TaskDetailAction,
  TasksBoard,
  TasksBoardColumnId,
  TasksViewCounts,
  TasksViewPage,
  TasksViewScope,
} from "@openbot/contracts/ipc";
import { CHANNEL_TASK_STATES } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { appLocale, t, tData } from "../i18n";
import "../styles/tasks-detail.css";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Badge, type BadgeTone, Button, Input, NativeSelect } from "./ui";
import { CircleAlert, MessageCircleQuestion, Pause, Search, X, Zap } from "./ui/icons";
import { WorkPage } from "./WorkPage";

const STATE_VIEW: Record<ChannelTaskState, { label: string; tone: BadgeTone }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "accent" },
  waiting: { label: "Waiting", tone: "warning" },
  paused: { label: "Paused", tone: "warning" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Stopped", tone: "neutral" },
};

const BOARD_COLUMN_TITLE: Record<TasksBoardColumnId, string> = {
  "needs-you": "Needs you",
  working: "Working",
  paused: "Paused",
  failed: "Failed",
  cancelled: "Stopped",
};

const BOARD_COLUMN_ICON = {
  "needs-you": MessageCircleQuestion,
  working: Zap,
  paused: Pause,
  failed: CircleAlert,
  cancelled: X,
} as const;

function actionLabel(action: TaskDetailAction): string {
  switch (action) {
    case "stop":
      return t("Stop");
    case "pause":
      return t("Pause");
    case "resume":
      return t("Resume");
    case "archive":
      return t("Archive");
    case "restore":
      return t("Restore");
    default:
      return t("Give to another agent");
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString(appLocale(), { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString(appLocale())} ${time}`;
}

/**
 * The Tasks page on window.openbot.tasksView: board columns (needs you, working, paused, failed, stopped) from
 * tasksView.board when Active has no chip and no search; otherwise one list. Scope tabs, state chips, search, detail
 * panel with request/result/steps/log and engine actions. "Open as chat" shows the channel at the task's message.
 */
/** Why an action is off, as the service says it, in the app language when the dictionary knows the sentence. */
function reasonText(reason: string): string {
  return tData(reason);
}

/**
 * Reasons that only repeat the task's state (Stop on a finished task, Restore on one that is not archived): the action
 * is simply not offered. Any other reason (the task cannot start now, only a human may resume it) is said under the
 * buttons, because the person would expect the action to work.
 */
const STATE_REASONS = new Set([
  "Only a paused or stopped task can be resumed.",
  "This task is not archived.",
  "This task is finished.",
  "This task is already finished.",
  "This task is not running.",
  "This task is stopped.",
]);

export function TasksViewScreen(props: {
  bots: Array<{ id: string; name: string }>;
  onOpenChannel?: (channelId: string, anchorMessageId?: string) => void;
}) {
  const view = untrack(() => window.openbot?.tasksView);
  const channels = untrack(() => window.openbot?.channels);
  const [page, setPage] = createSignal<TasksViewPage | null>(null);
  const [board, setBoard] = createSignal<TasksBoard | null>(null);
  const [scope, setScope] = createSignal<TasksViewScope>("active");
  const [state, setState] = createSignal<ChannelTaskState | "">("");
  const [query, setQuery] = createSignal("");
  const [detail, setDetail] = createSignal<TaskDetail | null>(null);
  const [owner, setOwner] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let serial = 0;

  const showBoard = (nextScope: TasksViewScope, nextState: ChannelTaskState | "", nextQuery: string) =>
    nextScope === "active" && !nextState && !nextQuery.trim();

  async function load(patch: { scope?: TasksViewScope; state?: ChannelTaskState | "" } = {}) {
    if (!view) return;
    const n = ++serial;
    const nextScope = patch.scope ?? scope();
    const nextState = patch.state ?? state();
    const nextQuery = query().trim();
    try {
      if (showBoard(nextScope, nextState, nextQuery)) {
        const next = await view.board({ scope: nextScope, ...(nextQuery ? { query: nextQuery } : {}) });
        if (n !== serial) return;
        setBoard(next);
        setPage(null);
      } else {
        const next = await view.list({
          scope: nextScope,
          query: nextQuery,
          ...(nextState ? { states: [nextState] } : {}),
        });
        if (n !== serial) return;
        setPage(next);
        setBoard(null);
      }
      setError("");
      const open = detail();
      if (open) setDetail(await view.detail({ taskId: open.task.id }));
    } catch (cause) {
      if (n === serial) setError(cause instanceof Error ? cause.message : t("Could not load the tasks."));
    }
  }

  onSettled(() => {
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "task-changed" || event.type === "channels-changed") void load();
    });
    return () => {
      serial++;
      off?.();
    };
  });

  async function open(taskId: string) {
    if (!view) return;
    try {
      setDetail(await view.detail({ taskId }));
      setOwner("");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not load the task."));
    }
  }

  async function act(action: TaskDetailAction) {
    const current = detail();
    if (!current || !channels || busy()) return;
    setBusy(true);
    setError("");
    try {
      if (action === "reassign") {
        if (owner()) await channels.reassignTask({ taskId: current.task.id, ownerBotId: owner() });
      } else {
        await channels.actOnTask({ taskId: current.task.id, action });
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change the task."));
    } finally {
      setBusy(false);
    }
  }

  const choose = (patch: { scope?: TasksViewScope; state?: ChannelTaskState | "" }) => {
    if (patch.scope !== undefined) setScope(patch.scope);
    if (patch.state !== undefined) setState(patch.state);
    setDetail(null);
    void load(patch);
  };

  const counts = (): TasksViewCounts | undefined => board()?.counts ?? page()?.counts;

  const boardColumns = () => {
    const columns = board()?.columns ?? [];
    return columns.map((column) => ({
      id: column.id,
      title: BOARD_COLUMN_TITLE[column.id],
      items: column.items,
      total: column.total,
      hasMore: column.hasMore,
    }));
  };

  const ready = () => board() !== null || page() !== null;

  return (
    <WorkPage
      page="tasks"
      class="tasks-screen"
      label={t("Tasks")}
      title={t("Tasks")}
      description={t("Hand off the work. Come back to an answer.")}
    >
      <Show
        when={view}
        fallback={<p class="tasks-screen-note">{t("The task list is not available in this version.")}</p>}
      >
        <div class="tasks-body">
          <div class="tasks-toolbar">
            <nav class="tasks-scopes" aria-label={t("Show")}>
              <Button
                type="button"
                variant="ghost"
                aria-current={scope() === "active" ? "page" : undefined}
                onClick={() => choose({ scope: "active" })}
              >
                {t("Active")} <span class="tasks-count">{counts()?.active ?? 0}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                aria-current={scope() === "archived" ? "page" : undefined}
                onClick={() => choose({ scope: "archived" })}
              >
                {t("Archived")} <span class="tasks-count">{counts()?.archived ?? 0}</span>
              </Button>
            </nav>
            <form
              class="tasks-search-form"
              onSubmit={(event) => {
                event.preventDefault();
                void load();
              }}
            >
              <Search aria-hidden="true" size={15} stroke-width={1.75} />
              <Input
                type="search"
                class="tasks-search"
                aria-label={t("Search tasks")}
                placeholder={t("Search tasks")}
                value={query()}
                onInput={(event) => setQuery(event.currentTarget.value)}
              />
            </form>
          </div>
          <fieldset class="tasks-chips">
            <legend class="sr-only">{t("Status")}</legend>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-state="all"
              aria-pressed={state() === "" ? "true" : "false"}
              onClick={() => choose({ state: "" })}
            >
              {t("All")}
            </Button>
            <For each={CHANNEL_TASK_STATES}>
              {(item) => (
                <Show when={(counts()?.byState[item] ?? 0) > 0 || state() === item}>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    data-state={item}
                    aria-pressed={state() === item ? "true" : "false"}
                    onClick={() => choose({ state: item })}
                  >
                    {t(STATE_VIEW[item].label)} <span class="tasks-count">{counts()?.byState[item] ?? 0}</span>
                  </Button>
                </Show>
              )}
            </For>
          </fieldset>
          <Show when={error()}>
            <p class="tasks-screen-error" role="alert">
              {error()}
            </p>
          </Show>

          <div class="tasks-split">
            <Show when={ready()} fallback={<CosgralLoadingSkeleton label={t("Loading tasks…")} />}>
              <div class="tasks-board">
                <Show when={board()}>
                  <div class="tasks-board-columns">
                    <For each={boardColumns()}>
                      {(group) => (
                        <section class="tasks-board-column" data-column={group.id} aria-label={t(group.title)}>
                          <h2 class="tasks-board-heading">
                            <span class="tasks-board-icon" aria-hidden="true">
                              {(() => {
                                const Icon = BOARD_COLUMN_ICON[group.id];
                                return <Icon size={15} stroke-width={2} />;
                              })()}
                            </span>
                            <span class="tasks-board-title">{t(group.title)}</span>
                            <span class="tasks-count">{group.total}</span>
                          </h2>
                          <ul class="tasks-screen-list">
                            <Show when={group.items.length === 0}>
                              <li class="tasks-screen-note">{t("No tasks here yet.")}</li>
                            </Show>
                            <For each={group.items}>
                              {(item) => (
                                <li
                                  data-state={item.task.state}
                                  data-open={detail()?.task.id === item.task.id ? "true" : "false"}
                                >
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    class="tasks-screen-row"
                                    onClick={() => void open(item.task.id)}
                                  >
                                    <span class="tasks-screen-title">{item.task.title}</span>
                                    <span class="tasks-screen-meta">
                                      #{item.channelName} · {item.ownerName ?? t("Removed agent")} ·{" "}
                                      {formatTime(item.task.updatedAt)}
                                    </span>
                                    <Badge tone={STATE_VIEW[item.task.state].tone} dot>
                                      {t(STATE_VIEW[item.task.state].label)}
                                    </Badge>
                                  </Button>
                                </li>
                              )}
                            </For>
                            <Show when={group.hasMore}>
                              <li class="tasks-screen-note">{t("More in the full list.")}</li>
                            </Show>
                          </ul>
                        </section>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={page()}>
                  {(current) => (
                    <ul class="tasks-screen-list" aria-label={t("Tasks")}>
                      <Show when={current().items.length === 0}>
                        <li class="tasks-screen-note">{t("No tasks here yet.")}</li>
                      </Show>
                      <For each={current().items}>
                        {(item) => (
                          <li
                            data-state={item.task.state}
                            data-open={detail()?.task.id === item.task.id ? "true" : "false"}
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              class="tasks-screen-row"
                              onClick={() => void open(item.task.id)}
                            >
                              <span class="tasks-screen-title">{item.task.title}</span>
                              <span class="tasks-screen-meta">
                                #{item.channelName} · {item.ownerName ?? t("Removed agent")} ·{" "}
                                {formatTime(item.task.updatedAt)}
                                <Show when={item.stepCount > 0}>
                                  {" "}
                                  · {t("{done}/{total} steps", { done: item.stepsDone, total: item.stepCount })}
                                </Show>
                              </span>
                              <Show when={item.resultPreview}>
                                <span class="tasks-screen-preview">{item.resultPreview}</span>
                              </Show>
                              <Badge tone={STATE_VIEW[item.task.state].tone} dot>
                                {t(STATE_VIEW[item.task.state].label)}
                              </Badge>
                            </Button>
                          </li>
                        )}
                      </For>
                    </ul>
                  )}
                </Show>
              </div>
            </Show>

            <Show when={detail()}>
              {(task) => (
                <section class="tasks-detail" aria-label={t("Task details")}>
                  <header>
                    <h2>{task().task.title}</h2>
                    <Button type="button" variant="ghost" onClick={() => setDetail(null)}>
                      {t("Close")}
                    </Button>
                  </header>
                  <p class="tasks-screen-note">
                    #{task().channelName} · {task().ownerName ?? t("Removed agent")} ·{" "}
                    {t(STATE_VIEW[task().task.state].label)}
                  </p>
                  <div class="tasks-detail-actions">
                    <Show when={props.onOpenChannel}>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() =>
                          props.onOpenChannel?.(task().openAsChat.channelId, task().openAsChat.anchorMessageId)
                        }
                      >
                        {t("Open as chat")}
                      </Button>
                    </Show>
                    <For
                      each={task().actions.filter(
                        (item) =>
                          item.action !== "reassign" &&
                          (item.enabled || !item.reason || !STATE_REASONS.has(item.reason)),
                      )}
                    >
                      {(item) => (
                        <Button
                          type="button"
                          variant={item.action === "stop" ? "danger" : "secondary"}
                          disabled={!item.enabled || busy()}
                          title={item.reason ? reasonText(item.reason) : undefined}
                          onClick={() => void act(item.action)}
                        >
                          {actionLabel(item.action)}
                        </Button>
                      )}
                    </For>
                  </div>
                  <For
                    each={task().actions.filter(
                      (item) => !item.enabled && item.reason && !STATE_REASONS.has(item.reason),
                    )}
                  >
                    {(item) => (
                      <p class="tasks-screen-note">
                        {actionLabel(item.action)}: {reasonText(item.reason ?? "")}
                      </p>
                    )}
                  </For>
                  <Show when={task().actions.find((item) => item.action === "reassign" && item.enabled)}>
                    <div class="tasks-detail-actions">
                      <NativeSelect
                        aria-label={t("Agent")}
                        value={owner()}
                        onChange={(event) => setOwner(event.currentTarget.value)}
                      >
                        <option value="">{t("Choose an agent")}</option>
                        <For each={props.bots}>{(bot) => <option value={bot.id}>{bot.name}</option>}</For>
                      </NativeSelect>
                      <Button type="button" disabled={!owner() || busy()} onClick={() => void act("reassign")}>
                        {t("Give to another agent")}
                      </Button>
                    </div>
                  </Show>

                  <Show when={task().request}>
                    {(request) => (
                      <section>
                        <h3>{t("Request")}</h3>
                        <p class="tasks-detail-text">{request().text}</p>
                      </section>
                    )}
                  </Show>
                  <Show when={task().result}>
                    {(result) => (
                      <section>
                        <h3>{t("Result")}</h3>
                        <p class="tasks-detail-text">{result().text}</p>
                      </section>
                    )}
                  </Show>
                  <Show when={task().steps.length > 0}>
                    <section>
                      <h3>{t("Steps")}</h3>
                      <p class="tasks-screen-note">
                        {t("{done} of {total} steps done", {
                          done: task().steps.filter((step) => step.state === "done").length,
                          total: task().steps.length,
                        })}
                      </p>
                      <div class="tasks-progress" aria-hidden="true">
                        <span
                          style={{
                            width: `${Math.round((task().steps.filter((step) => step.state === "done").length / task().steps.length) * 100)}%`,
                          }}
                        />
                      </div>
                      <ul class="tasks-detail-steps">
                        <For each={task().steps}>
                          {(step) => (
                            <li data-state={step.state}>
                              <span>{step.title}</span>
                              <Badge tone={STATE_VIEW[step.state].tone} dot>
                                {t(STATE_VIEW[step.state].label)}
                              </Badge>
                              <small>{step.ownerName ?? t("Removed agent")}</small>
                            </li>
                          )}
                        </For>
                      </ul>
                    </section>
                  </Show>
                  <Show when={task().log.length > 0}>
                    <section>
                      <h3>{t("Activity")}</h3>
                      <ul class="tasks-detail-log">
                        <For each={task().log}>
                          {(entry) => (
                            <li data-superseded={entry.superseded ? "true" : "false"}>
                              <time datetime={entry.at}>{formatTime(entry.at)}</time>
                              <strong>{entry.botName ?? t("You")}</strong>
                              <span>{entry.text}</span>
                            </li>
                          )}
                        </For>
                      </ul>
                      <Show when={task().logTruncated}>
                        <p class="tasks-screen-note">{t("Older entries are not shown.")}</p>
                      </Show>
                    </section>
                  </Show>
                </section>
              )}
            </Show>
          </div>
        </div>
      </Show>
    </WorkPage>
  );
}
