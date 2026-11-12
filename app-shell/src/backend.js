"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = "3100";

let backendChild = null;
let startedByUs = false;

function resolveRepoRoot() {
  if (process.env.COSGRAL_REPO) {
    return path.resolve(process.env.COSGRAL_REPO);
  }
  const candidates = [
    // app-shell/src → repo root (in-tree: cosgral-workspace/app-shell)
    path.resolve(__dirname, "..", ".."),
    // Shared/.../app-shell/src → sibling cosgral-workspace (staging)
    path.resolve(__dirname, "..", "..", "cosgral-workspace"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }
  if (process.resourcesPath) {
    const bundled = path.join(process.resourcesPath, "cosgral-workspace");
    if (fs.existsSync(path.join(bundled, "package.json"))) {
      return bundled;
    }
  }
  return candidates[0];
}

function resolveDataHome(repoRoot) {
  if (process.env.PAPERCLIP_HOME || process.env.COSGRAL_DATA) {
    return path.resolve(process.env.PAPERCLIP_HOME || process.env.COSGRAL_DATA);
  }
  const staging = path.resolve(repoRoot, "..", "work", "cosgral-data");
  return staging;
}

function healthUrl(host = DEFAULT_HOST, port = DEFAULT_PORT) {
  return `http://${host}:${port}/api/health`;
}

function probeHealth(url, timeoutMs = 1500) {
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

async function waitForHealth(url, { attempts = 90, intervalMs = 1000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (await probeHealth(url)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function pickSpawnCommand(repoRoot) {
  const serverDir = path.join(repoRoot, "server");
  const distEntry = path.join(serverDir, "dist", "index.js");
  const hasDist = fs.existsSync(distEntry);
  const hasNodeModules = fs.existsSync(path.join(repoRoot, "node_modules"));

  if (hasDist && hasNodeModules) {
    return {
      label: "node server/dist",
      command: process.platform === "win32" ? "node.exe" : "node",
      args: [distEntry],
      cwd: serverDir,
    };
  }

  // Dev path matching scripts/start-windows.md
  return {
    label: "pnpm @paperclipai/server dev",
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: ["--filter", "@paperclipai/server", "dev"],
    cwd: repoRoot,
  };
}

function spawnBackend({ repoRoot, dataHome, host, port }) {
  const pick = pickSpawnCommand(repoRoot);
  const env = {
    ...process.env,
    HOST: host,
    PORT: String(port),
    PAPERCLIP_HOME: dataHome,
    PAPERCLIP_API_URL: `http://${host}:${port}`,
    PAPERCLIP_MIGRATION_AUTO_APPLY: "true",
    PAPERCLIP_MIGRATION_PROMPT: "never",
  };
  delete env.DATABASE_URL;

  console.log(
    `[cosgral-workspace] starting backend via ${pick.label} (cwd=${pick.cwd})`
  );
  console.log(`[cosgral-workspace] PAPERCLIP_HOME=${dataHome}`);

  // .cmd shims on Windows need a shell; node.exe does not.
  const useShell =
    process.platform === "win32" && /\.cmd$/i.test(pick.command);
  const child = spawn(pick.command, pick.args, {
    cwd: pick.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: useShell,
  });

  child.stdout?.on("data", (buf) => {
    const line = String(buf).trim();
    if (line) console.log(`[backend] ${line}`);
  });
  child.stderr?.on("data", (buf) => {
    const line = String(buf).trim();
    if (line) console.error(`[backend] ${line}`);
  });
  child.on("exit", (code, signal) => {
    console.log(
      `[cosgral-workspace] backend exited code=${code} signal=${signal || ""}`
    );
    if (backendChild === child) {
      backendChild = null;
      startedByUs = false;
    }
  });
  child.on("error", (err) => {
    console.error(`[cosgral-workspace] backend spawn error: ${err.message}`);
  });

  backendChild = child;
  startedByUs = true;
  return child;
}

function stopBackend() {
  if (!backendChild || !startedByUs) return;
  const child = backendChild;
  const pid = child.pid;
  backendChild = null;
  startedByUs = false;
  if (!pid) return;

  console.log(`[cosgral-workspace] stopping backend pid=${pid}`);
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
}

/**
 * Ensure loopback API (+ embedded DB via server) is up.
 * Skips spawn when already healthy or COSGRAL_SKIP_BACKEND=1.
 */
async function ensureBackend() {
  if (
    process.env.COSGRAL_SKIP_BACKEND === "1" ||
    process.env.COSGRAL_SKIP_BACKEND === "true"
  ) {
    console.log("[cosgral-workspace] COSGRAL_SKIP_BACKEND set — not spawning");
    return { ok: true, spawned: false, skipped: true };
  }

  const host = process.env.HOST || DEFAULT_HOST;
  const port = process.env.PORT || DEFAULT_PORT;
  const url = healthUrl(host, port);

  if (await probeHealth(url)) {
    console.log(`[cosgral-workspace] backend already up at ${url}`);
    return { ok: true, spawned: false, healthUrl: url };
  }

  const repoRoot = resolveRepoRoot();
  if (!fs.existsSync(path.join(repoRoot, "package.json"))) {
    console.error(
      `[cosgral-workspace] repo missing at ${repoRoot} — set COSGRAL_REPO`
    );
    return { ok: false, spawned: false, healthUrl: url, error: "repo_missing" };
  }
  if (!fs.existsSync(path.join(repoRoot, "node_modules"))) {
    console.error(
      `[cosgral-workspace] node_modules missing in ${repoRoot} — run install-deps.ps1`
    );
    return {
      ok: false,
      spawned: false,
      healthUrl: url,
      error: "deps_missing",
    };
  }

  const dataHome = resolveDataHome(repoRoot);
  try {
    fs.mkdirSync(dataHome, { recursive: true });
  } catch (err) {
    console.error(`[cosgral-workspace] cannot create data home: ${err.message}`);
  }

  spawnBackend({ repoRoot, dataHome, host, port });
  const ready = await waitForHealth(url);
  if (!ready) {
    console.error(`[cosgral-workspace] backend health timeout: ${url}`);
    return { ok: false, spawned: true, healthUrl: url, error: "health_timeout" };
  }
  console.log(`[cosgral-workspace] backend ready at ${url}`);
  return { ok: true, spawned: true, healthUrl: url };
}

module.exports = {
  ensureBackend,
  stopBackend,
  healthUrl,
  resolveRepoRoot,
};
