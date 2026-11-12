"use strict";

const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const http = require("node:http");
const { ensureBackend, stopBackend } = require("./backend");

/** Default: loopback API (serves UI when built). Override: COSGRAL_UI_URL (e.g. Vite :5173). */
const UI_URL =
  process.env.COSGRAL_UI_URL ||
  process.env.MONARCHIA_UI_URL || // legacy alias — do not use in docs
  "http://127.0.0.1:3100";

const APP_TITLE = "COSGRAL Workspace";
const WAITING_HTML = path.join(__dirname, "static", "waiting.html");

let mainWindow = null;

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
  const up = await probeUrl(UI_URL);
  if (up) {
    await win.loadURL(UI_URL);
    return;
  }
  const waiting = `file://${WAITING_HTML.replace(/\\/g, "/")}?target=${encodeURIComponent(UI_URL)}`;
  await win.loadURL(waiting);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: APP_TITLE,
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openSafeExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!sameOrigin(url, UI_URL)) {
      event.preventDefault();
    }
  });

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
    console.log(`[cosgral-workspace] target UI ${UI_URL}`);

    // Auto-start Node API + embedded DB on loopback (no manual start-windows.ps1).
    const backend = await ensureBackend();
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

app.on("before-quit", () => {
  stopBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopBackend();
    app.quit();
  }
});
