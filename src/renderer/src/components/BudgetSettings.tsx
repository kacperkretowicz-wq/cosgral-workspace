import type {
  BudgetCsv,
  BudgetOverview,
  BudgetScope,
  BudgetState,
  BudgetStatus,
  BudgetsDesktopApi,
  SetBudgetInput,
} from "@openbot/contracts/ipc";
import { budgetDay, budgetPeriodDays, parseSetBudgetInput } from "@openbot/contracts/ipc";
import { createEffect, createSignal, onSettled, Show, untrack } from "solid-js";
import { errorText } from "../errors";
import { appLocale, t, tData } from "../i18n";
import type { SettingsEvents } from "./AccessSettings";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { PanelHeading } from "./PanelHeading";
import { Badge, Button, Field, Heading, Input, NativeSelect, Switch, Text } from "./ui";
import { Wallet } from "./ui/icons";
export function downloadBudgetCsv(file: BudgetCsv) {
  const url = URL.createObjectURL(new Blob([file.csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** The budget state as words (the badge showed the raw "ok" / "warning" / "exhausted"). */
const BUDGET_STATE_LABEL: Record<BudgetState, string> = {
  ok: "Within budget",
  warning: "Near the limit",
  exhausted: "Limit reached",
};

export function BudgetCounter(props: { status: BudgetStatus }) {
  const view = () => props.status;
  return (
    <section aria-label={t("Budget usage")} class="providers-form">
      <div class="providers-heading">
        <Heading as="h4" size="sm">
          {t("Usage this period")}
        </Heading>
        <Badge tone={view().state === "exhausted" ? "danger" : view().state === "warning" ? "warning" : "success"}>
          {t(BUDGET_STATE_LABEL[view().state])}
        </Badge>
      </div>
      <Text as="p">
        {t("{tokens} tokens · {turns} turns", {
          tokens: view().usage.tokens.toLocaleString(appLocale()),
          turns: view().usage.turns,
        })}
      </Text>
      <Text as="p">{t("{start} – {end} (UTC)", { start: view().usage.periodStart, end: view().usage.periodEnd })}</Text>
      <Text as="p">
        {view().usage.pricedTurns
          ? t(
              view().usage.costComplete
                ? "Provider estimate: {amount} USD"
                : "Provider estimate: {amount} USD (incomplete)",
              { amount: `$${view().usage.costUsd.toFixed(2)}` },
            )
          : t("Cost unavailable: the provider has not reported a price.")}
      </Text>
      <Show when={view().usage.pricedTurns > 0 && !view().usage.costComplete}>
        <Text as="p" tone="warning">
          {t("Cost unavailable for some turns. The reported estimate is incomplete.")}
        </Text>
      </Show>
      <Show when={view().budget?.costLimitUsd != null && (!view().usage.costComplete || !view().usage.pricedTurns)}>
        <Text as="p" tone="warning">
          {t(
            "The dollar limit cannot fully protect this budget while costs are unavailable. Set a token limit for enforceable protection.",
          )}
        </Text>
      </Show>
      <Show when={!view().enforceable}>
        <Text as="p" role="status" tone="warning">
          {t("Dollar limit not enforceable: no provider price is available.")}
        </Text>
      </Show>
      <Show when={view().reason}>
        <Text as="p" role="status" tone={view().state === "exhausted" ? "danger" : "secondary"}>
          {tData(view().reason ?? "")}
        </Text>
      </Show>
      <Show when={view().blocked}>
        <Text as="p" tone="danger">
          {t("New turns are blocked. A running turn is allowed to finish.")}
        </Text>
      </Show>
    </section>
  );
}
export function BudgetPanel(props: {
  status: BudgetStatus;
  onSave: (input: SetBudgetInput) => Promise<void>;
  onClear: () => Promise<void>;
  onExport: (from: string, to: string) => Promise<void>;
}) {
  const [period, setPeriod] = createSignal("month");
  const [tokens, setTokens] = createSignal("");
  const [cost, setCost] = createSignal("");
  const [warn, setWarn] = createSignal("80");
  const [hardStop, setHardStop] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [from, setFrom] = createSignal(budgetPeriodDays("month", new Date()).start);
  const [to, setTo] = createSignal(budgetDay(new Date()));
  createEffect(
    () => JSON.stringify([props.status.scope, props.status.budget]),
    () => {
      const value = props.status.budget;
      setPeriod(value?.period ?? "month");
      setTokens(value?.tokenLimit == null ? "" : String(value.tokenLimit));
      setCost(value?.costLimitUsd == null ? "" : String(value.costLimitUsd));
      setWarn(String(value?.warnPercent ?? 80));
      setHardStop(value?.hardStop ?? true);
    },
  );
  async function run(action: () => Promise<void>, success: string) {
    if (busy()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
    } catch (e) {
      setError(errorText(e, t("Could not update the budget.")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      class="providers-form"
      aria-label={props.status.scope.kind === "space" ? t("Space budget") : t("Agent budget")}
    >
      <PanelHeading level="h3" icon={Wallet} tint="green">
        {props.status.scope.kind === "space" ? t("Space budget") : t("Agent budget")}
      </PanelHeading>
      <Text as="p">
        {t(
          "Limits reset at midnight UTC each day or on the first day of each calendar month. Dollar amounts are provider estimates, not a bill.",
        )}
      </Text>
      <BudgetCounter status={props.status} />
      <Show when={error()}>
        <Text role="alert" tone="danger">
          {error()}
        </Text>
      </Show>
      <Show when={notice()}>
        <Text role="status">{notice()}</Text>
      </Show>
      <form
        class="providers-form"
        aria-label={t("Budget limits")}
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const input = parseSetBudgetInput({
              scope: props.status.scope,
              period: period(),
              tokenLimit: tokens().trim() ? Number(tokens()) : null,
              costLimitUsd: cost().trim() ? Number(cost()) : null,
              warnPercent: Number(warn()),
              hardStop: hardStop(),
              cheapFirst: props.status.budget?.cheapFirst,
            });
            await props.onSave(input);
          }, t("Budget saved."));
        }}
      >
        <Field label={t("Budget period (UTC)")}>
          <NativeSelect value={period()} disabled={busy()} onChange={(e) => setPeriod(e.currentTarget.value)}>
            <option value="day">{t("Day (UTC)")}</option>
            <option value="month">{t("Calendar month (UTC)")}</option>
          </NativeSelect>
        </Field>
        <Field label={t("Token limit")} description={t("Leave empty for no token limit.")}>
          <Input
            type="number"
            min={1}
            max={1000000000000}
            step={1}
            value={tokens()}
            disabled={busy()}
            onInput={(e) => setTokens(e.currentTarget.value)}
          />
        </Field>
        <Field
          label={t("Dollar limit (USD, optional)")}
          description={t("Only prices reported by providers count. Missing prices are never estimated by the app.")}
        >
          <Input
            type="number"
            min={0.01}
            max={1000000}
            step="any"
            value={cost()}
            disabled={busy()}
            onInput={(e) => setCost(e.currentTarget.value)}
          />
        </Field>
        <Field label={t("Warn at (%)")} description={t("50–99% of a limit.")}>
          <Input
            type="number"
            min={50}
            max={99}
            step={1}
            required
            value={warn()}
            disabled={busy()}
            onInput={(e) => setWarn(e.currentTarget.value)}
          />
        </Field>
        <Switch
          checked={hardStop()}
          onChange={setHardStop}
          disabled={busy()}
          label={t("Stop new turns when exhausted")}
          description={t("A running turn is never interrupted.")}
        />
        <Button type="submit" disabled={busy()}>
          {t("Save budget")}
        </Button>
        <Show when={props.status.budget}>
          <Button disabled={busy()} onClick={() => void run(props.onClear, t("Budget removed. Usage is retained."))}>
            {t("Remove budget")}
          </Button>
        </Show>
      </form>
      <form
        class="providers-form"
        aria-label={t("Export budget usage")}
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => props.onExport(from(), to()), t("CSV download requested."));
        }}
      >
        <Heading as="h4" size="sm">
          {t("Export usage CSV")}
        </Heading>
        <Text as="p">{t("Exports this space’s daily usage for all agents, using UTC dates.")}</Text>
        <Field label={t("From (UTC)")}>
          <Input type="date" required value={from()} onInput={(e) => setFrom(e.currentTarget.value)} />
        </Field>
        <Field label={t("To (UTC)")}>
          <Input type="date" required value={to()} onInput={(e) => setTo(e.currentTarget.value)} />
        </Field>
        <Button type="submit" disabled={busy() || !from() || !to() || from() > to()}>
          {t("Export CSV")}
        </Button>
      </form>
    </section>
  );
}
export function BudgetSettings(
  props: {
    botId?: string;
    api?: BudgetsDesktopApi;
    onEvent?: SettingsEvents;
    onDownload?: (file: BudgetCsv) => void;
  } = {},
) {
  const api = untrack(() => props.api ?? window.openbot?.budgets);
  const [overview, setOverview] = createSignal<BudgetOverview>();
  const [error, setError] = createSignal("");
  let revision = 0;
  const scope = (): BudgetScope => (props.botId ? { kind: "agent", botId: props.botId } : { kind: "space" });
  const accept = (value: BudgetOverview) => {
    revision++;
    setOverview(value);
  };
  async function reload() {
    const serial = ++revision;
    setError("");
    if (!api) return;
    try {
      const value = await api.list();
      if (serial === revision) setOverview(value);
    } catch {
      setError(t("Could not load budget usage."));
    }
  }
  onSettled(() => {
    void reload();
    const off = (props.onEvent ?? window.openbot?.agent?.onEvent)?.((event) => {
      if (event.type === "budgets-changed") accept(event);
    });
    return () => {
      revision++;
      off?.();
    };
  });
  const status = (): BudgetStatus | undefined => {
    const value = overview();
    if (!value) return;
    const found = props.botId
      ? value.agents.find((item) => item.scope.kind === "agent" && item.scope.botId === props.botId)
      : value.space;
    if (found) return found;
    return {
      scope: scope(),
      budget: null,
      usage: { ...value.space.usage, tokens: 0, turns: 0, costUsd: 0, pricedTurns: 0, costComplete: true },
      state: "ok",
      tokenPercent: null,
      costPercent: null,
      blocked: false,
      reason: null,
      enforceable: true,
    };
  };
  return (
    <>
      <Show when={error()}>
        <Text role="alert" tone="danger">
          {error()}
        </Text>
        <Button onClick={() => void reload()}>{t("Retry budget usage")}</Button>
      </Show>
      <Show
        when={status()}
        fallback={
          <Show when={api} fallback={<Text>{t("Budgets are unavailable on this connection.")}</Text>}>
            <CosgralLoadingSkeleton label={t("Loading budget usage…")} />
          </Show>
        }
      >
        {(value) => (
          <BudgetPanel
            status={value()}
            onSave={async (input) => {
              if (api) accept(await api.set(input));
            }}
            onClear={async () => {
              if (api) accept(await api.clear({ scope: scope() }));
            }}
            onExport={async (from, to) => {
              if (api) (props.onDownload ?? downloadBudgetCsv)(await api.exportCsv({ from, to }));
            }}
          />
        )}
      </Show>
    </>
  );
}
