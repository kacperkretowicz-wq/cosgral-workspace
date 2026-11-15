// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLI_VERSION_TIMEOUT_MS, CliTimeoutError, readCliVersion } from "./cli";
import { writeFakeCli } from "./testing/fake-cli";

// W4-BE2: a slow first start of the CLI must not be reported as a broken CLI.
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cosgral-cli-timeout-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("CLI version check", { timeout: 30_000 }, () => {
  it("allows a slow first start (the old limit was 5 s)", () => {
    expect(CLI_VERSION_TIMEOUT_MS).toBeGreaterThanOrEqual(20_000);
  });

  it("reads the version of a CLI that answers", async () => {
    const cli = await writeFakeCli(join(root, "quick cli"), "codex", 'process.stdout.write("codex-cli 0.150.0\\n");');
    expect(await readCliVersion(cli, 10_000)).toContain("0.150.0");
  });

  it("tries twice and then reports a timeout, not a broken CLI", async () => {
    const cli = await writeFakeCli(join(root, "slow cli"), "codex", "setTimeout(() => {}, 20000);");
    await expect(readCliVersion(cli, 300)).rejects.toBeInstanceOf(CliTimeoutError);
  });
});
