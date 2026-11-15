// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { CLI_VERSION_TIMEOUT_MS, CliTimeoutError, windowsPathCandidates } from "./cli";

// W4-BE4: `where.exe` had 5 s. On a busy computer it timed out, the PATH entries were lost and a CLI installed only on
// PATH showed a false "Not installed". It now uses the same retrying runner as `codex --version` (20 s, one more try).

describe("where.exe lookup", () => {
  it("asks where.exe with the long limit and returns every line it prints", async () => {
    const run = vi.fn(async () => "C:\\Tools\\codex.cmd\r\nC:\\Other Tools\\codex.exe\r\n\r\n");
    await expect(windowsPathCandidates("codex", run)).resolves.toEqual([
      "C:\\Tools\\codex.cmd",
      "C:\\Other Tools\\codex.exe",
    ]);
    expect(run).toHaveBeenCalledWith("where.exe", ["codex"], CLI_VERSION_TIMEOUT_MS);
    expect(CLI_VERSION_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
  });

  it("falls back to the known install folders when where.exe does not answer twice", async () => {
    const run = vi.fn(async () => {
      throw new CliTimeoutError();
    });
    await expect(windowsPathCandidates("claude", run)).resolves.toEqual([]);
  });

  it("returns nothing when the command is not on PATH (where.exe exits 1)", async () => {
    const run = vi.fn(async () => {
      throw Object.assign(new Error("Command failed: where.exe claude"), { code: 1 });
    });
    await expect(windowsPathCandidates("claude", run)).resolves.toEqual([]);
  });
});
