// COSGRAL W5-BE1: managed agent CLIs in the main process (this computer only): the engine with the official sources,
// the CLI order for cli.ts (custom > downloaded > system) and the `subscriptions:*` IPC.
//
// Tests only: when the app is not packaged and COSGRAL_CLI_TEST_BASE names a loopback address, the catalog and the
// downloads go to that stand-in server instead of the official hosts. A packaged app always uses the official hosts.

import { join } from "node:path";
import {
  type AgentEvent,
  type AgentStatus,
  type DraftPreviewResolution,
  IPC_CHANNELS,
  type ManagedCliId,
  parseAccountIdInput,
  parseAddAccountInput,
  parseAgentAccountAssignment,
  parseInstallManagedCliInput,
  parseManagedCliIdInput,
  parseManagedCliSettingsInput,
  parsePinManagedCliInput,
  parsePoolSettingsInput,
  parseSetAccountPoolInput,
  parseSubmitLoginCodeInput,
} from "@openbot/contracts/ipc";
import {
  findSystemCli,
  resolveClaudeCli,
  resolveCodexCli,
  runCliWithRetry,
  setManagedCliResolver,
} from "../backend/cli";
import { checkCliDownloadUrl, OfficialCliCatalog } from "../backend/cli-catalog";
import { checkLoopbackUrl, isLoopbackAddress, LoopbackDownloadSource } from "../backend/cli-loopback-source";
import { ManagedCliManager } from "../backend/managed-cli";
import { ProviderAccounts } from "../backend/provider-accounts";
import { HttpsDownloadSource } from "../backend/voice-download";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

/** Checks the official sources again after this long (and once at start). */
export const MANAGED_CLI_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

export interface ManagedCliRuntimeOptions {
  userDataPath: string;
  isPackaged: boolean;
  /** COSGRAL_CLI_TEST_BASE (tests only, ignored when packaged or not loopback). */
  testBase?: string;
  /** The confirm card in Needs you (needs an agent). */
  confirmCard: (input: { title: string; preview: string }) => Promise<DraftPreviewResolution>;
  canAsk: () => boolean;
  /** A native dialog when there is no agent yet (first start). */
  confirmDialog: (input: { title: string; preview: string }) => Promise<boolean>;
  emit: (event: AgentEvent) => void;
  /** The executable of a CLI changed: start the CLIs again when that provider is not running. */
  onExecutableChanged: (id: ManagedCliId) => void;
}

export interface ManagedCliRuntime {
  manager: ManagedCliManager;
  accounts: ProviderAccounts;
  close: () => void;
}

export function createManagedCli(options: ManagedCliRuntimeOptions): ManagedCliRuntime {
  const testBase =
    !options.isPackaged && isLoopbackAddress(options.testBase) ? options.testBase.replace(/\/$/, "") : null;
  const source = testBase
    ? new LoopbackDownloadSource()
    : new HttpsDownloadSource({ checkUrl: checkCliDownloadUrl, idleTimeoutMs: 120_000 });
  const catalog = new OfficialCliCatalog({
    source,
    arch: process.arch,
    ...(testBase ? { githubApiBase: `${testBase}/gh`, claudeBase: `${testBase}/claude` } : {}),
  });
  const confirm = async (input: { title: string; preview: string }) =>
    options.canAsk() ? (await options.confirmCard(input)) === "send" : options.confirmDialog(input);
  const manager = new ManagedCliManager({
    root: join(options.userDataPath, "cli"),
    catalog,
    source,
    checkUrl: testBase ? checkLoopbackUrl : checkCliDownloadUrl,
    confirm,
    probe: (executable) => runCliWithRetry(executable, ["--version"]),
    findSystem: (id) => findSystemCli(id),
    emit: (state) => options.emit({ type: "managed-cli-changed", state }),
    onExecutableChanged: options.onExecutableChanged,
  });
  // Settings load synchronously inside init(), so the order is known before the first agent starts.
  const ready = manager.init();
  setManagedCliResolver((command) => manager.resolve(command));
  const update = () => void manager.autoUpdate().catch((error: unknown) => console.error("CLI update failed:", error));
  void ready.then(update).catch((error: unknown) => console.error("Managed CLIs could not start:", error));
  const timer = setInterval(update, MANAGED_CLI_UPDATE_INTERVAL_MS);
  timer.unref();
  // W5-BE2: accounts, each with its own CLI state folder under the data folder; the CLI is the one cli.ts picks.
  const accounts = new ProviderAccounts({
    root: join(options.userDataPath, "accounts"),
    resolveExecutable: async (provider) =>
      (provider === "codex" ? await resolveCodexCli() : await resolveClaudeCli()).executable,
    confirm,
    emit: (snapshot) => options.emit({ type: "accounts-changed", ...snapshot }),
  });
  void ready.then(() => accounts.refreshAll()).catch(() => undefined);
  return {
    manager,
    accounts,
    close: () => {
      clearInterval(timer);
      accounts.close();
      setManagedCliResolver(null);
    },
  };
}

