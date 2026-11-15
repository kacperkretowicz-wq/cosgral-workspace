// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readClaudeAuthStatus } from "./claude-client";
import { CodexCliError } from "./cli";
import { writeFakeCli } from "./testing/fake-cli";

// W4-BE3: a slow `claude auth status` on a busy computer must not turn into a false "Sign in required".
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cosgral-claude-auth-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const cli = (folder: string, script: string) => writeFakeCli(join(root, folder), "claude", script);

describe("Claude sign-in check", { timeout: 30_000 }, () => {
  it("reads a signed-in account", async () => {
    const claude = await cli(
      "signed in",
      'process.stdout.write(JSON.stringify({ loggedIn: true, email: "person@example.com", subscriptionType: "pro" }));',
    );
    await expect(readClaudeAuthStatus(claude, 10_000)).resolves.toEqual({
      account: { type: "claude", email: "person@example.com", planType: "pro" },
      requiresOpenaiAuth: false,
    });
  });

  it("reports signed out only when the CLI says so (also with a non-zero exit)", async () => {
    const claude = await cli(
      "signed out",
      "process.stdout.write(JSON.stringify({ loggedIn: false })); process.exitCode = 1;",
    );
    await expect(readClaudeAuthStatus(claude, 10_000)).resolves.toEqual({ account: null, requiresOpenaiAuth: false });
  });

  it("tries twice and then says the CLI did not answer, not that sign-in is required", async () => {
    const claude = await cli("slow", "setTimeout(() => {}, 20000);");
    const error = await readClaudeAuthStatus(claude, 300).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(CodexCliError);
    expect(String(error)).toMatch(/did not answer/);
    expect(String(error)).not.toMatch(/login|sign in/i);
  });
});
