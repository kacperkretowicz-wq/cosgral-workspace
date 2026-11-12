"use strict";

const { app, BrowserWindow, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const {
  ensureBackend,
  stopBackend,
  resolveRepoRoot,
  resolveBackendTarget,
} = require("./backend");

const APP_TITLE = "COSGRAL Workspace";
const WAITING_HTML = path.join(__dirname, "static", "waiting.html");

// One window per Paperclip instance: backend, ui and tester checkouts run
// side by side, so each needs its own userData (single-instance lock, cache,
// cookies). The instance id comes from the repo-local .paperclip/.env.
const startupTarget = resolveBackendTarget({ repoRoot: resolveRepoRoot() });
const instanceId =
  process.env.COSGRAL_INSTANCE ||
  startupTarget.worktree?.instanceId ||
  (startupTarget.port === 3100 ? null : `port-${startupTarget.port}`);
if (instanceId) {
  app.setPath(
    "userData",
    path.join(app.getPath("appData"), APP_TITLE, "instances", instanceId)
  );
}

/** Default: loopback API of this instance (serves the built UI). Override: COSGRAL_UI_URL (e.g. Vite). */
let uiUrl =
  process.env.COSGRAL_UI_URL ||
  process.env.MONARCHIA_UI_URL || // legacy alias — do not use in docs
  `http://${startupTarget.host}:${startupTarget.port}`;

let mainWindow = null;
let quitting = false;

function isHttpUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sameOrigin(url, base) {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function openSafeExternal(url) {
  if (!isHttpUrl(url)) return Promise.resolve();
  return shell.openExternal(url);
}

function probeUrl(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        res.resume();
        const code = res.statusCode || 0;
        done(code >= 200 && code < 300);
      });
      req.on("timeout", () => {
        req.destroy();
        done(false);
      });
      req.on("error", () => done(false));
    } catch {
      done(false);
    }
  });
}

async function loadUi(win) {
  const up = await probeUrl(uiUrl);
  if (up) {
    await win.loadURL(uiUrl);
    return;
  }
  const waiting = `file://${WAITING_HTML.replace(/\\/g, "/")}?target=${encodeURIComponent(uiUrl)}`;
  await win.loadURL(waiting);
}

function createWindow() {
  const title = instanceId ? `${APP_TITLE} — ${instanceId}` : APP_TITLE;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title,
    show: false,
    backgroundColor: "#0c0f14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Keep the instance name in the title bar; the page sets its own title.
  mainWindow.on("page-title-updated", (event, pageTitle) => {
    event.preventDefault();
    mainWindow.setTitle(pageTitle ? `${title} · ${pageTitle}` : title);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openSafeExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!sameOrigin(url, uiUrl)) {
      event.preventDefault();
    }
  });

  // Evidence for testers: COSGRAL_CAPTURE_PATH=<file.png> saves one capture
  // of the window content once the real UI (not the waiting page) loaded.
  const capturePath = process.env.COSGRAL_CAPTURE_PATH;
  if (capturePath) {
    let captured = false;
    mainWindow.webContents.on("did-finish-load", () => {
      if (captured || !sameOrigin(mainWindow.webContents.getURL(), uiUrl)) return;
      captured = true;
      const delay = Number(process.env.COSGRAL_CAPTURE_DELAY_MS) || 8000;
      setTimeout(async () => {
        try {
          const image = await mainWindow.webContents.capturePage();
          fs.mkdirSync(path.dirname(capturePath), { recursive: true });
          fs.writeFileSync(capturePath, image.toPNG());
          console.log(
            `[cosgral-workspace] captured ${capturePath} title="${mainWindow.getTitle()}" url=${mainWindow.webContents.getURL()}`
          );
        } catch (err) {
          console.error(`[cosgral-workspace] capture failed: ${err.message}`);
        }
      }, delay);
    });
  }

  loadUi(mainWindow).catch((err) => {
    console.error(`[cosgral-workspace] load failed:`, err.message);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    if (process.platform === "win32") {
      app.setAppUserModelId("pl.cosgral.workspace");
    }
    console.log(`[cosgral-workspace] target UI ${uiUrl}`);
    console.log(`[cosgral-workspace] userData ${app.getPath("userData")}`);

    // Auto-start Node API + embedded DB on loopback.
    const backend = await ensureBackend({
      logFile: path.join(app.getPath("userData"), "logs", "backend.log"),
    });
    if (!process.env.COSGRAL_UI_URL && backend.baseUrl) {
      uiUrl = backend.baseUrl;
    }
    if (!backend.ok) {
      console.error(
        `[cosgral-workspace] backend not ready (${backend.error || "unknown"}) — waiting screen`
      );
    }

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

// Wait for the ordered backend shutdown (embedded Postgres included) before
// the shell process exits.
app.on("before-quit", (event) => {
  if (quitting) return;
  quitting = true;
  event.preventDefault();
  stopBackend()
    .catch((err) => console.error(`[cosgral-workspace] stop failed: ${err.message}`))
    .finally(() => app.exit(0));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
