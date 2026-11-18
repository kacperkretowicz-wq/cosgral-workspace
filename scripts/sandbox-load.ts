// COSGRAL W12 (BE-M): the sandbox runs (e2e, W5) start the real program and its fake Codex CLI (Electron in node mode). On a computer that
// is busy (other agents' tests, antivirus) that CLI needs more than the 20 s the program allows for `--version`, and the program then says
// "Codex CLI did not answer within 20 s (twice). The computer may be busy": the message box stays disabled, "Continue with Codex" stays
// disabled, a fake sign-in ends in an error. That is the machine, not the program. These helpers wait for a quiet machine before a run
// and write the load into the log, so a failed run says which of the two it was.

import { cpus, freemem, totalmem } from "node:os";

interface Sample {
  idle: number;
  total: number;
}

function sample(): Sample {
  let idle = 0;
  let total = 0;
  for (const cpu of cpus()) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  return { idle, total };
}

/** Share of the processor in use over the last `windowMs`, 0-100. */
export async function cpuBusyPercent(windowMs = 2000): Promise<number> {
  const before = sample();
  await new Promise((resolve) => setTimeout(resolve, windowMs));
  const after = sample();
  const total = after.total - before.total;
  return total <= 0 ? 0 : Math.round(100 * (1 - (after.idle - before.idle) / total));
}

export function freeMemoryMb(): number {
  return Math.round(freemem() / 1_048_576);
}

export function describeLoad(cpu: number): string {
  return `cpu ${cpu}% busy, ${freeMemoryMb()} of ${Math.round(totalmem() / 1_048_576)} MB memory free`;
}

/**
 * Waits (at most `maxWaitMs`, default 10 minutes) until the processor is under `maxCpu` percent and at least `minFreeMb` of memory is
 * free, then goes on either way: a run on a busy machine is better than none, and its log says what the load was.
 * Set COSGRAL_SKIP_LOAD_WAIT=1 to skip it.
 */
export async function waitForQuietMachine(
  label: string,
  options: { maxCpu?: number; minFreeMb?: number; maxWaitMs?: number } = {},
): Promise<void> {
  if (process.env.COSGRAL_SKIP_LOAD_WAIT === "1") return;
  const { maxCpu = 60, minFreeMb = 1500, maxWaitMs = 600_000 } = options;
  const started = Date.now();
  for (;;) {
    const cpu = await cpuBusyPercent();
    const quiet = cpu < maxCpu && freeMemoryMb() >= minFreeMb;
    if (quiet) {
      console.log(`${label}: machine is quiet (${describeLoad(cpu)})`);
      return;
    }
    if (Date.now() - started >= maxWaitMs) {
      console.log(
        `${label}: WARNING the machine stayed busy for ${Math.round(maxWaitMs / 60_000)} min (${describeLoad(cpu)}); ` +
          "going on. A failure about the CLI not answering is then the machine, not the program.",
      );
      return;
    }
    console.log(`${label}: machine is busy (${describeLoad(cpu)}); waiting...`);
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  }
}
