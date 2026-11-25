import type { ChannelTask, ChannelTaskAction, ChannelTaskState, WorkspaceChannel } from "@openbot/contracts/ipc";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { appLocale, t } from "../i18n";
import { Badge, type BadgeTone, Button, Card, Heading, Input, Text } from "./ui";
import { WorkPage } from "./WorkPage";

/** Filters of the Tasks page. "Archived" shows archived tasks only; every other filter hides them. */
const FILTERS = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "done", label: "Done" },
  { id: "ended", label: "Failed or stopped" },
  { id: "archived", label: "Archived" },
] as const;
type TaskFilter = (typeof FILTERS)[number]["id"];

const STATE_VIEW: Record<ChannelTaskState, { label: string; tone: BadgeTone }> = {
  queued: { label: "Queued", tone: "neutral" },
  running: { label: "Running", tone: "accent" },
  waiting: { label: "Waiting", tone: "warning" },
  paused: { label: "Paused", tone: "warning" },
  done: { label: "Done", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Stopped", tone: "neutral" },
};

const ACTION_LABELS: Record<ChannelTaskAction, string> = {
  stop: "Stop",
  pause: "Pause",
  resume: "Resume",
  archive: "Archive",
  restore: "Restore",
};

/** The person's actions the channel engine accepts for a task in this state (see channel-store `act`). */
export function taskActions(task: Pick<ChannelTask, "state" | "archivedAt">): ChannelTaskAction[] {
  if (task.archivedAt) return ["restore"];
  const actions: ChannelTaskAction[] = [];
  if (task.state === "queued" || task.state === "running" || task.state === "waiting") actions.push("pause");
  if (task.state === "paused" || task.state === "cancelled") actions.push("resume");
  if (task.state === "queued" || task.state === "running" || task.state === "waiting" || task.state === "paused")
    actions.push("stop");
  if (task.state === "done" || task.state === "failed" || task.state === "cancelled") actions.push("archive");
  return actions;
}

function matches(task: ChannelTask, filter: TaskFilter): boolean {
  if (filter === "archived") return Boolean(task.archivedAt);
  if (task.archivedAt) return false;
  if (filter === "open") return ["queued", "running", "waiting", "paused"].includes(task.state);
  if (filter === "done") return task.state === "done";
  if (filter === "ended") return task.state === "failed" || task.state === "cancelled";
  return true;
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString(appLocale(), { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString(appLocale())} ${time}`;
}

/**
 * COSGRAL W3-BE9: the Tasks page of the page rail: the tasks of every channel in one list, with a state filter
 * and the actions the channels contract gives a person (`channels.list`, `listTasks`, `actOnTask`,
 * `task-changed`, `channels-changed`).
 */
export function TasksPage(props: {
  bots: Array<{ id: string; name: string }>;
  /** Opens the channel that holds the task, like a chat. */
  onOpenChannel?: (channelId: string) => void;
}) {
  const [channels, setChannels] = createSignal<WorkspaceChannel[]>([]);
  const [tasks, setTasks] = createSignal<ChannelTask[]>([]);
  const [filter, setFilter] = createSignal<TaskFilter>("all");
  const [query, setQuery] = createSignal("");
  const [loaded, setLoaded] = createSignal(false);
  const [busy, setBusy] = createSignal<string | null>(null);
  const [error, setError] = createSignal("");
  const fail = (e: unknown, fallback: string) => setError(e instanceof Error ? e.message : fallback);
  const upsert = (task: ChannelTask) => setTasks((list) => [...list.filter((item) => item.id !== task.id), task]);
  const visible = createMemo(() =>
    tasks()
      .filter((task) => matches(task, filter()))
      .filter((task) => matchesQuery(task))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
  const channelName = (id: string) => {
    const channel = channels().find((item) => item.id === id);
    return channel ? `#${channel.name}` : "#channel";
  };
  const ownerName = (id: string) => props.bots.find((bot) => bot.id === id)?.name ?? "Agent";
  const stepsOf = (task: ChannelTask) => tasks().filter((item) => item.parentTaskId === task.id);
  function matchesQuery(task: ChannelTask): boolean {
    const needle = query().trim().toLowerCase();
    if (!needle) return true;
    return [task.title, channelName(task.channelId), ownerName(task.ownerBotId)].some((text) =>
      text.toLowerCase().includes(needle),
    );
  }

  async function load(list: WorkspaceChannel[]) {
    const api = window.openbot.channels;
    if (!api) return;
    try {
      const all = await Promise.all(list.map((channel) => api.listTasks(channel.id)));
      setTasks(all.flat());
      setError("");
    } catch (e) {
      fail(e, t("Could not load tasks."));
    } finally {
      setLoaded(true);
    }
  }

  async function act(task: ChannelTask, action: ChannelTaskAction) {
    const api = window.openbot.channels;
    if (!api || busy()) return;
    setBusy(task.id);
    try {
      upsert(await api.actOnTask({ taskId: task.id, action }));
      setError("");
    } catch (e) {
      fail(e, t("Could not change the task."));
    } finally {
      setBusy(null);
    }
  }

  onSettled(() => {
    const api = window.openbot.channels;
    if (!api) {
      setError(t("Projects are not available in this build."));
      setLoaded(true);
      return;
    }
    void api
      .list()
      .then((list) => {
        setChannels(list);
        return load(list);
      })
      .catch((e) => {
        fail(e, t("Could not load projects."));
        setLoaded(true);
      });
    return window.openbot.agent.onEvent((event) => {
      if (event.type === "task-changed") upsert(event.task);
      if (event.type === "channels-changed") {
        const known = new Set(channels().map((channel) => channel.id));
        setChannels(event.channels);
        const added = event.channels.filter((channel) => !known.has(channel.id));
        if (added.length)
          void Promise.all(added.map((channel) => api.listTasks(channel.id)))
            .then((lists) => {
              for (const task of lists.flat()) upsert(task);
            })
            .catch(() => undefined);
      }
    });
  });

  return (
    <WorkPage
      page="tasks"
      class="tasks-page"
      title={t("Tasks")}
      description={t(
        "Tasks from all projects. Stop, pause, resume or archive them here; the project keeps the conversation.",
      )}
    >
      <fieldset class="tasks-filter">
        <legend class="sr-only">{t("Show tasks")}</legend>
        <For each={FILTERS}>
          {(item) => (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-pressed={filter() === item.id ? "true" : "false"}
              onClick={() => setFilter(item.id)}
            >
              {t(item.label)}
            </Button>
          )}
        </For>
      </fieldset>
      <Input
        type="search"
        class="tasks-search"
        aria-label={t("Search tasks")}
        placeholder={t("Search tasks")}
        value={query()}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <Show when={error()}>
        <Text as="p" tone="danger" role="alert">
          {error()}
        </Text>
      </Show>
      <Show when={loaded()}>
        <Card class="tasks-card">
          <Show
            when={visible().length}
            fallback={
              <Text as="p" tone="muted" class="tasks-empty">
                {tasks().length ? t("No task matches this filter.") : t("No tasks here yet.")}
              </Text>
            }
          >
            <ul class="tasks-list">
              <For each={visible()}>
                {(task) => (
                  <li class="tasks-row" data-state={task.state}>
                    <div class="tasks-copy">
                      <Heading as="h2" size="sm" class="tasks-title">
                        {task.title}
                      </Heading>
                      <Text as="p" tone="muted" variant="caption">
                        {channelName(task.channelId)} · {ownerName(task.ownerBotId)}
                        <Show when={formatUpdated(task.updatedAt)}>{(time) => <> · {time()}</>}</Show>
                        <Show when={task.pauseReason}>{(reason) => <> · {reason()}</>}</Show>
                      </Text>
                    </div>
                    <Badge tone={STATE_VIEW[task.state].tone} dot>
                      {t(STATE_VIEW[task.state].label)}
                    </Badge>
                    <div class="tasks-actions">
                      <Show when={props.onOpenChannel}>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => props.onOpenChannel?.(task.channelId)}
                        >
                          {t("Open as chat")}
                        </Button>
                      </Show>
                      <For each={taskActions(task)}>
                        {(action) => (
                          <Button
                            type="button"
                            size="sm"
                            variant={action === "stop" ? "danger" : "secondary"}
                            disabled={busy() !== null}
                            onClick={() => void act(task, action)}
                          >
                            {t(ACTION_LABELS[action])}
                          </Button>
                        )}
                      </For>
                    </div>
                    <Show when={stepsOf(task).length > 0}>
                      <details class="tasks-steps">
                        <summary>
                          {t("Steps")} ({stepsOf(task).length})
                        </summary>
                        <ul>
                          <For each={stepsOf(task)}>
                            {(step) => (
                              <li data-state={step.state}>
                                <span>{step.title}</span>
                                <Badge tone={STATE_VIEW[step.state].tone} dot>
                                  {t(STATE_VIEW[step.state].label)}
                                </Badge>
                                <small>{ownerName(step.ownerBotId)}</small>
                              </li>
                            )}
                          </For>
                        </ul>
                      </details>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Card>
      </Show>
    </WorkPage>
  );
}
