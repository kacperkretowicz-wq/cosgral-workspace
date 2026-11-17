// COSGRAL W12 (BE-H): the usage report (contract: ipc-insights.ts). It keeps nothing of its own: the rows come from the cost counter of the
// budgets (one row per day and agent), the limits from the providers, the load from the machine sampler. The shared rules (the same
// as the mock) build the days, the totals and the shares. What the counter does not keep (model, skill, cache) is said to be unavailable.

import {
  aggregateUsage,
  type MachineLoad,
  type ProviderUsage,
  parseUsageReportInput,
  type UsageReport,
  type UsageRow,
  usageDay,
} from "@openbot/contracts/ipc";

export interface UsageReportOptions {
  /** The counter rows from this day (`YYYY-MM-DD`) on. */
  rows: (fromDay: string) => UsageRow[];
  /** The first day anything was counted; null when nothing was. */
  firstDay: () => string | null;
  agentName: (botId: string) => string | null;
  providers: () => ProviderUsage[];
  machine: () => Promise<MachineLoad>;
  now?: () => Date;
}

const DAY_MS = 86_400_000;

export class UsageReportService {
  readonly #options: UsageReportOptions;

  constructor(options: UsageReportOptions) {
    this.#options = options;
  }

  async get(raw: unknown): Promise<UsageReport> {
    const input = parseUsageReportInput(raw);
    const now = this.#options.now?.() ?? new Date();
    const fromDay = usageDay(new Date(now.getTime() - (input.period - 1) * DAY_MS));
    let machine: MachineLoad = { cpuPercent: null, memoryPercent: null };
    try {
      machine = await this.#options.machine();
    } catch {
      // the load is only a ring on the screen: a sensor that fails must not break the report
    }
    let providers: ProviderUsage[] = [];
    try {
      providers = this.#options.providers();
    } catch {
      providers = [];
    }
    return aggregateUsage({
      rows: this.#options.rows(fromDay),
      period: input.period,
      botId: input.botId,
      today: now,
      now,
      names: this.#options.agentName,
      providers,
      machine,
      firstDay: this.#options.firstDay(),
    });
  }
}
