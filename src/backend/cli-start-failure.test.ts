// @vitest-environment node
// COSGRAL W6-KK3: a CLI that does not start says why, and a start that is only blocked for a moment (a fresh download
// held by a virus scan) is tried once more after a short pause.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliTimeoutError, CodexCliError, describeCliStartFailure, resolveClaudeCli, runCliWithRetry } from "./cli";
import { writeFakeCli } from "./testing/fake-cli";

function systemError(code: string | number, extra: { killed?: boolean; signal?: string } = {}): Error {
  return Object.assign(new Error(`spawn C:UsersJane Doecli.exe failed (${String(code)})`), { code, ...extra });
}

/** An exec seam that fails with the given errors in turn, then answers `ok`. */
function sequence(errors: Error[], ok = "2.1.325 (Claude Code)\n") {
  const calls = { count: 0 };
  const exec = async () => {
    const error = errors[calls.count];
    calls.count += 1;
    if (error) throw error;
    return { stdout: ok };
  };
  return { exec, calls };
}

describe("runCliWithRetry: a blocked start gets one more try (W6-KK3)", () => {
  it.each(["EBUSY", "EPERM", "EACCES", "UNKNOWN"])("%s once, then it starts", async (code) => {
    const { exec, calls } = sequence([systemError(code)]);
    await expect(runCliWithRetry("x", ["--version"], 1_000, { exec, pauseMs: 0 })).resolves.toContain("2.1.325");
    expect(calls.count).toBe(2);
  });

  it("blocked twice: the second error is the one that comes out (and there is no third try)", async () => {
    const { exec, calls } = sequence([systemError("EBUSY"), systemError("EPERM")]);
    await expect(runCliWithRetry("x", ["--version"], 1_000, { exec, pauseMs: 0 })).rejects.toMatchObject({
      code: "EPERM",
    });
    expect(calls.count).toBe(2);
  });

  it("waits before the second try of a blocked start", async () => {
    const { exec } = sequence([systemError("EBUSY")]);
    const started = Date.now();
    await runCliWithRetry("x", ["--version"], 1_000, { exec, pauseMs: 120 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(100);
  });

  it("an answer with an exit code or a missing file is not retried (nothing a pause could fix)", async () => {
    for (const error of [systemError(3), systemError("ENOENT")]) {
      const { exec, calls } = sequence([error]);
      await expect(runCliWithRetry("x", ["--version"], 1_000, { exec, pauseMs: 0 })).rejects.toBe(error);
      expect(calls.count).toBe(1);
    }
  });

  it("a timeout is still tried twice and then reported as a timeout", async () => {
    const slow = () => systemError("ETIMEDOUT", { killed: true });
    const { exec, calls } = sequence([slow(), slow()]);
    await expect(runCliWithRetry("x", ["--version"], 1_000, { exec, pauseMs: 0 })).rejects.toBeInstanceOf(
      CliTimeoutError,
    );
    expect(calls.count).toBe(2);
  });
});

describe("describeCliStartFailure (W6-KK3)", () => {
  it("names the reason in plain words", () => {
    expect(describeCliStartFailure(new CliTimeoutError())).toMatch(/timed out starting/);
    expect(describeCliStartFailure(systemError("ETIMEDOUT", { killed: true }))).toMatch(/timed out starting/);
    expect(describeCliStartFailure(systemError("EBUSY"))).toMatch(/blocked/);
    expect(describeCliStartFailure(systemError("EACCES"))).toMatch(/blocked/);
    expect(describeCliStartFailure(systemError("ENOENT"))).toBe("the file is missing");
    expect(describeCliStartFailure(systemError(3))).toBe("exited with code 3");
    expect(describeCliStartFailure(systemError("X", { signal: "SIGKILL" }))).toBe("stopped by signal SIGKILL");
    expect(describeCliStartFailure(new CodexCliError("odd output", "invalid"))).toMatch(/version/);
    expect(describeCliStartFailure("nothing useful")).toBe("it could not be run");
  });

  it("never carries the raw error text, so no path and no user name", () => {
    for (const error of [
      systemError("EBUSY"),
      systemError(1),
      systemError("ENOENT"),
      systemError("X", { signal: "SIGTERM" }),
      new Error("C:UsersJane DoeAppDataclaude.exe: something"),
    ]) {
      expect(describeCliStartFailure(error)).not.toMatch(/Jane|Users|\|exe/);
    }
  });
});

describe("resolveClaudeCli says why (W6-KK3)", () => {
  let root: string;
  const original = process.env.OPENBOT_CLAUDE_PATH;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cosgral-claude-reason-"));
  });
  afterEach(async () => {
    if (original === undefined) delete process.env.OPENBOT_CLAUDE_PATH;
    else process.env.OPENBOT_CLAUDE_PATH = original;
    await rm(root, { recursive: true, force: true });
  });

  it("a CLI that exits with a code: the message names the code and not the folder", async () => {
    process.env.OPENBOT_CLAUDE_PATH = await writeFakeCli(join(root, "User Name"), "claude", "process.exit(3);");
    const error = await resolveClaudeCli().then(
      () => null,
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(CodexCliError);
    if (!(error instanceof Error)) throw new Error("an error was expected");
    const message = error.message;
    expect(message).toBe(
      "Claude CLI was found but could not be started (exited with code 3). Run `claude --version` in a new terminal.",
    );
    expect(message).not.toContain("User Name");
  });

  it("a CLI that answers with something else: the message says the version was not understood", async () => {
    process.env.OPENBOT_CLAUDE_PATH = await writeFakeCli(
      join(root, "odd"),
      "claude",
      'process.stdout.write("hello");',
    );
    await expect(resolveClaudeCli()).rejects.toThrow(/could not be started \(it did not report a version/);
  });
});
