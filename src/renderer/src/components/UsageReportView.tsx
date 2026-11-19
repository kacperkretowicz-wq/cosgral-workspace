import type { UsagePeriod, UsageReport, UsageTokenSplit } from "@openbot/contracts/ipc";
import { USAGE_PERIODS } from "@openbot/contracts/ipc";
import { createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";
import type { BotProfile } from "../data";
import { t } from "../i18n";
import { AgentAvatar } from "./AgentAvatar";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { CosgralPanelState } from "./CosgralPanelState";
import { Button } from "./ui";
import { Coins, Cpu, MessageCircle, Wallet } from "./ui/icons";

const BAR_AREA = { width: 600, height: 120 } as const;

function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

function dollars(value: number, complete: boolean): string {
  const text = `$${value.toFixed(2)}`;
  return complete ? text : `≥ ${text}`;
}

function splitParts(split: UsageTokenSplit) {
  return [
    { id: "fresh", label: t("Input"), value: split.freshInput },
    { id: "cached", label: t("From the cache"), value: split.cached },
    { id: "output", label: t("Output"), value: split.output },
    { id: "reasoning", label: t("Reasoning"), value: split.reasoning },
  ];
}

const RING_RADIUS = 26;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** One ring: a percentage from 0 to 100 or "not available" when null. */
function Ring(props: { label: string; percent: number | null }) {
  const filled = () => (props.percent === null ? 0 : (Math.min(100, Math.max(0, props.percent)) / 100) * RING_LENGTH);
  return (
    <figure class="usage-ring" data-level={props.percent !== null && props.percent >= 85 ? "high" : "normal"}>
      <svg
        viewBox="0 0 64 64"
        role="img"
        aria-label={`${props.label}: ${props.percent === null ? t("Not available") : `${props.percent}%`}`}
      >
        <circle class="usage-ring-track" cx="32" cy="32" r={RING_RADIUS} />
        <circle
          class="usage-ring-fill"
          cx="32"
          cy="32"
          r={RING_RADIUS}
          stroke-dasharray={`${filled()} ${RING_LENGTH}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <figcaption>
        <strong>{props.percent === null ? "—" : `${props.percent}%`}</strong>
        <span>{props.label}</span>
      </figcaption>
    </figure>
  );
}

/**
 * The usage report (window.openbot.usageReport): tokens per day for 7 to 365 days, totals, the load of this computer,
 * and the table of agents. A figure the program does not collect is listed with its reason instead of invented.
 */
export function UsageReportView(props: { bots?: ReadonlyArray<BotProfile> } = {}) {
  const botOf = (botId: string) => props.bots?.find((bot) => bot.id === botId);
  const api = untrack(() => window.openbot?.usageReport);
  const [period, setPeriod] = createSignal<UsagePeriod>(30);
  const [report, setReport] = createSignal<UsageReport | null>(null);
  const [error, setError] = createSignal("");
  let serial = 0;

  async function load(next: UsagePeriod) {
    if (!api) return;
    const n = ++serial;
    setPeriod(next);
    try {
      const result = await api.get({ period: next });
      if (n !== serial) return;
      setReport(result);
      setError("");
    } catch (cause) {
      if (n === serial) setError(cause instanceof Error ? cause.message : t("Could not load the usage report."));
    }
  }

  onSettled(() => {
    void load(period());
    return () => {
      serial++;
    };
  });

  const bars = createMemo(() => {
    const current = report();
    if (!current) return [];
    const peak = Math.max(1, ...current.days.map((day) => day.tokens));
    const slot = BAR_AREA.width / Math.max(1, current.days.length);
    return current.days.map((day, index) => {
      const height = (day.tokens / peak) * (BAR_AREA.height - 4);
      const gap = slot > 6 ? Math.min(6, slot * 0.28) : slot > 3 ? 1 : 0;
      return {
        day,
        x: index * slot + gap / 2,
        width: Math.max(1, slot - gap),
        height,
        last: index === current.days.length - 1,
      };
    });
  });
  const peak = createMemo(() => Math.max(0, ...(report()?.days.map((day) => day.tokens) ?? [0])));
  const perDay = () => {
    const current = report();
    return current && current.days.length > 0 ? current.totals.tokens / current.days.length : 0;
  };
  const perTurn = () => {
    const current = report();
    return current && current.totals.turns > 0 ? current.totals.tokens / current.totals.turns : 0;
  };

  return (
    <section class="usage-report" aria-label={t("Usage report")}>
      <Show
        when={api}
        fallback={
          <CosgralPanelState kind="unavailable" title={t("The usage report is not available in this version.")} />
        }
      >
        <nav class="usage-periods" aria-label={t("Period")}>
          <For each={USAGE_PERIODS}>
            {(days) => (
              <Button
                type="button"
                variant="ghost"
                aria-current={period() === days ? "page" : undefined}
                onClick={() => void load(days)}
              >
                {t("{days} days", { days })}
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
              onAction={() => void load(period())}
            />
          )}
        </Show>
        <Show
          when={report()}
          fallback={
            <Show when={!error()}>
              <CosgralLoadingSkeleton label={t("Loading usage…")} />
            </Show>
          }
        >
          {(current) => (
            <>
              <dl class="usage-totals">
                <div>
                  <span class="usage-stat-icon" aria-hidden="true">
                    <Coins size={18} stroke-width={1.5} />
                  </span>
                  <dt>{t("Tokens")}</dt>
                  <dd>{compact(current().totals.tokens)}</dd>
                  <dd class="usage-stat-detail">{t("≈ {value} per day", { value: compact(perDay()) })}</dd>
                </div>
                <div>
                  <span class="usage-stat-icon" aria-hidden="true">
                    <MessageCircle size={18} stroke-width={1.5} />
                  </span>
                  <dt>{t("Turns")}</dt>
                  <dd>{current().totals.turns}</dd>
                  <dd class="usage-stat-detail">{t("≈ {value} tokens per turn", { value: compact(perTurn()) })}</dd>
                </div>
                <div>
                  <span class="usage-stat-icon" aria-hidden="true">
                    <Wallet size={18} stroke-width={1.5} />
                  </span>
                  <dt>{t("Cost reported by providers")}</dt>
                  <dd>
                    {current().totals.pricedTurns === 0
                      ? "—"
                      : dollars(current().totals.costUsd, current().totals.costComplete)}
                  </dd>
                  <dd class="usage-stat-detail">
                    {current().totals.pricedTurns === 0
                      ? t("No provider reported a price.")
                      : t("{count} priced turns", { count: current().totals.pricedTurns })}
                  </dd>
                </div>
              </dl>
              <Show when={!current().collectingSince}>
                <CosgralPanelState
                  kind="empty"
                  title={t("Nothing has been counted yet.")}
                  detail={t("Token and turn totals appear here after agents run.")}
                />
              </Show>

              <div class="usage-overview">
                <figure class="usage-chart">
                  <header class="usage-card-header">
                    <h3>{t("Tokens per day")}</h3>
                    <span class="usage-peak">{t("Peak {value}", { value: compact(peak()) })}</span>
                  </header>
                  <div class="usage-chart-plot">
                    <span class="usage-chart-grid" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <svg
                      viewBox={`0 0 ${BAR_AREA.width} ${BAR_AREA.height}`}
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={t("Tokens per day, {from} to {to}", { from: current().from, to: current().to })}
                    >
                      <defs>
                        {/* Electric fade from the top of a bar into the dark (Azure Glass); colours from the palette. */}
                        <linearGradient id="usage-bar-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" class="usage-bar-stop-top" />
                          <stop offset="1" class="usage-bar-stop-bottom" />
                        </linearGradient>
                        <linearGradient id="usage-bar-fill-last" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" class="usage-bar-stop-last-top" />
                          <stop offset="1" class="usage-bar-stop-last-bottom" />
                        </linearGradient>
                      </defs>
                      <For each={bars()}>
                        {(bar) => (
                          <rect
                            class="usage-bar"
                            data-last={bar.last ? "true" : undefined}
                            x={bar.x}
                            y={BAR_AREA.height - bar.height}
                            width={bar.width}
                            height={bar.height}
                          >
                            <title>{`${bar.day.day}: ${compact(bar.day.tokens)}`}</title>
                          </rect>
                        )}
                      </For>
                    </svg>
                  </div>
                  <figcaption>
                    <span>{current().from}</span>
                    <Show when={current().collectingSince}>
                      {(since) => <span class="usage-note">{t("Counted since {day}.", { day: since() })}</span>}
                    </Show>
                    <span>{current().to}</span>
                  </figcaption>
                </figure>

                <section class="usage-machine" aria-label={t("This computer")}>
                  <header class="usage-card-header">
                    <h3>
                      <Cpu size={15} stroke-width={1.5} aria-hidden="true" />
                      {t("This computer")}
                    </h3>
                  </header>
                  <div class="usage-rings">
                    <Ring label={t("Processor")} percent={current().machine.cpuPercent} />
                    <Ring label={t("Memory")} percent={current().machine.memoryPercent} />
                  </div>
                </section>
              </div>

              <Show when={current().byAgent.length > 0}>
                <table class="usage-table">
                  <caption>{t("By agent")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("Agent")}</th>
                      <th scope="col">{t("Tokens")}</th>
                      <th scope="col">{t("Share")}</th>
                      <th scope="col">{t("Cost")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={current().byAgent}>
                      {(row) => (
                        <tr>
                          <th scope="row">
                            <span class="usage-agent">
                              <Show when={botOf(row.botId)}>
                                {(bot) => <AgentAvatar bot={bot()} class="usage-agent-avatar" />}
                              </Show>
                              <span>{row.name ?? t("Removed agent")}</span>
                            </span>
                          </th>
                          <td>{compact(row.tokens)}</td>
                          <td>
                            <span class="usage-share">
                              <span class="usage-share-fill" style={{ width: `${row.tokenShare}%` }} />
                            </span>{" "}
                            {row.tokenShare}%
                          </td>
                          <td>{row.pricedTurns === 0 ? "—" : dollars(row.costUsd, row.costComplete)}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>

              <Show when={current().split}>
                {(split) => (
                  <section class="usage-split" aria-label={t("Token split")}>
                    <h3>{t("Token split")}</h3>
                    <ul class="usage-split-bar" aria-hidden="true">
                      <For each={splitParts(split())}>
                        {(part) => (
                          <li
                            data-part={part.id}
                            style={{ "flex-grow": part.value }}
                            title={`${part.label}: ${compact(part.value)}`}
                          />
                        )}
                      </For>
                    </ul>
                    <dl class="usage-split-legend">
                      <For each={splitParts(split())}>
                        {(part) => (
                          <div>
                            <dt data-part={part.id}>{part.label}</dt>
                            <dd>{compact(part.value)}</dd>
                          </div>
                        )}
                      </For>
                    </dl>
                    <p class="usage-note">
                      {t("{percent}% of the tokens in this period come with their parts.", {
                        percent: split().coverage,
                      })}
                      <Show when={current().detailSince}>
                        {(since) => <> {t("Details kept since {day}.", { day: since() })}</>}
                      </Show>
                    </p>
                  </section>
                )}
              </Show>

              <Show when={current().byModel.length > 0}>
                <table class="usage-table">
                  <caption>{t("By model")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("Model")}</th>
                      <th scope="col">{t("Turns")}</th>
                      <th scope="col">{t("Tokens")}</th>
                      <th scope="col">{t("Share")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={current().byModel}>
                      {(row) => (
                        <tr>
                          <th scope="row">{row.model}</th>
                          <td>{row.turns}</td>
                          <td>{compact(row.tokens)}</td>
                          <td>
                            <span class="usage-share">
                              <span class="usage-share-fill" style={{ width: `${row.tokenShare}%` }} />
                            </span>{" "}
                            {row.tokenShare}%
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </Show>

              <Show when={current().unavailable.length > 0}>
                <section class="usage-unavailable" aria-label={t("Not collected")}>
                  <h3>{t("Not collected yet")}</h3>
                  <ul>
                    <For each={current().unavailable}>
                      {(item) => (
                        <li>
                          <strong>{item.breakdown}</strong>: {item.reason}
                        </li>
                      )}
                    </For>
                  </ul>
                </section>
              </Show>
            </>
          )}
        </Show>
      </Show>
    </section>
  );
}
