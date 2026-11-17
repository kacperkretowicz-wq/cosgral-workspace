// COSGRAL W11-KK (d): the Bitwarden connector. Our own code for the behaviour of OpenBot 0.71, with the command-line tool `bw`
// behind a port so every test runs on a fake.
//
// The person unlocks their vault with `bw unlock --raw` and pastes the SESSION KEY. The key stays in memory only (never on disk,
// never in a status or an error): after a restart or 8 hours without use the session ends and the person connects again. Agents
// read only the logins in ONE folder, "Shared with COSGRAL", which the person fills; logins that ask for the master password again
// ("re-prompt") and deleted ones are never used. The key goes to `bw` in its environment (BW_SESSION), never in its arguments.

import {
  emptyVaultConnectorStatus,
  VAULT_CONNECTOR_LIMITS,
  VAULT_CONNECTOR_SHARED_NAME,
  type VaultConnectorErrorCode,
  type VaultConnectorStatus,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import {
  ConnectorFailure,
  type ConnectorLogin,
  type ConnectorLoginSource,
  failureCode,
  type RunCli,
  websiteMatchesOrigin,
} from "./common";

const IDLE_MS = 8 * 60 * 60 * 1000;
const UUID = /^[a-f0-9-]{36}$/iu;

interface Session {
  executable: string;
  key: string;
  folderId: string;
  abort: AbortController;
}

export interface BitwardenOptions {
  runCli: RunCli;
  /** The path of `bw`, or rejects when there is none. */
  findCli: () => Promise<string>;
  emit: (status: VaultConnectorStatus) => void;
  /** For tests: the timer that ends an idle session. */
  setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

/** An item of the shared folder the agents may use: a login, not deleted, no re-prompt, one https address that matches. */
function eligible(
  item: unknown,
  folderId: string,
): item is {
  id: string;
  name: string;
  login: { username?: string | null; password?: string | null; totp?: string | null; uris?: unknown[] };
} {
  if (!isDynamicRecord(item) || !isString(item.id) || !isString(item.name)) return false;
  if (item.type !== 1 || item.folderId !== folderId || (item.reprompt !== undefined && item.reprompt !== 0))
    return false;
  if (item.deletedDate) return false;
  return isDynamicRecord(item.login);
}

function matchesOrigin(login: { uris?: unknown[] }, origin: string): boolean {
  return (login.uris ?? []).some((entry) => {
    if (!isDynamicRecord(entry) || !isString(entry.uri)) return false;
    const rule = entry.match;
    // Bitwarden's default and "base domain" rules (null, 0) take the saved host and its subdomains; "host" (1) only the host.
    if (isNumber(rule) && rule !== 0 && rule !== 1) return false;
    return websiteMatchesOrigin({ url: entry.uri, autofill: rule === 1 ? "exact" : "anywhere" }, origin);
  });
}

export class BitwardenConnector implements ConnectorLoginSource {
  readonly connector = "bitwarden" as const;
  readonly #options: BitwardenOptions;
  #session: Session | null = null;
  #connecting: AbortController | null = null;
  #error: VaultConnectorErrorCode | null = null;
  #serverUrl: string | null = null;
  #loginCount: number | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  /** The tool handles one command at a time per session. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: BitwardenOptions) {
    this.#options = options;
  }

  connected(): boolean {
    return this.#session !== null && this.#connecting === null;
  }

  status(): VaultConnectorStatus {
    let state: VaultConnectorStatus["state"] = "disconnected";
    if (this.#connecting) state = "connecting";
    else if (this.#error) state = "failed";
    else if (this.#session) state = "connected";
    return {
      ...emptyVaultConnectorStatus("bitwarden"),
      state,
      setup: {
        cli: this.#session ? "ready" : "checking",
        cliVersion: null,
        canInstall: false,
        appIntegration: null,
      },
      vaultNames: state === "connected" ? [VAULT_CONNECTOR_SHARED_NAME] : [],
      loginCount: state === "connected" ? this.#loginCount : null,
      serverUrl: state === "connected" ? this.#serverUrl : null,
      error: state === "failed" && this.#error ? new ConnectorFailure(this.#error).message : null,
      errorCode: state === "failed" ? this.#error : null,
    };
  }

  /** The tool's presence (does not touch any session). */
  async checkSetup(): Promise<VaultConnectorStatus> {
    const found = await this.#options.findCli().then(
      () => true,
      () => false,
    );
    const status = this.status();
    return { ...status, setup: { ...status.setup, cli: found ? "ready" : "missing" } };
  }

  /**
   * Opens the session with the key the person pasted. Only a session that is unlocked and has exactly one shared folder is kept.
   * `serverUrl` (optional) must be the server the tool is set to, so a key for another server is not used by mistake.
   */
  async connect(key: string, serverUrl?: string): Promise<VaultConnectorStatus> {
    this.disconnect();
    const attempt = new AbortController();
    this.#connecting = attempt;
    this.#error = null;
    this.#emit();
    try {
      if (key.length === 0 || key.length > VAULT_CONNECTOR_LIMITS.secret) throw new ConnectorFailure("token-rejected");
      const executable = await this.#options.findCli().catch(() => {
        throw new ConnectorFailure("cli-missing");
      });
      const session: Session = { executable, key, folderId: "", abort: attempt };
      const cli = await this.#json(session, ["status"]);
      if (!isDynamicRecord(cli) || cli.status !== "unlocked") throw new ConnectorFailure("locked");
      const server = isString(cli.serverUrl) ? cli.serverUrl.replace(/\/+$/u, "") : null;
      if (serverUrl !== undefined && server !== serverUrl) throw new ConnectorFailure("unknown");
      await this.#run(session, ["sync"]);
      const folders = await this.#json(session, ["list", "folders"]);
      const shared = Array.isArray(folders)
        ? folders.filter((folder) => isDynamicRecord(folder) && folder.name === VAULT_CONNECTOR_SHARED_NAME)
        : [];
      const folder = shared[0];
      if (shared.length !== 1 || !isDynamicRecord(folder) || !isString(folder.id) || folder.id.length === 0) {
        throw new ConnectorFailure("folder-missing");
      }
      session.folderId = folder.id;
      if (attempt.signal.aborted) return this.status();
      this.#session = session;
      this.#serverUrl = server;
      this.#loginCount = await this.#countLogins(session);
      this.#touch();
    } catch (error) {
      if (!attempt.signal.aborted) this.#error = failureCode(error);
    } finally {
      if (this.#connecting === attempt) this.#connecting = null;
      this.#emit();
    }
    return this.status();
  }

  cancel(): VaultConnectorStatus {
    this.#connecting?.abort();
    this.#connecting = null;
    this.#error = null;
    this.#emit();
    return this.status();
  }

  /** Ends the session and forgets the key. The folder and its logins stay in Bitwarden. */
  disconnect(): VaultConnectorStatus {
    this.#connecting?.abort();
    this.#connecting = null;
    this.#drop();
    this.#error = null;
    this.#emit();
    return this.status();
  }

  dispose(): void {
    this.#connecting?.abort();
    this.#drop();
  }

  async loginsFor(origin: string): Promise<ConnectorLogin[] | null> {
    const session = this.#session;
    if (!session) return null;
    return this.#reported(session, async () => {
      const items = await this.#json(session, ["list", "items", "--folderid", session.folderId]);
      const logins: ConnectorLogin[] = [];
      for (const item of Array.isArray(items) ? items : []) {
        if (!eligible(item, session.folderId) || !matchesOrigin(item.login, origin)) continue;
        logins.push({
          id: item.id,
          title: item.name,
          username: item.login.username ? item.login.username : null,
          hasOneTimePassword: Boolean(item.login.totp),
        });
        if (logins.length >= VAULT_CONNECTOR_LIMITS.loginsPerPage) break;
      }
      return logins;
    });
  }

  async secretFor(loginId: string, origin: string, kind: "password" | "otp"): Promise<string | null> {
    const session = this.#session;
    if (!session || !UUID.test(loginId)) return null;
    return this.#reported(session, async () => {
      await this.#run(session, ["sync"]);
      const item = await this.#json(session, ["get", "item", loginId]);
      if (!eligible(item, session.folderId) || item.id !== loginId || !matchesOrigin(item.login, origin)) return null;
      if (kind === "password") return item.login.password || null;
      if (!item.login.totp) return null;
      const code = (await this.#run(session, ["get", "totp", loginId])).trim();
      return code.length > 0 ? code : null;
    });
  }

  // --- internals ---

  #emit(): void {
    this.#options.emit(this.status());
  }

  async #countLogins(session: Session): Promise<number> {
    const items = await this.#json(session, ["list", "items", "--folderid", session.folderId]);
    return (Array.isArray(items) ? items : []).filter((item) => eligible(item, session.folderId)).length;
  }

  /** A failing read ends the session ("locked"): the status then shows the failure and the person connects again. */
  async #reported<T>(session: Session, read: () => Promise<T>): Promise<T> {
    try {
      const value = await read();
      this.#touch();
      return value;
    } catch (error) {
      if (this.#session === session) {
        this.#drop();
        this.#error = error instanceof ConnectorFailure ? error.code : "locked";
        this.#emit();
      }
      throw error instanceof ConnectorFailure ? error : new ConnectorFailure("locked");
    }
  }

  async #json(session: Session, args: readonly string[]): Promise<unknown> {
    const output = await this.#run(session, args);
    try {
      return JSON.parse(output);
    } catch {
      throw new ConnectorFailure("unknown");
    }
  }

  #run(session: Session, args: readonly string[]): Promise<string> {
    const run = async () => {
      if (session.abort.signal.aborted) throw new ConnectorFailure("locked");
      try {
        return await this.#options.runCli(session.executable, args, {
          env: { BW_SESSION: session.key, BITWARDENCLI_INTERACTIVE: "false" },
          signal: session.abort.signal,
        });
      } catch {
        // The tool's own text can hold item names; the person gets a fixed sentence.
        throw new ConnectorFailure("locked");
      }
    };
    const next = this.#queue.then(run, run);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  #drop(): void {
    this.#session?.abort.abort();
    this.#session = null;
    this.#loginCount = null;
    this.#serverUrl = null;
    if (this.#timer !== null) (this.#options.clearTimer ?? clearTimeout)(this.#timer);
    this.#timer = null;
  }

  /** After 8 hours with no use the session ends and the key is forgotten. */
  #touch(): void {
    if (this.#timer !== null) (this.#options.clearTimer ?? clearTimeout)(this.#timer);
    const set = this.#options.setTimer ?? ((callback: () => void, ms: number) => setTimeout(callback, ms));
    this.#timer = set(() => {
      this.#drop();
      this.#error = "locked";
      this.#emit();
    }, IDLE_MS);
  }
}
