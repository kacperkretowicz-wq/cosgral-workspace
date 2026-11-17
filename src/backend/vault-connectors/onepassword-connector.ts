// COSGRAL W11-KK (d): the 1Password connector. Our own code for the behaviour of OpenBot 0.71 (the connector's states, errors and
// limits), with the manager's command-line tool `op` behind a port so every test runs on a fake.
//
// How it works. "Connect with the app" uses the person's own `op` session ONCE: it creates the vault "Shared with COSGRAL" and a
// service account that can only READ that vault; the program keeps only that service account's token (encrypted, write-only).
// "Connect with a token" takes a service-account token the person made on 1Password.com. From then on logins are read with the
// token (`OP_SERVICE_ACCOUNT_TOKEN` in the tool's environment, never in its arguments). Passwords and codes go to the built-in
// browser only. The person moves the logins agents may use into the shared vault inside 1Password.

import {
  cliVersionAtLeast,
  emptyVaultConnectorStatus,
  VAULT_CONNECTOR_LIMITS,
  VAULT_CONNECTOR_SHARED_NAME,
  type VaultConnectorAccount,
  type VaultConnectorErrorCode,
  type VaultConnectorSetup,
  type VaultConnectorStatus,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import {
  ConnectorFailure,
  type ConnectorLogin,
  type ConnectorLoginSource,
  type ConnectorStore,
  failureCode,
  type RunCli,
  websiteMatchesOrigin,
} from "./common";

const MIN_CLI_VERSION = [2, 18] as const;
const CLI_TIMEOUT_MS = 120_000;
const SETUP_CHECK_TIMEOUT_MS = 15_000;
/** Service accounts have hourly read limits: the login list is read again only this often. */
const INDEX_MAX_AGE_MS = 300_000;
/** A page that opens reads a list older than this again, so the count follows the person's changes. */
const INDEX_REFRESH_ON_VIEW_MS = 30_000;
export const ONEPASSWORD_DOWNLOAD_URL = "https://1password.com/downloads/";

interface IndexedLogin {
  id: string;
  vaultId: string;
  title: string;
  urls: string[];
}

interface Index {
  readAt: number;
  vaultNames: string[];
  logins: IndexedLogin[];
}

export interface OnePasswordOptions {
  store: ConnectorStore;
  runCli: RunCli;
  /** The tools to try, in order: the person's own, then the program's own copy. Empty = none found. */
  findCli: () => Promise<string[]>;
  /** Downloads the program's own copy; null when there is no build for this computer. */
  installCli: ((signal: AbortSignal) => Promise<void>) | null;
  openExternal: (url: string) => Promise<void>;
  /** Names the service account ("COSGRAL on <computer>"). */
  hostName: string;
  emit: (status: VaultConnectorStatus) => void;
  now?: () => number;
}

function jsonArray(text: string): unknown[] {
  const value = JSON.parse(text);
  if (!Array.isArray(value)) throw new ConnectorFailure("unknown");
  return value;
}

function accountLabel(entry: { email?: string; url?: string; id: string }): string {
  if (entry.email && entry.url) return `${entry.email} (${entry.url})`;
  return entry.email ?? entry.url ?? entry.id;
}

export class OnePasswordConnector implements ConnectorLoginSource {
  readonly connector = "onepassword" as const;
  readonly #options: OnePasswordOptions;
  readonly #now: () => number;
  #setup: VaultConnectorSetup;
  #cliPath: string | null = null;
  #accounts: VaultConnectorAccount[] = [];
  #connecting: AbortController | null = null;
  #installing: AbortController | null = null;
  #error: { code: VaultConnectorErrorCode } | null = null;
  #index: Index | null = null;
  #indexing: Promise<Index> | null = null;
  /** Changes each time the token is replaced or removed: a read that began before does not keep its answer. */
  #generation = 0;
  #checking: Promise<void> | null = null;

  constructor(options: OnePasswordOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
    this.#setup = { ...emptyVaultConnectorStatus("onepassword").setup, canInstall: options.installCli !== null };
  }

  /** Starts with the saved connection: reads the login list in the background (a failure only sets the status). */
  load(): void {
    if (this.#options.store.read("onepassword")) void this.#refresh(INDEX_MAX_AGE_MS).catch(() => undefined);
  }

  connected(): boolean {
    return this.#options.store.read("onepassword") !== null && this.#connecting === null;
  }

  status(): VaultConnectorStatus {
    const record = this.#options.store.read("onepassword");
    const connecting = this.#connecting !== null;
    const connected = record !== null && !connecting;
    let state: VaultConnectorStatus["state"] = "disconnected";
    if (connecting) state = "connecting";
    else if (this.#error) state = "failed";
    else if (connected) state = "connected";
    else if (this.#accounts.length > 0) state = "choose-account";
    return {
      ...emptyVaultConnectorStatus("onepassword"),
      state,
      setup: { ...this.#setup },
      accounts: state === "choose-account" ? [...this.#accounts] : [],
      vaultNames: state === "connected" ? [...(this.#index?.vaultNames ?? [])] : [],
      loginCount: state === "connected" ? (this.#index?.logins.length ?? null) : null,
      error: state === "failed" && this.#error ? new ConnectorFailure(this.#error.code).message : null,
      errorCode: state === "failed" && this.#error ? this.#error.code : null,
    };
  }

  /** Looks for the tool and asks it whether the app lets it use an account. Nothing here unlocks or approves anything. Overlapping checks share one run. */
  async checkSetup(): Promise<VaultConnectorStatus> {
    if (!this.#installing) await this.#sharedCheck();
    if (this.#options.store.read("onepassword") && !this.#connecting)
      await this.#refresh(INDEX_REFRESH_ON_VIEW_MS).catch(() => undefined);
    return this.status();
  }

  /** Downloads the program's own copy of the tool, then checks again. The person agreed by pressing the button. */
  async installCli(): Promise<VaultConnectorStatus> {
    const install = this.#options.installCli;
    if (!install || this.#installing) return this.status();
    const controller = new AbortController();
    this.#installing = controller;
    this.#error = null;
    this.#setup = { ...this.#setup, cli: "installing" };
    this.#emit();
    try {
      await install(controller.signal);
    } catch {
      if (!controller.signal.aborted) this.#error = { code: "cli-missing" };
    } finally {
      if (this.#installing === controller) this.#installing = null;
    }
    await this.#sharedCheck();
    this.#emit();
    return this.status();
  }

  /** Opens the app (where the person turns on the integration), or the download page when it is not installed. */
  async openApp(): Promise<void> {
    await this.#options
      .openExternal("onepassword://")
      .catch(() => this.#options.openExternal(ONEPASSWORD_DOWNLOAD_URL));
  }

  /** Creates the shared vault and a service account that only reads it, with the person's own session. Several accounts and none named: `choose-account`, nothing created. */
  async connectWithApp(accountId: string | undefined): Promise<VaultConnectorStatus> {
    const controller = this.#startConnecting();
    try {
      const token = await this.#createServiceAccount(accountId, controller.signal);
      if (token !== null) await this.#save(token, accountId ?? null, controller.signal);
    } catch (error) {
      this.#failed(controller, error);
    } finally {
      this.#finish(controller);
    }
    return this.status();
  }

  /** Connects with a service-account token the person made on 1Password.com. The token is checked by reading with it. */
  async connectWithToken(token: string): Promise<VaultConnectorStatus> {
    const controller = this.#startConnecting();
    try {
      await this.#save(token.trim(), null, controller.signal);
    } catch (error) {
      this.#failed(controller, error instanceof ConnectorFailure ? error : new ConnectorFailure("token-rejected"));
    } finally {
      this.#finish(controller);
    }
    return this.status();
  }

  cancel(): VaultConnectorStatus {
    this.#connecting?.abort();
    this.#connecting = null;
    this.#accounts = [];
    this.#error = null;
    this.#emit();
    return this.status();
  }

  /** Forgets the token. The vault and the service account stay in 1Password: only the person removes them there. */
  disconnect(): VaultConnectorStatus {
    this.#connecting?.abort();
    this.#connecting = null;
    this.#accounts = [];
    this.#error = null;
    this.#generation += 1;
    this.#index = null;
    this.#indexing = null;
    this.#options.store.clear("onepassword");
    this.#emit();
    return this.status();
  }

  dispose(): void {
    this.#connecting?.abort();
    this.#installing?.abort();
    this.#connecting = null;
    this.#installing = null;
  }

  async loginsFor(origin: string): Promise<ConnectorLogin[] | null> {
    return this.#reported(() => this.#loginsFor(origin));
  }

  async #loginsFor(origin: string): Promise<ConnectorLogin[] | null> {
    const record = this.#options.store.read("onepassword");
    if (!record) return null;
    const generation = this.#generation;
    const index = await this.#readIndex(INDEX_MAX_AGE_MS);
    const matches = index.logins
      .filter((login) => login.urls.some((url) => websiteMatchesOrigin({ url, autofill: "anywhere" }, origin)))
      .slice(0, VAULT_CONNECTOR_LIMITS.loginsPerPage);
    const logins: ConnectorLogin[] = [];
    for (const login of matches) {
      const item = await this.#item(record.secret, login);
      logins.push({
        id: login.id,
        title: login.title,
        username: item.username,
        hasOneTimePassword: item.hasOneTimePassword,
      });
    }
    return generation === this.#generation ? logins : null;
  }

  async secretFor(loginId: string, origin: string, kind: "password" | "otp"): Promise<string | null> {
    return this.#reported(() => this.#secretFor(loginId, origin, kind));
  }

  async #secretFor(loginId: string, origin: string, kind: "password" | "otp"): Promise<string | null> {
    const record = this.#options.store.read("onepassword");
    if (!record) return null;
    const generation = this.#generation;
    const login = (await this.#readIndex(INDEX_MAX_AGE_MS)).logins.find((candidate) => candidate.id === loginId);
    if (!login?.urls.some((url) => websiteMatchesOrigin({ url, autofill: "anywhere" }, origin))) return null;
    const executable = await this.#requireCli();
    const args =
      kind === "otp"
        ? ["item", "get", login.id, "--vault", login.vaultId, "--otp"]
        : ["item", "get", login.id, "--vault", login.vaultId, "--fields", "label=password", "--reveal"];
    const value = (await this.#tool(executable, args, record.secret)).trim();
    if (generation !== this.#generation || value.length === 0) return null;
    return value;
  }

  // --- internals ---

  /** A failing read shows in the status ("failed" with its code); the next read that works clears it. */
  async #reported<T>(read: () => Promise<T>): Promise<T> {
    try {
      const value = await read();
      if (this.#error !== null) {
        this.#error = null;
        this.#emit();
      }
      return value;
    } catch (error) {
      this.#error = { code: failureCode(error) };
      this.#emit();
      throw error;
    }
  }

  #emit(): void {
    this.#options.emit(this.status());
  }

  #startConnecting(): AbortController {
    this.#connecting?.abort();
    const controller = new AbortController();
    this.#connecting = controller;
    this.#accounts = [];
    this.#error = null;
    this.#emit();
    return controller;
  }

  #failed(controller: AbortController, error: unknown): void {
    if (this.#connecting !== controller || controller.signal.aborted) return;
    this.#error = { code: failureCode(error) };
  }

  #finish(controller: AbortController): void {
    if (this.#connecting === controller) this.#connecting = null;
    this.#emit();
  }

  #sharedCheck(): Promise<void> {
    this.#checking ??= this.#check().finally(() => {
      this.#checking = null;
    });
    return this.#checking;
  }

  async #check(): Promise<void> {
    let found: { path: string; version: string } | null = null;
    for (const path of await this.#options.findCli()) {
      const version = await this.#options
        .runCli(path, ["--version"], { signal: AbortSignal.timeout(SETUP_CHECK_TIMEOUT_MS) })
        .then((output) => output.trim())
        .catch(() => null);
      if (version && cliVersionAtLeast(version, MIN_CLI_VERSION)) {
        found = { path, version };
        break;
      }
    }
    this.#cliPath = found?.path ?? null;
    const appIntegration = found
      ? await this.#options
          .runCli(found.path, ["account", "list", "--format", "json"], {
            signal: AbortSignal.timeout(SETUP_CHECK_TIMEOUT_MS),
          })
          .then((output) => jsonArray(output).length > 0)
          .catch(() => false)
      : null;
    this.#setup = {
      cli: found ? "ready" : "missing",
      cliVersion: found?.version ?? null,
      canInstall: this.#options.installCli !== null,
      appIntegration,
    };
    this.#emit();
  }

  async #requireCli(): Promise<string> {
    if (!this.#cliPath) await this.#sharedCheck();
    if (!this.#cliPath) throw new ConnectorFailure("cli-missing");
    return this.#cliPath;
  }

  /** Runs the tool; any failure becomes a fixed sentence (the tool's own text may hold a token or a title). */
  async #tool(
    executable: string,
    args: readonly string[],
    token: string | null,
    signal?: AbortSignal,
  ): Promise<string> {
    try {
      return await this.#options.runCli(executable, args, {
        env: token === null ? undefined : { OP_SERVICE_ACCOUNT_TOKEN: token },
        signal: signal ?? AbortSignal.timeout(CLI_TIMEOUT_MS),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new ConnectorFailure(token === null ? "cli-signed-out" : "token-rejected");
    }
  }

  /** The new token, or null when the person must first choose an account. */
  async #createServiceAccount(accountId: string | undefined, signal: AbortSignal): Promise<string | null> {
    const executable = await this.#requireCli();
    const listed = jsonArray(
      await this.#tool(executable, ["account", "list", "--format", "json"], null, signal),
    ).flatMap((entry) =>
      isDynamicRecord(entry) && isString(entry.account_uuid) && entry.account_uuid.length > 0
        ? [
            {
              id: entry.account_uuid,
              email: isString(entry.email) ? entry.email : undefined,
              url: isString(entry.url) ? entry.url : undefined,
            },
          ]
        : [],
    );
    if (listed.length === 0) throw new ConnectorFailure("cli-signed-out");
    const account = accountId
      ? listed.find((candidate) => candidate.id === accountId)
      : listed.length === 1
        ? listed[0]
        : undefined;
    if (!account) {
      if (accountId) throw new ConnectorFailure("cli-signed-out");
      this.#accounts = listed.map((entry) => ({ id: entry.id, label: accountLabel(entry) }));
      return null;
    }
    const scope = ["--account", account.id];
    const vaults = jsonArray(
      await this.#tool(executable, ["vault", "list", ...scope, "--format", "json"], null, signal),
    );
    let vaultId = vaults
      .flatMap((entry) =>
        isDynamicRecord(entry) && entry.name === VAULT_CONNECTOR_SHARED_NAME && isString(entry.id) ? [entry.id] : [],
      )
      .at(0);
    if (!vaultId) {
      const created = JSON.parse(
        await this.#tool(
          executable,
          [
            "vault",
            "create",
            VAULT_CONNECTOR_SHARED_NAME,
            "--description",
            "Logins that COSGRAL agents may use to sign in to sites.",
            ...scope,
            "--format",
            "json",
          ],
          null,
          signal,
        ),
      );
      vaultId = isDynamicRecord(created) && isString(created.id) ? created.id : undefined;
    }
    if (!vaultId) throw new ConnectorFailure("folder-missing");
    const token = (
      await this.#tool(
        executable,
        [
          "service-account",
          "create",
          `COSGRAL on ${this.#options.hostName}`,
          "--vault",
          `${vaultId}:read_items`,
          ...scope,
          "--raw",
        ],
        null,
        signal,
      )
    ).trim();
    if (!token) throw new ConnectorFailure("token-rejected");
    return token;
  }

  /** Checks the token by reading with it, then stores it. A token that reads no vault is refused. */
  async #save(token: string, accountId: string | null, signal: AbortSignal): Promise<void> {
    if (token.length === 0 || token.length > VAULT_CONNECTOR_LIMITS.secret)
      throw new ConnectorFailure("token-rejected");
    const index = await this.#build(token);
    if (index.vaultNames.length === 0) throw new ConnectorFailure("folder-missing");
    if (signal.aborted) return;
    this.#options.store.write("onepassword", {
      secret: token,
      meta: { accountId },
      connectedAt: new Date(this.#now()).toISOString(),
    });
    this.#generation += 1;
    this.#index = index;
    this.#indexing = null;
  }

  async #refresh(maxAgeMs: number): Promise<void> {
    await this.#readIndex(maxAgeMs);
  }

  /** Reads the login list when it is older than `maxAgeMs`. Reads that overlap share one run. */
  async #readIndex(maxAgeMs: number): Promise<Index> {
    if (this.#index && this.#now() - this.#index.readAt < maxAgeMs) return this.#index;
    if (this.#indexing) return this.#indexing;
    const record = this.#options.store.read("onepassword");
    if (!record) throw new ConnectorFailure("token-rejected");
    const generation = this.#generation;
    const indexing = this.#build(record.secret)
      .then((index) => {
        if (generation === this.#generation) {
          this.#index = index;
          this.#error = null;
          this.#emit();
        }
        return index;
      })
      .catch((error: unknown) => {
        if (generation === this.#generation) {
          this.#error = { code: failureCode(error) };
          this.#emit();
        }
        throw error;
      })
      .finally(() => {
        if (this.#indexing === indexing) this.#indexing = null;
      });
    this.#indexing = indexing;
    return indexing;
  }

  async #build(token: string): Promise<Index> {
    const executable = await this.#requireCli();
    const vaults = jsonArray(await this.#tool(executable, ["vault", "list", "--format", "json"], token)).flatMap(
      (entry) =>
        isDynamicRecord(entry) && isString(entry.id) && isString(entry.name)
          ? [{ id: entry.id, name: entry.name }]
          : [],
    );
    const logins: IndexedLogin[] = [];
    for (const vault of vaults) {
      const items = jsonArray(
        await this.#tool(
          executable,
          ["item", "list", "--vault", vault.id, "--categories", "Login", "--format", "json"],
          token,
        ),
      );
      for (const item of items) {
        if (!isDynamicRecord(item) || !isString(item.id) || !isString(item.title)) continue;
        const urls = Array.isArray(item.urls)
          ? item.urls.flatMap((entry) => (isDynamicRecord(entry) && isString(entry.href) ? [entry.href] : []))
          : [];
        logins.push({ id: item.id, vaultId: vault.id, title: item.title, urls });
      }
    }
    return { readAt: this.#now(), vaultNames: vaults.map((vault) => vault.name), logins };
  }

  /** The user name and whether a one-time password is set, from one read of the item. */
  async #item(token: string, login: IndexedLogin): Promise<{ username: string | null; hasOneTimePassword: boolean }> {
    const executable = await this.#requireCli();
    const item = JSON.parse(
      await this.#tool(executable, ["item", "get", login.id, "--vault", login.vaultId, "--format", "json"], token),
    );
    const fields = isDynamicRecord(item) && Array.isArray(item.fields) ? item.fields : [];
    let username: string | null = null;
    let hasOneTimePassword = false;
    for (const field of fields) {
      if (!isDynamicRecord(field)) continue;
      if (field.id === "username" && isString(field.value) && field.value.length > 0) username = field.value;
      if (field.type === "OTP") hasOneTimePassword = true;
    }
    return { username, hasOneTimePassword };
  }
}
