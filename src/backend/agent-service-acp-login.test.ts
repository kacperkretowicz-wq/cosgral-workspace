// @vitest-environment node
// COSGRAL W6-BE5: signing in to an ACP agent on the real AgentService: the agents come from the provider registry (Providers), the
// sign-in runs as the person's action, the state comes as `acp-login-changed`, and the program closing stops a sign-in.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AcpLoginState, AgentEvent, BrowserControlState, BrowserTab } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
import { MailboxStore } from "./mailbox-store";
import { ProviderRegistry } from "./provider-registry";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";
import { ThreadCli } from "./testing/thread-cli";
import { suiteTimeout } from "./testing/timeouts";

const STUB = fileURLToPath(new URL("./testing/acp-login-stub.mjs", import.meta.url));

let root: string;
const services: AgentService[] = [];
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-acp-login-"));
  process.env.OPENBOT_CODEX_PATH = await writeFakeCli(
    join(root, "Codex CLI"),
    "codex",
    `if (process.argv.includes("--version")) process.stdout.write("codex-cli 0.144.1\\n");`,
  );
  process.env.OPENBOT_CLAUDE_PATH = join(root, "missing-claude");
});

afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  if (originalCodexPath === undefined) delete process.env.OPENBOT_CODEX_PATH;
  else process.env.OPENBOT_CODEX_PATH = originalCodexPath;
  if (originalClaudePath === undefined) delete process.env.OPENBOT_CLAUDE_PATH;
  else process.env.OPENBOT_CLAUDE_PATH = originalClaudePath;
  closeTestDatabases();
  await rm(root, { recursive: true, force: true });
});

async function open() {
  const userData = join(root, "user-data");
  const database = testDatabase(userData);
  const store = new BotStore(userData, join(root, "home"), database);
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const cli = new ThreadCli();
  const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
  services.push(service);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  await service.initialize();
  await database.initialize();
  const registry = new ProviderRegistry({ database, emit: () => undefined, timers: false });
  service.useProviders(registry);
  return { service, registry, events };
}

function loginStates(events: AgentEvent[]): AcpLoginState[] {
  return events.flatMap((event) => (event.type === "acp-login-changed" ? [event.state] : []));
}

describe.sequential("ACP sign-in on the service", { timeout: suiteTimeout(30_000, 10_000) }, () => {
  it("lists the agents of Providers, signs in with a link and a code, and tells the window each step", async () => {
    const { service, registry, events } = await open();
    expect(service.listAcpLogins()).toEqual([]);
    registry.saveAcpAgent({ id: "gemini", name: "Gemini CLI", command: process.execPath, args: [STUB, "link-code"] });
    expect(service.listAcpLogins().map((state) => [state.agentId, state.phase, state.signedIn])).toEqual([
      ["gemini", "idle", null],
    ]);

    expect((await service.startAcpLogin({ agentId: "gemini" })).phase).toBe("starting");
    await waitFor(() => service.listAcpLogins()[0]?.phase === "code-required");
    expect(service.listAcpLogins()[0]?.url).toBe("https://accounts.example.test/auth?attempt=1");

    await service.submitAcpLoginCode({ agentId: "gemini", code: "good-code" });
    await waitFor(() => service.listAcpLogins()[0]?.phase === "success");
    expect(service.listAcpLogins()[0]).toMatchObject({ signedIn: true, url: null });
    expect([...new Set(loginStates(events).map((state) => state.phase))]).toEqual([
      "starting",
      "code-required",
      "success",
    ]);
    expect(JSON.stringify(events)).not.toContain("good-code");
  });

  it("an agent that is removed from Providers disappears from the list", async () => {
    const { service, registry } = await open();
    registry.saveAcpAgent({ id: "gemini", name: "Gemini CLI", command: process.execPath, args: [STUB, "link-code"] });
    expect(service.listAcpLogins()).toHaveLength(1);
    registry.removeAcpAgent({ id: "gemini" });
    expect(service.listAcpLogins()).toEqual([]);
    await expect(service.startAcpLogin({ agentId: "gemini" })).rejects.toThrow(/Unknown ACP agent/);
  });

  it("closing the program ends a running sign-in", async () => {
    const { service, registry } = await open();
    registry.saveAcpAgent({ id: "gemini", name: "Gemini CLI", command: process.execPath, args: [STUB, "link-code"] });
    await service.startAcpLogin({ agentId: "gemini" });
    await waitFor(() => service.listAcpLogins()[0]?.phase === "code-required");
    const index = services.indexOf(service);
    services.splice(index, 1);
    await service.stop();
    expect(service.listAcpLogins()[0]?.phase).toBe("cancelled");
  });
});

function fakeBrowser() {
  return {
    onChanged: (_listener: (tabs: BrowserTab[], activeTabId: string | null) => void) => () => undefined,
    onControlChanged: (_listener: (state: BrowserControlState) => void) => () => undefined,
    clearControls: () => undefined,
    endControl: () => undefined,
    handleDynamicTool: async () => ({ success: true, contentItems: [] }),
  };
}

async function waitFor(check: () => boolean | undefined): Promise<void> {
  const deadline = Date.now() + suiteTimeout(12_000, 5_000);
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out.");
}
