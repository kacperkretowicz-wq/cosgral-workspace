import type {
  ChannelTaskState,
  TaskDetail,
  TaskDetailAction,
  TasksViewPage,
  TasksViewScope,
} from "@openbot/contracts/ipc";
import { CHANNEL_TASK_STATES } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Badge, type BadgeTone, Button, Input, NativeSelect } from "./ui";

const STATE_VIEW: Record<ChannelTaskState, { label: string; tone: BadgeTone }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "accent" },
  waiting: { label: "Waiting", tone: "warning" },
  paused: { label: "Paused", tone: "warning" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Stopped", tone: "neutral" },
};

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
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString()} ${time}`;
}

/**
 * The Tasks page on window.openbot.tasksView: one list of the tasks of all channels with scope tabs and state chips (each with
 * its count), search, the steps of a task, and a detail panel with the request, the result, the steps, the log and the
 * actions the engine allows now (with the reason when it does not). "Open as chat" shows the channel at the task's message.
 */
export function TasksViewScreen(props: {
  bots: Array<{ id: string; name: string }>;
  onOpenChannel?: (channelId: string, anchorMessageId?: string) => void;
}) {
  const view = untrack(() => window.openbot?.tasksView);
  const channels = untrack(() => window.openbot?.channels);
  const [page, setPage] = createSignal<TasksViewPage | null>(null);
  const [scope, setScope] = createSignal<TasksViewScope>("active");
  const [state, setState] = createSignal<ChannelTaskState | "">("");
  const [query, setQuery] = createSignal("");
  const [detail, setDetail] = createSignal<TaskDetail | null>(null);
  const [owner, setOwner] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let serial = 0;

  async function load() {
    if (!view) return;
    const n = ++serial;
    try {
      const chosen = state();
      const next = await view.list({
        scope: scope(),
        query: query().trim(),
        ...(chosen ? { states: [chosen] } : {}),
      });
      if (n !== serial) return;
      setPage(next);
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

  const choose = (next: () => void) => {
    next();
    setDetail(null);
    void load();
  };

  return (
    <main class="w2-library tasks-screen" aria-label={t("Tasks")}>
      <header>
        <h1>{t("Tasks")}</h1>
        <p class="tasks-screen-note">
          {t("Tasks from all channels. Stop, pause, resume or archive them here; the channel keeps the conversation.")}
        </p>
      </header>
      <Show
        when={view}
        fallback={<p class="tasks-screen-note">{t("The task list is not available in this version.")}</p>}
      >
        <nav class="tasks-scopes" aria-label={t("Show")}>
          <Button
            type="button"
            variant="ghost"
            aria-current={scope() === "active" ? "page" : undefined}
            onClick={() => choose(() => setScope("active"))}
          >
            {t("Active")} <span class="tasks-count">{page()?.counts.active ?? 0}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-current={scope() === "archived" ? "page" : undefined}
            onClick={() => choose(() => setScope("archived"))}
          >
            {t("Archived")} <span class="tasks-count">{page()?.counts.archived ?? 0}</span>
          </Button>
        </nav>
        <fieldset class="tasks-chips">
          <legend class="sr-only">{t("Status")}</legend>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-pressed={state() === "" ? "true" : "false"}
            onClick={() => choose(() => setState(""))}
          >
            {t("All")}
          </Button>
          <For each={CHANNEL_TASK_STATES}>
            {(item) => (
              <Show when={(page()?.counts.byState[item] ?? 0) > 0 || state() === item}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  aria-pressed={state() === item ? "true" : "false"}
                  onClick={() => choose(() => setState(item))}
                >
                  {t(STATE_VIEW[item].label)} <span class="tasks-count">{page()?.counts.byState[item] ?? 0}</span>
                </Button>
              </Show>
            )}
          </For>
        </fieldset>
        <form
          class="tasks-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <Input
            type="search"
            class="tasks-search"
            aria-label={t("Search tasks")}
            placeholder={t("Search tasks")}
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </form>
        <Show when={error()}>
          <p class="tasks-screen-error" role="alert">
            {error()}
          </p>
        </Show>

        <div class="tasks-split">
          <Show when={page()} fallback={<p role="status">{t("Loading tasks…")}</p>}>
            {(current) => (
              <ul class="tasks-screen-list" aria-label={t("Tasks")}>
                <Show when={current().items.length === 0}>
                  <li class="tasks-screen-note">{t("No tasks here yet.")}</li>
                </Show>
                <For each={current().items}>
                  {(item) => (
                    <li data-state={item.task.state} data-open={detail()?.task.id === item.task.id ? "true" : "false"}>
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
                  <For each={task().actions.filter((item) => item.action !== "reassign")}>
                    {(item) => (
                      <Button
                        type="button"
                        variant={item.action === "stop" ? "danger" : "secondary"}
                        disabled={!item.enabled || busy()}
                        title={item.reason ?? undefined}
                        onClick={() => void act(item.action)}
                      >
                        {actionLabel(item.action)}
                      </Button>
                    )}
                  </For>
                </div>
                <For each={task().actions.filter((item) => !item.enabled && item.reason)}>
                  {(item) => (
                    <p class="tasks-screen-note">
                      {actionLabel(item.action)}: {item.reason}
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
                    <ul class="tasks-detail-steps">
                      <For each={task().steps}>
                        {(step) => (
                          <li>
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
      </Show>
    </main>
  );
}
