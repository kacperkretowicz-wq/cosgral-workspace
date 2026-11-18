import type { CreateRoutineInput, Routine, RoutineRun } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { Button, Input, NativeSelect, Textarea } from "./ui";

type Bot = { id: string; name: string };
type FormTrigger = "interval" | "daily" | "cron" | "webhook";
export function RoutineForm(props: {
  bots: Bot[];
  botId?: string;
  onCreate: (input: CreateRoutineInput) => Promise<void>;
}) {
  const [bot, setBot] = createSignal(props.botId ?? props.bots[0]?.id ?? "");
  const [name, setName] = createSignal("");
  const [prompt, setPrompt] = createSignal("");
  const [trigger, setTrigger] = createSignal<FormTrigger>("interval");
  const [interval, setInterval] = createSignal("60");
  const [time, setTime] = createSignal("09:00");
  const [cron, setCron] = createSignal("0 9 * * *");
  const [timezone, setTimezone] = createSignal(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [error, setError] = createSignal("");
  async function create() {
    setError("");
    const t = trigger();
    const schedule =
      t === "interval"
        ? { type: "interval" as const, everyMinutes: Number(interval()) }
        : t === "daily"
          ? { type: "daily" as const, time: time() }
          : t === "cron"
            ? { type: "cron" as const, expression: cron() }
            : undefined;
    try {
      await props.onCreate({
        botId: bot(),
        name: name().trim(),
        prompt: prompt().trim(),
        trigger: t === "webhook" ? "webhook" : "schedule",
        ...(schedule ? { schedule } : {}),
        timezone: timezone(),
      });
      setName("");
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create routine.");
    }
  }
  return (
    <section class="w2-panel" aria-label={t("Create routine")}>
      <h3>{t("Create routine")}</h3>
      <label>
        {t("Agent")}
        <NativeSelect unstyled value={bot()} disabled={!!props.botId} onChange={(e) => setBot(e.currentTarget.value)}>
          <For each={props.bots}>{(item) => <option value={item.id}>{item.name}</option>}</For>
        </NativeSelect>
      </label>
      <label>
        {t("Routine name")}
        <Input unstyled aria-label={t("Routine name")} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <label>
        {t("Instructions")}
        <Textarea
          unstyled
          aria-label={t("Instructions")}
          value={prompt()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
        />
      </label>
      <label>
        {t("Trigger")}
        <NativeSelect
          unstyled
          aria-label={t("Trigger")}
          value={trigger()}
          onChange={(e) => {
            const value = e.currentTarget.value;
            if (value === "interval" || value === "daily" || value === "cron" || value === "webhook") setTrigger(value);
          }}
        >
          <option value="interval">{t("Interval")}</option>
          <option value="daily">{t("Daily")}</option>
          <option value="cron">{t("Cron")}</option>
          <option value="webhook">{t("Webhook")}</option>
        </NativeSelect>
      </label>
      <Show when={trigger() === "interval"}>
        <label>
          {t("Minutes")}
          <Input
            unstyled
            type="number"
            min="1"
            max="10080"
            value={interval()}
            onInput={(e) => setInterval(e.currentTarget.value)}
          />
        </label>
      </Show>
      <Show when={trigger() === "daily"}>
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
      </Show>
      <Show when={trigger() === "cron"}>
        <label>
          {t("Cron expression")}
          <Input unstyled value={cron()} onInput={(e) => setCron(e.currentTarget.value)} />
        </label>
      </Show>
      <label>
        {t("Time zone")}
        <Input unstyled value={timezone()} onInput={(e) => setTimezone(e.currentTarget.value)} />
      </label>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Button
        unstyled
        type="button"
        disabled={!bot() || !name().trim() || !prompt().trim()}
        onClick={() => void create()}
      >
        Create routine
      </Button>
    </section>
  );
}
export function RoutinePanel(props: { bots: Bot[]; botId?: string }) {
  const [routines, setRoutines] = createSignal<Routine[]>([]);
  const [runs, setRuns] = createSignal<RoutineRun[]>([]);
  const [history, setHistory] = createSignal("");
  const [secret, setSecret] = createSignal("");
  const [error, setError] = createSignal("");
  let serial = 0;
  async function refresh() {
    const api = window.openbot.routines;
    if (!api) {
      setError("Routines are unavailable in this build.");
      return;
    }
    const n = ++serial;
    try {
      const list = await api.list(props.botId);
      if (n === serial) setRoutines(list);
    } catch (e) {
      if (n === serial) setError(e instanceof Error ? e.message : "Could not load routines.");
    }
  }
  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Routine action failed.");
    }
  }
  async function loadHistory(routineId: string) {
    const api = window.openbot.routines;
    if (!api) return;
    try {
      setRuns(await api.listRuns({ routineId }));
      setHistory(routineId);
    } catch {
      setError("Could not load history.");
    }
  }
  onSettled(() => {
    void refresh();
    if (!window.openbot.routines) return;
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "routines-changed" || event.type === "routine-run") {
        void refresh();
        if (history()) void loadHistory(history());
      }
    });
    return () => {
      serial++;
      off();
    };
  });
  return (
    <section class="w2-panel" aria-label={t("Routines")}>
      <h2>{t("Routines")}</h2>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <For each={routines()}>
        {(routine) => (
          <article class="w2-item">
            <strong>{routine.name}</strong>
            <p>
              {props.bots.find((bot) => bot.id === routine.botId)?.name ?? routine.botId} ·{" "}
              {routine.paused ? "Paused" : "Active"} · {routine.timezone}
            </p>
            <p>
              {routine.nextRunAt
                ? `Next: ${new Date(routine.nextRunAt).toLocaleString(undefined, { timeZone: routine.timezone })} (${routine.timezone})`
                : "No scheduled run"}
            </p>
            <Show when={routine.webhook}>
              <p>Webhook: {routine.webhook?.url}</p>
              <Button
                unstyled
                type="button"
                onClick={() => {
                  if (window.confirm("Replace the webhook secret? Existing senders must be updated."))
                    void run(async () => {
                      const result = await window.openbot.routines?.regenerateSecret({ routineId: routine.id });
                      if (result?.secret) setSecret(result.secret);
                    });
                }}
              >
                Generate new secret
              </Button>
            </Show>
            <div>
              <Button
                unstyled
                type="button"
                onClick={() =>
                  void run(async () => {
                    await window.openbot.routines?.update({ routineId: routine.id, paused: !routine.paused });
                  })
                }
              >
                {routine.paused ? "Resume" : "Pause"}
              </Button>{" "}
              <Button
                unstyled
                type="button"
                disabled={routine.paused}
                onClick={() =>
                  void run(async () => {
                    await window.openbot.routines?.runNow({ routineId: routine.id });
                  })
                }
              >
                Run now
              </Button>{" "}
              <Button unstyled type="button" onClick={() => void loadHistory(routine.id)}>
                History
              </Button>
            </div>
            <Show when={history() === routine.id}>
              <For each={runs()} fallback={<p>{t("No runs yet.")}</p>}>
                {(entry) => (
                  <p>
                    {entry.status} · {entry.startedAt}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </p>
                )}
              </For>
            </Show>
          </article>
        )}
      </For>
      <Show when={secret()}>
        {(value) => (
          <div role="alert">
            <strong>Copy this secret now. It will not be shown again.</strong>
            <code>{value()}</code>
            <Button
              unstyled
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(value()).catch(() => setError("Could not copy secret."))
              }
            >
              Copy secret
            </Button>
            <Button unstyled type="button" onClick={() => setSecret("")}>
              Done
            </Button>
          </div>
        )}
      </Show>
      <RoutineForm
        bots={props.bots}
        botId={props.botId}
        onCreate={async (input) => {
          const api = window.openbot.routines;
          if (!api) throw new Error("Routines unavailable");
          const result = await api.create(input);
          if (result.secret) setSecret(result.secret);
          await refresh();
        }}
      />
    </section>
  );
}
