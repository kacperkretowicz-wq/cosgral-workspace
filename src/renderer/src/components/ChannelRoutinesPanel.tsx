import {
  CHANNEL_ROUTINE_LIMITS,
  type ChannelRoutine,
  type ChannelRoutineRun,
  type ChannelTaskState,
  channelRoutineProblem,
  type RoutineSchedule,
  type UpdateChannelRoutineInput,
  updateChannelRoutineProblem,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";
import { createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { Button, Input, NativeSelect, Textarea } from "./ui";

type FormKind = "interval" | "daily" | "cron";

const STATE_LABELS: Record<ChannelTaskState, string> = {
  queued: "Task queued",
  running: "Task running",
  done: "Task done",
  failed: "Task failed",
  paused: "Task paused",
  cancelled: "Task cancelled",
  waiting: "Task waiting",
};

function stateLabel(state: ChannelTaskState): string {
  return t(STATE_LABELS[state] ?? "Task running");
}

export function describeSchedule(schedule: RoutineSchedule): string {
  if (schedule.type === "interval") return t("Every {minutes} min", { minutes: schedule.everyMinutes });
  if (schedule.type === "daily") {
    return schedule.weekdays?.length
      ? t("Daily at {time} on {days}", {
          time: schedule.time,
          days: [...schedule.weekdays].sort().map(dayName).join(", "),
        })
      : t("Daily at {time}", { time: schedule.time });
  }
  return t("Cron {expression}", { expression: schedule.expression });
}

// Sunday is 0 in the contract; the screen lists the week from Monday.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
function dayName(day: number): string {
  return t(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] ?? "Sun");
}

// The contract and the engine write their reasons in English; the screen says them in the chosen language.
const PROBLEMS: Record<string, string> = {
  "Choose a channel.": "Choose a channel.",
  "Choose a routine.": "Choose a routine.",
  "This channel no longer exists.": "This channel no longer exists.",
  "This channel is archived.": "This channel is archived.",
  "This channel has no lead to take the work. Make one of its members the lead first.":
    "This channel has no lead to take the work. Make one of its members the lead first.",
  "Give the routine a name.": "Give the routine a name.",
  "Say what the lead should do on each run.": "Say what the lead should do on each run.",
  "Give the schedule.": "Give the schedule.",
  "The interval is a whole number of minutes.": "The interval is a whole number of minutes.",
  "The time is written HH:MM, for example 09:30.": "The time is written HH:MM, for example 09:30.",
  "Weekdays are numbers from 0 (Sunday) to 6 (Saturday).": "Choose the days of the week from the list.",
  "A cron schedule has five fields: minute hour day month weekday.":
    "A cron schedule has five fields: minute hour day month weekday.",
  "The schedule is an interval, a daily time or a cron expression.":
    "The schedule is an interval, a daily time or a cron expression.",
  "The time zone is a name like Europe/Warsaw.": "The time zone is a name like Europe/Warsaw.",
  "Paused is on or off.": "Paused is on or off.",
  "This routine no longer exists.": "This routine no longer exists.",
  "The previous run is still going.": "The previous run is still going.",
  "The program was off at the planned time.": "The program was off at the planned time.",
  "The channel did not take the message.": "The channel did not take the message.",
  "The routine could not start.": "The routine could not start.",
};
const COUNTED: Array<[RegExp, string]> = [
  [/^The name has at most (\d+) characters\.$/, "The name has at most {limit} characters."],
  [/^The instruction has at most (\d+) characters\.$/, "The instruction has at most {limit} characters."],
  [/^A channel has at most (\d+) routines\.$/, "A channel has at most {limit} routines."],
];
export function problemText(message: string): string {
  const known = PROBLEMS[message];
  if (known) return t(known);
  for (const [pattern, key] of COUNTED) {
    const match = pattern.exec(message);
    if (match) return t(key, { limit: match[1] ?? "" });
  }
  const interval = /^The interval is from (\d+) minute to (\d+) days\.$/.exec(message);
  if (interval) {
    return t("The interval is from {min} minute to {max} days.", { min: interval[1] ?? "", max: interval[2] ?? "" });
  }
  return message;
}

function when(iso: string, timezone?: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, timezone ? { timeZone: timezone } : undefined);
  } catch {
    return iso;
  }
}

