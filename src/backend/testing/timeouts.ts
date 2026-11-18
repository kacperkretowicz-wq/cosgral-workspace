// COSGRAL W12 (BE-P): the timeouts of slow suites, scalable for a busy computer. The tests of the service start a fake CLI and wait for
// real events; on this machine (8 GB, many agents at once) the same test takes 10 times longer than on a quiet one and ran into its
// limit (acp-login, agent-service, fallback-accounts failed on timeouts, not on assertions). Set COSGRAL_TEST_TIMEOUT_SCALE=3 for the
// full run in a quiet window: every suite limit below and the global limits of vitest.config.ts are multiplied by it. Without the
// variable nothing changes.

function readScale(): number {
  const value = Number(process.env.COSGRAL_TEST_TIMEOUT_SCALE);
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

export const TEST_TIMEOUT_SCALE = readScale();

/** `windows` ms on Windows, `other` ms elsewhere, times COSGRAL_TEST_TIMEOUT_SCALE (default 1). */
export function suiteTimeout(windows: number, other: number): number {
  return Math.round((process.platform === "win32" ? windows : other) * TEST_TIMEOUT_SCALE);
}
