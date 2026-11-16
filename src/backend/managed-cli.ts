// COSGRAL W5-BE1: managed agent CLIs. The program downloads the official Codex CLI and Claude Code when asked (or when
// the preferred provider has none), checks size and SHA-256 while the file streams, keeps one folder per version under
// the COSGRAL data folder and updates it automatically unless the person switched that off or pinned a version.
//
// Rules: the first download of a CLI asks the person first (a confirm card, or a dialog when no agent exists yet);
// updates after that run without asking, always with SHA-256. No administrator rights (everything stays in the data
// folder). Only downloaded CLIs are removed, never a custom or system one. Order of use: custom path > downloaded >
// system PATH (cli.ts asks `resolve()`).

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ManagedCliId,
  ManagedCliPhase,
  ManagedCliSettingsInput,
  ManagedCliSource,
  ManagedCliState,
} from "@openbot/contracts/ipc";
import { MANAGED_CLI_IDS } from "@openbot/contracts/ipc";
import { type DynamicRecord, isBoolean, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import type { CliCatalog, CliRelease } from "./cli-catalog";
import { type DownloadSource, downloadVerified } from "./voice-download";

interface StoredCli {
  autoUpdate: boolean;
  customPath: string | null;
  pinnedVersion: string | null;
  managedVersion: string | null;
  /** The person said yes to the first download once; later updates need no card. */
  approved: boolean;
  latestVersion: string | null;
  checkedAt: string | null;
}

export interface ManagedCliDeps {
  /** Folder for the managed CLIs (inside the COSGRAL data folder). */
  root: string;
  catalog: CliCatalog;
  source: DownloadSource;
  /** The allowed-address check of the download (official hosts; a loopback check in tests). */
  checkUrl: (value: string) => URL;
  /** Ask the person before the first download; true = yes. */
  confirm: (input: { title: string; preview: string }) => Promise<boolean>;
  /** Start the downloaded CLI once (`--version`) and return what it printed. */
  probe: (executable: string) => Promise<string>;
  /** A CLI found on the system (PATH, known folders), ignoring custom and managed ones. */
  findSystem: (id: ManagedCliId) => Promise<{ executable: string; version: string | null } | null>;
  emit: (state: ManagedCliState) => void;
  /** The executable to use changed (install, remove, custom path): restart what needs it. */
  onExecutableChanged?: (id: ManagedCliId) => void;
  now?: () => Date;
  /** Removes a version folder (tests make it fail like Windows does for a running CLI). */
  remove?: (path: string) => Promise<void>;
}

const defaultRemove = (path: string): Promise<void> => rm(path, { recursive: true, force: true });

/** SHA-256 of a file, streamed (a CLI is hundreds of MB). */
async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

const LABELS: Record<ManagedCliId, string> = { codex: "Codex CLI", claude: "Claude Code" };
const SOURCES: Record<ManagedCliId, string> = {
  codex: "github.com/openai/codex (official releases)",
  claude: "downloads.claude.ai (Anthropic's official releases)",
};

function defaults(): StoredCli {
  return {
    autoUpdate: true,
    customPath: null,
    pinnedVersion: null,
    managedVersion: null,
    approved: false,
    latestVersion: null,
    checkedAt: null,
  };
}

export class ManagedCliManager {
  readonly #deps: ManagedCliDeps;
  readonly #stored = new Map<ManagedCliId, StoredCli>();
  readonly #runtime = new Map<
    ManagedCliId,
    { phase: ManagedCliPhase; progress: ManagedCliState["progress"]; error: string | null }
  >();
  readonly #system = new Map<ManagedCliId, { executable: string; version: string | null } | null>();
  readonly #busy = new Map<ManagedCliId, Promise<ManagedCliState>>();
  #loaded = false;

  constructor(deps: ManagedCliDeps) {
    this.#deps = deps;
    for (const id of MANAGED_CLI_IDS) {
      this.#stored.set(id, defaults());
      this.#runtime.set(id, { phase: "idle", progress: null, error: null });
    }
  }

  /**
   * Reads the saved settings (synchronously, so `resolve()` knows the custom and downloaded CLI before the first agent
   * starts), then looks for system CLIs.
   */
  async init(): Promise<void> {
    if (this.#loaded) return;
    this.#loaded = true;
    try {
      const saved = JSON.parse(readFileSync(this.#settingsFile(), "utf8"));
      for (const id of MANAGED_CLI_IDS) {
        const entry = isDynamicRecord(saved) ? saved[id] : null;
        if (isDynamicRecord(entry)) this.#stored.set(id, parseStored(entry));
      }
    } catch {
      // No settings yet: defaults (auto-update on).
    }
    for (const id of MANAGED_CLI_IDS) {
      const stored = this.#get(id);
      if (stored.managedVersion && !existsSync(this.#executable(id, stored.managedVersion)))
        stored.managedVersion = null;
    }
    await this.refreshSystem();
    for (const id of MANAGED_CLI_IDS) await this.#pruneOld(id);
  }

  /**
   * Removes older version folders and half-finished downloads left behind (Windows cannot delete a CLI that was still
   * running during an update; the next start tries again). Only inside this CLI's folder.
   */
  async #pruneOld(id: ManagedCliId): Promise<void> {
    const folder = join(this.#deps.root, id);
    const keep = this.#get(id).managedVersion;
    const entries = await readdir(folder).catch((): string[] => []);
    for (const entry of entries) {
      if (entry === keep) continue;
      await (this.#deps.remove ?? defaultRemove)(join(folder, entry)).catch(() => undefined);
    }
  }

  /** Looks for system CLIs again (at start, and when the window asks for the list). */
  async refreshSystem(): Promise<void> {
    for (const id of MANAGED_CLI_IDS) await this.#refreshSystem(id);
  }

  /** For cli.ts: the custom path (used alone) and the downloaded executable (tried before PATH). */
  resolve(id: ManagedCliId): { custom: string | null; managed: string | null } {
    const stored = this.#get(id);
    const managed = stored.managedVersion ? this.#executable(id, stored.managedVersion) : null;
    return { custom: stored.customPath, managed: managed && existsSync(managed) ? managed : null };
  }

  list(): ManagedCliState[] {
    return MANAGED_CLI_IDS.map((id) => this.state(id));
  }

  state(id: ManagedCliId): ManagedCliState {
    const stored = this.#get(id);
    const runtime = this.#runtime.get(id) ?? { phase: "idle", progress: null, error: null };
    const resolved = this.resolve(id);
    const system = this.#system.get(id) ?? null;
    let source: ManagedCliSource = "none";
    let executable: string | null = null;
    let version: string | null = null;
    if (resolved.custom) {
      source = "custom";
      executable = resolved.custom;
    } else if (resolved.managed) {
      source = "managed";
      executable = resolved.managed;
      version = stored.managedVersion;
    } else if (system) {
      source = "system";
      executable = system.executable;
      version = system.version;
    }
    return {
      id,
      source,
      executable,
      version,
      managedVersion: resolved.managed ? stored.managedVersion : null,
      pinnedVersion: stored.pinnedVersion,
      latestVersion: stored.latestVersion,
      autoUpdate: stored.autoUpdate,
      customPath: stored.customPath,
      phase: runtime.phase,
      progress: runtime.progress,
      error: runtime.error,
      checkedAt: stored.checkedAt,
    };
  }

  /** Asks the official source for the newest version (no download). */
  check(id: ManagedCliId): Promise<ManagedCliState> {
    return this.#exclusive(id, async () => {
      this.#set(id, { phase: "checking", error: null });
      try {
        await this.#latest(id);
        this.#set(id, { phase: "idle" });
      } catch (error) {
        this.#set(id, { phase: "error", error: message(error) });
      }
      return this.state(id);
    });
  }

  /** Download, verify and install. The first download asks first; `automatic` updates never ask. */
  install(id: ManagedCliId, version?: string, options: { automatic?: boolean } = {}): Promise<ManagedCliState> {
    return this.#exclusive(id, () => this.#install(id, version, options.automatic === true));
  }

  update(id: ManagedCliId): Promise<ManagedCliState> {
    return this.install(id, undefined, { automatic: this.#get(id).approved });
  }

  /** Removes the downloaded CLI only. A custom or system CLI is never touched. */
  remove(id: ManagedCliId): Promise<ManagedCliState> {
    return this.#exclusive(id, async () => {
      this.#set(id, { phase: "removing", error: null });
      try {
        await rm(join(this.#deps.root, id), { recursive: true, force: true });
        this.#get(id).managedVersion = null;
        await this.#save();
        this.#set(id, { phase: "idle", progress: null });
        this.#deps.onExecutableChanged?.(id);
      } catch (error) {
        this.#set(id, { phase: "error", error: `Could not remove the downloaded CLI: ${message(error)}` });
      }
      return this.state(id);
    });
  }

  async pin(id: ManagedCliId, version: string | null): Promise<ManagedCliState> {
    this.#get(id).pinnedVersion = version;
    await this.#save();
    this.#emit(id);
    return this.state(id);
  }

  async setSettings(input: ManagedCliSettingsInput): Promise<ManagedCliState> {
    const stored = this.#get(input.id);
    if (input.autoUpdate !== undefined) stored.autoUpdate = input.autoUpdate;
    let pathChanged = false;
    if (input.customPath !== undefined) {
      if (input.customPath !== null && !existsSync(input.customPath))
        throw new Error("No file at that path. Choose the CLI's executable.");
      pathChanged = stored.customPath !== input.customPath;
      stored.customPath = input.customPath;
    }
    await this.#save();
    this.#emit(input.id);
    if (pathChanged) this.#deps.onExecutableChanged?.(input.id);
    return this.state(input.id);
  }

  /**
   * At start and then regularly: updates every downloaded CLI that has auto-update on and no pinned version.
   * Never asks (the first download was approved); a failure keeps the current version and shows the error.
   */
  async autoUpdate(): Promise<void> {
    for (const id of MANAGED_CLI_IDS) {
      const stored = this.#get(id);
      if (!stored.managedVersion || !stored.autoUpdate || stored.pinnedVersion || stored.customPath) continue;
      try {
        const latest = await this.#latest(id);
        if (latest.version !== stored.managedVersion) await this.install(id, latest.version, { automatic: true });
      } catch (error) {
        this.#set(id, { phase: "error", error: `Automatic update failed: ${message(error)}` });
      }
    }
  }

  async #install(id: ManagedCliId, version: string | undefined, automatic: boolean): Promise<ManagedCliState> {
    const stored = this.#get(id);
    this.#set(id, { phase: "checking", error: null, progress: null });
    let release: CliRelease;
    try {
      const target = version ?? stored.pinnedVersion;
      release = target
        ? await this.#deps.catalog.release(id, target, new AbortController().signal)
        : await this.#latest(id);
    } catch (error) {
      this.#set(id, { phase: "error", error: message(error) });
      return this.state(id);
    }
    if (!stored.approved && !automatic) {
      this.#set(id, { phase: "awaiting-approval" });
      let allowed = false;
      try {
        allowed = await this.#deps.confirm({
          title: `Download ${LABELS[id]} ${release.version}?`,
          preview: `COSGRAL Workspace will download ${LABELS[id]} ${release.version} (${Math.round(release.sizeBytes / 1_048_576)} MB) from ${SOURCES[id]}, check its SHA-256 and keep it in its own data folder. No administrator rights are needed. Later updates install without asking unless you switch automatic updates off.`,
        });
      } catch (error) {
        this.#set(id, { phase: "error", error: message(error) });
        return this.state(id);
      }
      if (!allowed) {
        this.#set(id, { phase: "idle", error: "The download was declined." });
        return this.state(id);
      }
      stored.approved = true;
      await this.#save();
    } else if (!stored.approved && automatic) {
      this.#set(id, { phase: "error", error: "The first download needs your approval." });
      return this.state(id);
    }
    const destination = this.#executable(id, release.version);
    const staging = join(this.#deps.root, id, `.${release.version}.download`);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await rm(staging, { recursive: true, force: true });
        this.#set(id, { phase: "downloading", progress: { receivedBytes: 0, totalBytes: release.sizeBytes } });
        let lastEmit = 0;
        await downloadVerified({
          source: this.#deps.source,
          url: release.url,
          sha256: release.sha256,
          sizeBytes: release.sizeBytes,
          destination: join(staging, release.fileName),
          signal: new AbortController().signal,
          checkUrl: this.#deps.checkUrl,
          onProgress: (received) => {
            const nowMs = Date.now();
            if (nowMs - lastEmit < 250 && received < release.sizeBytes) return;
            lastEmit = nowMs;
            this.#set(id, {
              phase: "downloading",
              progress: { receivedBytes: received, totalBytes: release.sizeBytes },
            });
          },
        });
        this.#set(id, { phase: "installing", progress: null });
        await this.#deps.probe(join(staging, release.fileName)).catch((error: unknown) => {
          throw new Error(`The downloaded CLI does not start: ${message(error)}`);
        });
        const folder = join(this.#deps.root, id, release.version);
        let removeError: unknown = null;
        try {
          await (this.#deps.remove ?? defaultRemove)(folder);
        } catch (error) {
          removeError = error;
        }
        if (removeError === null) {
          await rename(staging, folder);
        } else if (existsSync(destination) && (await sha256OfFile(destination)) === release.sha256) {
          // Windows cannot delete a CLI that is still running. An earlier update left this folder behind and the very
          // same, verified file is already in it (COSGRAL W5-G2: switching back to a version after a pin failed here).
          await rm(staging, { recursive: true, force: true });
        } else {
          throw new Error(
            `${LABELS[id]} ${release.version} is still running, so it cannot be replaced. Stop the agents that use it (or restart the program) and try again.`,
          );
        }
        const previous = stored.managedVersion;
        stored.managedVersion = release.version;
        await this.#save();
        if (previous && previous !== release.version)
          await (this.#deps.remove ?? defaultRemove)(join(this.#deps.root, id, previous)).catch(() => undefined);
        if (!existsSync(destination)) throw new Error("The installed CLI is missing.");
        this.#set(id, { phase: "idle", progress: null, error: null });
        this.#deps.onExecutableChanged?.(id);
        return this.state(id);
      } catch (error) {
        await rm(staging, { recursive: true, force: true }).catch(() => undefined);
        const text = message(error);
        // One more try for a broken connection; never for a failed check (size or SHA-256).
        if (
          attempt === 1 &&
          !/SHA-256|unexpected size|larger than expected|not allowed|does not start|still running/i.test(text)
        )
          continue;
        this.#set(id, { phase: "error", progress: null, error: text });
        return this.state(id);
      }
    }
    return this.state(id);
  }

  async #latest(id: ManagedCliId): Promise<CliRelease> {
    const release = await this.#deps.catalog.latest(id, new AbortController().signal);
    const stored = this.#get(id);
    stored.latestVersion = release.version;
    stored.checkedAt = (this.#deps.now?.() ?? new Date()).toISOString();
    await this.#save();
    return release;
  }

  async #refreshSystem(id: ManagedCliId): Promise<void> {
    this.#system.set(id, await this.#deps.findSystem(id).catch(() => null));
  }

  #exclusive(id: ManagedCliId, work: () => Promise<ManagedCliState>): Promise<ManagedCliState> {
    const running = this.#busy.get(id);
    if (running) return running;
    const task = work().finally(() => this.#busy.delete(id));
    this.#busy.set(id, task);
    return task;
  }

  #set(
    id: ManagedCliId,
    patch: Partial<{ phase: ManagedCliPhase; progress: ManagedCliState["progress"]; error: string | null }>,
  ) {
    const current = this.#runtime.get(id) ?? { phase: "idle", progress: null, error: null };
    this.#runtime.set(id, { ...current, ...patch });
    this.#emit(id);
  }

  #emit(id: ManagedCliId): void {
    this.#deps.emit(this.state(id));
  }

  #get(id: ManagedCliId): StoredCli {
    const stored = this.#stored.get(id);
    if (!stored) throw new Error("Unknown CLI.");
    return stored;
  }

  #executable(id: ManagedCliId, version: string): string {
    return join(this.#deps.root, id, version, id === "codex" ? "codex.exe" : "claude.exe");
  }

  #settingsFile(): string {
    return join(this.#deps.root, "settings.json");
  }

  async #save(): Promise<void> {
    await mkdir(this.#deps.root, { recursive: true });
    const data = Object.fromEntries(MANAGED_CLI_IDS.map((id) => [id, this.#get(id)]));
    const temporary = `${this.#settingsFile()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`);
    await rename(temporary, this.#settingsFile());
  }
}

function parseStored(entry: DynamicRecord): StoredCli {
  const text = (value: unknown) => (isString(value) && value.length > 0 ? value : null);
  return {
    autoUpdate: isBoolean(entry.autoUpdate) ? entry.autoUpdate : true,
    customPath: text(entry.customPath),
    pinnedVersion: text(entry.pinnedVersion),
    managedVersion: text(entry.managedVersion),
    approved: entry.approved === true,
    latestVersion: text(entry.latestVersion),
    checkedAt: text(entry.checkedAt),
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