/** Start the CLIs again after a change only when that provider is not running (never interrupts a working agent). */
export function needsRestart(status: AgentStatus, id: ManagedCliId): boolean {
  const provider = status.providers?.find((entry) => entry.id === id);
  if (!provider) return status.phase !== "ready";
  return provider.state !== "available" && provider.state !== "checking";
}

export function registerSubscriptionsIpc(runtime: () => ManagedCliRuntime | null): void {
  const current = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Agent CLIs are managed on this computer only.");
    const value = runtime();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return { manager: value.manager, payload: request.payload };
  };
  handleTrusted(IPC_CHANNELS.subscriptionsListCli, async (input: unknown) => {
    const { manager } = current(input);
    await manager.refreshSystem();
    return manager.list();
  });
  handleTrusted(IPC_CHANNELS.subscriptionsCheckCli, (input: unknown) => {
    const { manager, payload } = current(input);
    return manager.check(parseManagedCliIdInput(payload).id);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsInstallCli, (input: unknown) => {
    const { manager, payload } = current(input);
    const request = parseInstallManagedCliInput(payload);
    return manager.install(request.id, request.version);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsUpdateCli, (input: unknown) => {
    const { manager, payload } = current(input);
    return manager.update(parseManagedCliIdInput(payload).id);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsRemoveCli, (input: unknown) => {
    const { manager, payload } = current(input);
    return manager.remove(parseManagedCliIdInput(payload).id);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsPinCli, (input: unknown) => {
    const { manager, payload } = current(input);
    const request = parsePinManagedCliInput(payload);
    return manager.pin(request.id, request.version);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsSetCliSettings, (input: unknown) => {
    const { manager, payload } = current(input);
    return manager.setSettings(parseManagedCliSettingsInput(payload));
  });
  // W5-BE2: accounts and the pool.
  const accounts = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Accounts are managed on this computer only.");
    const value = runtime();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return { accounts: value.accounts, payload: request.payload };
  };
  const byId = (input: unknown) => {
    const { accounts: engine, payload } = accounts(input);
    return { engine, id: parseAccountIdInput(payload).id };
  };
  handleTrusted(IPC_CHANNELS.subscriptionsListAccounts, (input: unknown) => accounts(input).accounts.snapshot());
  handleTrusted(IPC_CHANNELS.subscriptionsAddAccount, (input: unknown) => {
    const { accounts: engine, payload } = accounts(input);
    const request = parseAddAccountInput(payload);
    return engine.add(request.provider, request.label);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsRemoveAccount, (input: unknown) => {
    const { engine, id } = byId(input);
    return engine.remove(id);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsLoginAccount, (input: unknown) => {
    const { engine, id } = byId(input);
    return engine.login(id);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsSubmitLoginCode, (input: unknown) => {
    const { accounts: engine, payload } = accounts(input);
    const request = parseSubmitLoginCodeInput(payload);
    return engine.submitCode(request.id, request.code);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsCancelLogin, (input: unknown) => {
    const { engine, id } = byId(input);
    return engine.cancelLogin(id);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsOpenLoginTerminal, (input: unknown) => {
    const { engine, id } = byId(input);
    return engine.openLoginTerminal(id);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsLogoutAccount, (input: unknown) => {
    const { engine, id } = byId(input);
    return engine.logout(id);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsRefreshAccount, (input: unknown) => {
    const { engine, id } = byId(input);
    return engine.refresh(id);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsSetAccountPool, (input: unknown) => {
    const { accounts: engine, payload } = accounts(input);
    return engine.setPool(parseSetAccountPoolInput(payload));
  });
  handleTrusted(IPC_CHANNELS.subscriptionsAssignAccountToAgent, (input: unknown) => {
    const { accounts: engine, payload } = accounts(input);
    const request = parseAgentAccountAssignment(payload);
    return engine.assign(request.botId, request.accountId);
  });
  handleTrusted(IPC_CHANNELS.subscriptionsGetPoolSettings, (input: unknown) => accounts(input).accounts.pool());
  handleTrusted(IPC_CHANNELS.subscriptionsSetPoolSettings, (input: unknown) => {
    const { accounts: engine, payload } = accounts(input);
    return engine.setPoolSettings(parsePoolSettingsInput(payload).maxAccountsPerProvider);
  });
}
