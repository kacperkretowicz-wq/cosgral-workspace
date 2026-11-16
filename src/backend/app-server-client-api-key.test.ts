// @vitest-environment node
// COSGRAL W5-BE3: the provider API key reaches the Codex process only as its own environment variable.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { setApiKeySource } from "./api-key-env";
import { CodexAppServerClient, redactDiagnostic } from "./app-server-client";
import { writeFakeCli } from "./testing/fake-cli";

// Test data only: no real key.
const KEY = "test-key-0000-openai-abcd";

const roots: string[] = [];
const clients: CodexAppServerClient[] = [];

afterEach(async () => {
  setApiKeySource(null);
  await Promise.all(clients.splice(0).map((client) => client.stop()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fakeCodexReportingEnvironment(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "openbot-fake-codex-key-"));
  roots.push(root);
  return writeFakeCli(
    join(root, "Codex CLI"),
    "codex",
    String.raw`let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline = buffer.indexOf("\n");
  while (newline >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (line) {
      const message = JSON.parse(line);
      const result = { key: process.env.OPENAI_API_KEY ?? null, other: process.env.ANTHROPIC_API_KEY ?? null, args: process.argv.slice(2) };
      process.stdout.write(JSON.stringify({ id: message.id, result }) + "\n");
    }
    newline = buffer.indexOf("\n");
  }
});
`,
  );
}

interface SeenEnvironment {
  key: string | null;
  other: string | null;
  args: string[];
}

function decodeSeen(value: unknown): SeenEnvironment {
  if (!isDynamicRecord(value) || !Array.isArray(value.args)) throw new Error("Invalid answer.");
  const text = (field: unknown) => (isString(field) ? field : null);
  return { key: text(value.key), other: text(value.other), args: value.args.map(String) };
}

async function ask(executable: string): Promise<SeenEnvironment> {
  const client = new CodexAppServerClient(executable, 5_000);
  clients.push(client);
  client.start();
  return client.request("test/env", {}, decodeSeen);
}

describe("Codex process and the API key", () => {
  it("gets the saved key as OPENAI_API_KEY, and the key is in no argument", async () => {
    setApiKeySource({
      env: (provider) => (provider === "codex" ? { OPENAI_API_KEY: KEY } : {}),
      values: () => [KEY],
    });
    const seen = await ask(await fakeCodexReportingEnvironment());
    expect(seen.key).toBe(KEY);
    expect(JSON.stringify(seen.args)).not.toContain(KEY);
  });

  it("does not put the key into the environment of the program itself", async () => {
    const before = process.env.OPENAI_API_KEY;
    setApiKeySource({ env: () => ({ OPENAI_API_KEY: KEY }), values: () => [KEY] });
    await ask(await fakeCodexReportingEnvironment());
    expect(process.env.OPENAI_API_KEY).toBe(before);
  });

  it("the Claude key is not given to the Codex process", async () => {
    setApiKeySource({
      env: (provider) => (provider === "claude" ? { ANTHROPIC_API_KEY: "test-key-1111" } : {}),
      values: () => ["test-key-1111"],
    });
    const seen = await ask(await fakeCodexReportingEnvironment());
    expect(seen.other).toBeNull();
  });

  it("starts without a key when none is saved", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const seen = await ask(await fakeCodexReportingEnvironment());
      expect(seen.key).toBeNull();
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    }
  });

  it("removes the key from a diagnostic line the CLI prints", () => {
    setApiKeySource({ env: () => ({}), values: () => [KEY] });
    const line = redactDiagnostic(`401 Unauthorized: Incorrect API key provided: ${KEY}`);
    expect(line).not.toContain(KEY);
    expect(line).toContain("[redacted]");
  });
});
