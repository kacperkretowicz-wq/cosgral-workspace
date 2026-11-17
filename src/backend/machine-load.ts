// COSGRAL W12 (BE-H): the load of THIS computer for the "rings" of the usage screen: the processor between two readings and the memory in
// use now. It only reads what the system says (nothing is stored or sent); when the system says nothing the figure is null.

import { cpus, freemem, totalmem } from "node:os";
import type { MachineLoad } from "@openbot/contracts/ipc";

interface CpuReading {
  times: { user: number; nice: number; sys: number; idle: number; irq: number };
}

export interface MachineLoadOptions {
  cpus?: () => CpuReading[];
  totalMemory?: () => number;
  freeMemory?: () => number;
  /** The pause of the first reading (a processor needs two readings to have a load). */
  wait?: (ms: number) => Promise<void>;
}

interface Snapshot {
  idle: number;
  total: number;
}

const FIRST_READING_PAUSE_MS = 200;

export class MachineLoadSampler {
  readonly #cpus: () => CpuReading[];
  readonly #totalMemory: () => number;
  readonly #freeMemory: () => number;
  readonly #wait: (ms: number) => Promise<void>;
  #previous: Snapshot | null = null;

  constructor(options: MachineLoadOptions = {}) {
    this.#cpus = options.cpus ?? cpus;
    this.#totalMemory = options.totalMemory ?? totalmem;
    this.#freeMemory = options.freeMemory ?? freemem;
    this.#wait = options.wait ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  }

  async read(): Promise<MachineLoad> {
    let before = this.#previous;
    if (!before) {
      before = this.#snapshot();
      await this.#wait(FIRST_READING_PAUSE_MS);
    }
    const after = this.#snapshot();
    this.#previous = after;
    const total = after.total - before.total;
    const cpuPercent = total > 0 ? clamp(Math.round(((total - (after.idle - before.idle)) / total) * 100)) : null;
    const memory = this.#totalMemory();
    const memoryPercent = memory > 0 ? clamp(Math.round(((memory - this.#freeMemory()) / memory) * 100)) : null;
    return { cpuPercent, memoryPercent };
  }

  #snapshot(): Snapshot {
    let idle = 0;
    let total = 0;
    for (const { times } of this.#cpus()) {
      idle += times.idle;
      total += times.user + times.nice + times.sys + times.idle + times.irq;
    }
    return { idle, total };
  }
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}
