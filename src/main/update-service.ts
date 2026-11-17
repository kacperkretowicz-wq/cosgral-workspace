import { EventEmitter } from "node:events";
import { DEFAULT_UPDATE_PREFERENCES, type UpdatePreferences, type UpdateStatus } from "@openbot/contracts/ipc";
import type { AppUpdater, ProgressInfo, UpdateInfo } from "electron-updater";

type UpdateAdapter = {
  allowPrerelease: boolean;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  checkForUpdates: () => Promise<Awaited<ReturnType<AppUpdater["checkForUpdates"]>>>;
  downloadUpdate: () => Promise<unknown>;
  on(event: "checking-for-update", listener: () => void): unknown;
  on(event: "update-available", listener: (info: UpdateInfo) => void): unknown;
  on(event: "update-not-available", listener: (info: UpdateInfo) => void): unknown;
  on(event: "download-progress", listener: (progress: ProgressInfo) => void): unknown;
  on(event: "update-downloaded", listener: (info: UpdateInfo) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
};

interface UpdateServiceEvents {
  status: [status: UpdateStatus];
}

interface UpdateServiceOptions {
  currentVersion: string;
  enabled: boolean;
  beforeInstall: () => Promise<void>;
  initialCheckDelayMs?: number;
  checkIntervalMs?: number;
}

const DEFAULT_CHECK_INTERVAL = 4 * 60 * 60 * 1_000;

export function supportsInstalledUpdates(platform: NodeJS.Platform): boolean {
  return platform === "darwin" || platform === "win32";
}

export class UpdateService extends EventEmitter<UpdateServiceEvents> {
  readonly #updater: UpdateAdapter;
  readonly #explicitInterval: boolean;
  readonly #options: Required<Omit<UpdateServiceOptions, "beforeInstall">> &
    Pick<UpdateServiceOptions, "beforeInstall">;
  #status: UpdateStatus;
  #checkTimer: ReturnType<typeof setTimeout> | null = null;
  #started = false;
  /** COSGRAL W12-KK (g2): what the person chose (checks, download, install on quit, pre-releases, how often). */
  #preferences: UpdatePreferences = { ...DEFAULT_UPDATE_PREFERENCES };

  constructor(updater: UpdateAdapter, options: UpdateServiceOptions) {
    super();
    this.#updater = updater;
    this.#explicitInterval = options.checkIntervalMs !== undefined;
    this.#options = {
      ...options,
      initialCheckDelayMs: options.initialCheckDelayMs ?? 12_000,
      checkIntervalMs: options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL,
    };
    this.#status = {
      phase: options.enabled ? "idle" : "unsupported",
      currentVersion: options.currentVersion,
      availableVersion: null,
      progress: null,
      checkedAt: null,
      message: options.enabled ? null : "Updates are available in installed desktop builds.",
    };
  }

  start(scheduleChecks = true): void {
    if (this.#started) return;
    this.#started = true;
    this.#updater.autoDownload = false;
    this.#updater.autoInstallOnAppQuit = this.#preferences.installOnQuit;
    this.#updater.allowPrerelease = this.#preferences.includePrereleases;

    this.#updater.on("checking-for-update", () => {
      this.#setStatus({ phase: "checking", progress: null, message: null });
    });
    this.#updater.on("update-available", (info: UpdateInfo) => {
      this.#setStatus({
        phase: "available",
        availableVersion: info.version,
        progress: null,
        checkedAt: new Date().toISOString(),
        message: null,
      });
      // COSGRAL W12-KK (g2): the person asked to download by itself.
      if (this.#preferences.automaticDownload) void this.downloadUpdate();
    });
    this.#updater.on("update-not-available", () => {
      this.#setStatus({
        phase: "up-to-date",
        availableVersion: null,
        progress: null,
        checkedAt: new Date().toISOString(),
        message: null,
      });
    });
    this.#updater.on("download-progress", (progress: ProgressInfo) => {
      this.#setStatus({ phase: "downloading", progress: clampProgress(progress.percent) });
    });
    this.#updater.on("update-downloaded", (info: UpdateInfo) => {
      this.#setStatus({
        phase: "ready",
        availableVersion: info.version,
        progress: 100,
        message: null,
      });
    });
    this.#updater.on("error", () => this.#setError());

    if (scheduleChecks && this.#options.enabled && this.#preferences.automaticChecks) {
      this.#scheduleCheck(this.#options.initialCheckDelayMs);
    }
  }

  getStatus(): UpdateStatus {
    return { ...this.#status };
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (!this.#options.enabled) return this.getStatus();
    if (
      this.#status.phase === "checking" ||
      this.#status.phase === "downloading" ||
      this.#status.phase === "ready" ||
      this.#status.phase === "installing"
    ) {
      return this.getStatus();
    }
    this.#setStatus({ phase: "checking", progress: null, message: null });
    try {
      const result = await this.#updater.checkForUpdates();
      if (this.getStatus().phase === "checking") {
        this.#setStatus(
          result?.isUpdateAvailable
            ? {
                phase: "available",
                availableVersion: result.updateInfo.version,
                checkedAt: new Date().toISOString(),
              }
            : {
                phase: "up-to-date",
                availableVersion: null,
                checkedAt: new Date().toISOString(),
              },
        );
      }
    } catch {
      this.#setError();
    } finally {
      if (this.#preferences.automaticChecks) this.#scheduleCheck(this.#intervalMs());
    }
    return this.getStatus();
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    if (this.#status.phase !== "available") return this.getStatus();
    this.#setStatus({ phase: "downloading", progress: 0, message: null });
    try {
      await this.#updater.downloadUpdate();
    } catch {
      this.#setError();
    }
    return this.getStatus();
  }

  async installUpdate(): Promise<void> {
    if (this.#status.phase !== "ready") throw new Error("An update is not ready to install.");
    this.#setStatus({ phase: "installing", message: null });
    await this.#options.beforeInstall();
    this.#updater.quitAndInstall(false, true);
  }

  /**
   * COSGRAL W12-KK (g2): the person's preferences. With the automatic checks off the program makes no update request by itself (only
   * "Check now" does); a change of the interval restarts the timer from now.
   */
  applyPreferences(preferences: UpdatePreferences): void {
    this.#preferences = { ...preferences };
    if (this.#started) {
      this.#updater.autoInstallOnAppQuit = preferences.installOnQuit;
      this.#updater.allowPrerelease = preferences.includePrereleases;
    }
    if (!this.#started || !this.#options.enabled) return;
    if (preferences.automaticChecks) this.#scheduleCheck(this.#intervalMs());
    else this.stop();
  }

  getPreferences(): UpdatePreferences {
    return { ...this.#preferences };
  }

  #intervalMs(): number {
    return this.#explicitInterval ? this.#options.checkIntervalMs : this.#preferences.checkEveryHours * 3_600_000;
  }

  stop(): void {
    if (this.#checkTimer) clearTimeout(this.#checkTimer);
    this.#checkTimer = null;
  }

  #scheduleCheck(delayMs: number): void {
    if (this.#checkTimer) clearTimeout(this.#checkTimer);
    this.#checkTimer = setTimeout(() => void this.checkForUpdates(), delayMs);
    this.#checkTimer.unref?.();
  }

  #setError(): void {
    this.#setStatus({
      phase: "error",
      progress: null,
      checkedAt: new Date().toISOString(),
      message: "Could not check for updates. Try again.",
    });
  }

  #setStatus(patch: Partial<UpdateStatus>): void {
    this.#status = { ...this.#status, ...patch };
    this.emit("status", this.getStatus());
  }
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? Math.round(value) : 0));
}