export function ChannelRoutineForm(props: {
  channel: Pick<WorkspaceChannel, "id" | "archived" | "leadBotId">;
  existing: number;
  /** Creates a routine (new routine form). */
  onCreate?: (input: {
    channelId: string;
    name: string;
    prompt: string;
    schedule: RoutineSchedule;
    timezone: string;
  }) => Promise<void>;
  /** Edit mode: the routine to change; the form starts with its values and saves with `onSave`. */
  routine?: ChannelRoutine;
  onSave?: (input: UpdateChannelRoutineInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const start = props.routine?.schedule;
  const editing = props.routine !== undefined;
  const [name, setName] = createSignal(props.routine?.name ?? "");
  const [prompt, setPrompt] = createSignal(props.routine?.prompt ?? "");
  const [kind, setKind] = createSignal<FormKind>(start?.type ?? "daily");
  const [interval, setInterval] = createSignal(start?.type === "interval" ? String(start.everyMinutes) : "60");
  const [time, setTime] = createSignal(start?.type === "daily" ? start.time : "09:00");
  const [days, setDays] = createSignal<number[]>(start?.type === "daily" ? (start.weekdays ?? []) : []);
  const [cron, setCron] = createSignal(start?.type === "cron" ? start.expression : "0 9 * * *");
  const [timezone, setTimezone] = createSignal(
    props.routine?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [error, setError] = createSignal("");
  const [touched, setTouched] = createSignal(false);
  const schedule = createMemo<RoutineSchedule>(() => {
    const k = kind();
    if (k === "interval") return { type: "interval", everyMinutes: Number(interval()) };
    if (k === "daily") {
      return days().length ? { type: "daily", time: time(), weekdays: days() } : { type: "daily", time: time() };
    }
    return { type: "cron", expression: cron() };
  });
  const input = createMemo(() => ({
    channelId: props.channel.id,
    name: name().trim(),
    prompt: prompt().trim(),
    schedule: schedule(),
    timezone: timezone().trim(),
  }));
  const problem = createMemo(() => {
    const value = input();
    const raw = editing
      ? updateChannelRoutineProblem({
          routineId: props.routine?.id,
          name: value.name,
          prompt: value.prompt,
          schedule: value.schedule,
          timezone: value.timezone,
        })
      : channelRoutineProblem(value, props.channel, props.existing);
    return raw ? problemText(raw) : null;
  });
  async function create() {
    setTouched(true);
    setError("");
    if (problem()) return;
    try {
      if (props.routine && props.onSave) {
        const value = input();
        await props.onSave({
          routineId: props.routine.id,
          name: value.name,
          prompt: value.prompt,
          schedule: value.schedule,
          timezone: value.timezone,
        });
        return;
      }
      await props.onCreate?.(input());
      setName("");
      setPrompt("");
      setTouched(false);
    } catch (e) {
      const fallback = editing ? t("Could not save the routine.") : t("Could not create the routine.");
      setError(e instanceof Error ? problemText(e.message) : fallback);
    }
  }
  const heading = () => (editing ? t("Edit routine") : t("New channel routine"));
  return (
    <section class="w2-panel" aria-label={heading()}>
      <h3>{heading()}</h3>
      <label>
        {t("Routine name")}
        <Input
          unstyled
          aria-label={t("Routine name")}
          maxlength={CHANNEL_ROUTINE_LIMITS.name}
          value={name()}
          onInput={(e) => setName(e.currentTarget.value)}
        />
      </label>
      <label>
        {t("What the lead does on each run")}
        <Textarea
          unstyled
          aria-label={t("What the lead does on each run")}
          maxlength={CHANNEL_ROUTINE_LIMITS.prompt}
          value={prompt()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
        />
      </label>
      <label>
        {t("Repeats")}
        <NativeSelect
          unstyled
          aria-label={t("Repeats")}
          value={kind()}
          onChange={(e) => {
            const value = e.currentTarget.value;
            if (value === "interval" || value === "daily" || value === "cron") setKind(value);
          }}
        >
          <option value="interval">{t("Every N minutes")}</option>
          <option value="daily">{t("Daily")}</option>
          <option value="cron">{t("Cron")}</option>
        </NativeSelect>
      </label>
      <Show when={kind() === "interval"}>
        <label>
          {t("Minutes")}
          <Input
            unstyled
            aria-label={t("Minutes")}
            type="number"
            min="1"
            value={interval()}
            onInput={(e) => setInterval(e.currentTarget.value)}
          />
        </label>
      </Show>
      <Show when={kind() === "daily"}>
        <label>
          {t("Time")}
          <Input
            unstyled
            aria-label={t("Time")}
            type="time"
            value={time()}
            onInput={(e) => setTime(e.currentTarget.value)}
          />
        </label>
        <fieldset class="channel-routine-days">
          <legend>{t("Days of the week (every day when none is ticked)")}</legend>
          <For each={WEEK_ORDER}>
            {(day) => (
              <label>
                <input
                  type="checkbox"
                  checked={days().includes(day)}
                  onChange={(e) =>
                    setDays((current) =>
                      e.currentTarget.checked ? [...current, day].sort() : current.filter((item) => item !== day),
                    )
                  }
                />
                {dayName(day)}
              </label>
            )}
          </For>
        </fieldset>
      </Show>
      <Show when={kind() === "cron"}>
        <label>
          {t("Cron expression")}
          <Input
            unstyled
            aria-label={t("Cron expression")}
            value={cron()}
            onInput={(e) => setCron(e.currentTarget.value)}
          />
        </label>
      </Show>
      <label>
        {t("Time zone")}
        <Input
          unstyled
          aria-label={t("Time zone")}
          value={timezone()}
          onInput={(e) => setTimezone(e.currentTarget.value)}
        />
      </label>
      <Show when={touched() && problem()}>
        <p role="alert">{problem()}</p>
      </Show>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Button unstyled type="button" disabled={!!props.channel.archived} onClick={() => void create()}>
        {editing ? t("Save changes") : t("Create routine")}
      </Button>
      <Show when={editing}>
        <Button unstyled type="button" onClick={() => props.onCancel?.()}>
          {t("Cancel")}
        </Button>
      </Show>
    </section>
  );
}

export function ChannelRoutinesPanel(props: {
  channel: Pick<WorkspaceChannel, "id" | "archived" | "leadBotId">;
  /** Opens the task a run made; the button is hidden without it. */
  onOpenTask?: (taskId: string) => void;
}) {
  const [routines, setRoutines] = createSignal<ChannelRoutine[]>([]);
  const [runs, setRuns] = createSignal<ChannelRoutineRun[]>([]);
  const [history, setHistory] = createSignal("");
  const [editing, setEditing] = createSignal("");
  const [error, setError] = createSignal("");
  const [loaded, setLoaded] = createSignal(false);
  let serial = 0;
  async function refresh() {
    const api = window.openbot.channelRoutines;
    if (!api) {
      setLoaded(true);
      return;
    }
    const n = ++serial;
    try {
      const list = await api.list({ channelId: props.channel.id });
      if (n === serial) setRoutines(list);
    } catch (e) {
      if (n === serial) setError(e instanceof Error ? e.message : t("Could not load routines."));
    } finally {
      if (n === serial) setLoaded(true);
    }
  }
  async function loadHistory(routineId: string) {
    const api = window.openbot.channelRoutines;
    if (!api) return;
    try {
      setRuns(await api.listRuns({ routineId }));
      setHistory(routineId);
    } catch {
      setError(t("Could not load history."));
    }
  }
  async function act(fn: () => Promise<unknown>, routineId?: string) {
    setError("");
    try {
      await fn();
      await refresh();
      if (routineId && history() === routineId) await loadHistory(routineId);
    } catch (e) {
      setError(e instanceof Error ? problemText(e.message) : t("The routine action failed."));
    }
  }
  onSettled(() => {
    void refresh();
    if (!window.openbot.channelRoutines) return;
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type !== "channel-routines-changed" || event.channelId !== props.channel.id) return;
      setRoutines(event.routines);
      if (history()) void loadHistory(history());
    });
    return () => {
      serial++;
      off();
    };
  });
  return (
    <section class="w2-panel channel-routines" aria-label={t("Channel routines")}>
      <h2>{t("Channel routines")}</h2>
      <p>{t("On each run the lead gets the instruction as a message from you.")}</p>
      <Show
        when={window.openbot.channelRoutines}
        fallback={<p>{t("Channel routines are unavailable in this build.")}</p>}
      >
        <Show when={error()}>
          <p role="alert">{error()}</p>
        </Show>
        <Show when={loaded() && routines().length === 0}>
          <p>{t("No routines in this channel yet.")}</p>
        </Show>
        <For each={routines()}>
          {(routine) => (
            <Show
              when={editing() !== routine.id}
              fallback={
                <ChannelRoutineForm
                  channel={props.channel}
                  existing={routines().length}
                  routine={routine}
                  onCancel={() => setEditing("")}
                  onSave={async (input) => {
                    const api = window.openbot.channelRoutines;
                    if (!api) throw new Error(t("Channel routines are unavailable in this build."));
                    await api.update(input);
                    setEditing("");
                    await refresh();
                  }}
                />
              }
            >
              <article class="w2-item">
                <strong>{routine.name}</strong>
                <p>
                  {routine.paused ? t("Paused") : t("Active")} · {describeSchedule(routine.schedule)} ·{" "}
                  {routine.timezone}
                </p>
                <p>
                  {routine.nextRunAt
                    ? t("Next: {time}", { time: when(routine.nextRunAt, routine.timezone) })
                    : t("No scheduled run")}
                  {routine.lastRunAt
                    ? ` · ${t("Last: {time}", { time: when(routine.lastRunAt, routine.timezone) })}`
                    : ""}
                </p>
                <div>
                  <Button
                    unstyled
                    type="button"
                    onClick={() =>
                      void act(async () => {
                        await window.openbot.channelRoutines?.update({
                          routineId: routine.id,
                          paused: !routine.paused,
                        });
                      })
                    }
                  >
                    {routine.paused ? t("Resume") : t("Pause")}
                  </Button>{" "}
                  <Button
                    unstyled
                    type="button"
                    disabled={!!props.channel.archived}
                    onClick={() =>
                      void act(async () => {
                        await window.openbot.channelRoutines?.runNow({ routineId: routine.id });
                      }, routine.id)
                    }
                  >
                    {t("Run now")}
                  </Button>{" "}
                  <Button
                    unstyled
                    type="button"
                    onClick={() => (history() === routine.id ? setHistory("") : void loadHistory(routine.id))}
                  >
                    {t("History")}
                  </Button>{" "}
                  <Button unstyled type="button" onClick={() => setEditing(routine.id)}>
                    {t("Edit")}
                  </Button>{" "}
                  <Button
                    unstyled
                    type="button"
                    onClick={() => {
                      if (window.confirm(t("Delete this routine? Its history goes with it.")))
                        void act(async () => {
                          await window.openbot.channelRoutines?.delete({ routineId: routine.id });
                        });
                    }}
                  >
                    {t("Delete")}
                  </Button>
                </div>
                <Show when={history() === routine.id}>
                  <For each={runs()} fallback={<p>{t("No runs yet.")}</p>}>
                    {(run) => (
                      <p>
                        {when(run.at)} · {run.cause === "manual" ? t("Run now") : t("Scheduled")} ·{" "}
                        {run.outcome === "started"
                          ? run.taskState
                            ? stateLabel(run.taskState)
                            : t("Started")
                          : `${t("Skipped")}${run.reason ? `: ${problemText(run.reason)}` : ""}`}
                        <Show when={run.taskId && props.onOpenTask}>
                          {" "}
                          <Button unstyled type="button" onClick={() => props.onOpenTask?.(run.taskId ?? "")}>
                            {t("Open task")}
                          </Button>
                        </Show>
                      </p>
                    )}
                  </For>
                </Show>
              </article>
            </Show>
          )}
        </For>
        <ChannelRoutineForm
          channel={props.channel}
          existing={routines().length}
          onCreate={async (input) => {
            const api = window.openbot.channelRoutines;
            if (!api) throw new Error(t("Channel routines are unavailable in this build."));
            await api.create(input);
            await refresh();
          }}
        />
      </Show>
    </section>
  );
}
