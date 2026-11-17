import type { UsagePeriod, UsageReport } from "@openbot/contracts/ipc";
import { USAGE_PERIODS } from "@openbot/contracts/ipc";
import { createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Button } from "./ui";

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
export function UsageReportView() {
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
      return { day, x: index * slot, width: Math.max(1, slot - (slot > 4 ? 2 : 0)), height };
    });
  });

  return (
    <section class="usage-report" aria-label={t("Usage report")}>
      <Show when={api} fallback={<p class="usage-note">{t("The usage report is not available in this version.")}</p>}>
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
          <p class="usage-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load(period())}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={report()} fallback={<Show when={!error()}>{<p role="status">{t("Loading usage…")}</p>}</Show>}>
          {(current) => (
            <>
              <dl class="usage-totals">
                <div>
                  <dt>{t("Tokens")}</dt>
                  <dd>{compact(current().totals.tokens)}</dd>
                </div>
                <div>
                  <dt>{t("Turns")}</dt>
                  <dd>{current().totals.turns}</dd>
                </div>
                <div>
                  <dt>{t("Cost reported by providers")}</dt>
                  <dd>
                    {current().totals.pricedTurns === 0
                      ? "—"
                      : dollars(current().totals.costUsd, current().totals.costComplete)}
                  </dd>
                </div>
              </dl>
              <Show when={current().collectingSince}>
                {(since) => <p class="usage-note">{t("Counted since {day}.", { day: since() })}</p>}
              </Show>
              <Show when={!current().collectingSince}>
                <p class="usage-note">{t("Nothing has been counted yet.")}</p>
              </Show>

              <figure class="usage-chart">
                <svg
                  viewBox={`0 0 ${BAR_AREA.width} ${BAR_AREA.height}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={t("Tokens per day, {from} to {to}", { from: current().from, to: current().to })}
                >
                  <For each={bars()}>
                    {(bar) => (
                      <rect
                        class="usage-bar"
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
                <figcaption>
                  <span>{current().from}</span>
                  <span>{current().to}</span>
                </figcaption>
              </figure>

              <div class="usage-rings">
                <Ring label={t("Processor")} percent={current().machine.cpuPercent} />
                <Ring label={t("Memory")} percent={current().machine.memoryPercent} />
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
                          <th scope="row">{row.name ?? t("Removed agent")}</th>
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
