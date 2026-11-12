"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3100;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
// First run initialises Postgres and applies ~400 migrations; give it time.
const DEFAULT_HEALTH_TIMEOUT_MS = 300_000;
const SHUTDOWN_GRACE_MS = 20_000;

let backendChild = null;
let startedByUs = false;
let logStream = null;

function resolveRepoRoot(env = process.env) {
  if (env.COSGRAL_REPO) {
    return path.resolve(env.COSGRAL_REPO);
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

function parseEnvFile(contents) {
  const entries = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || rawLine.trim().startsWith("#")) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    entries[key] = value;
  }
  return entries;
}

/**
 * Repo-local Paperclip instance created by `paperclipai worktree init`
 * (`<repo>/.paperclip/config.json` + `.env`). Each checkout (backend, ui,
 * tester) gets its own PAPERCLIP_HOME, server port and embedded Postgres port.
 */
function readWorktreeInstance(repoRoot) {
  const configPath = path.join(repoRoot, ".paperclip", "config.json");
  if (!fs.existsSync(configPath)) return null;
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    console.error(`[cosgral-workspace] unreadable ${configPath}: ${err.message}`);
    return null;
  }
  const envPath = path.join(repoRoot, ".paperclip", ".env");
  const envEntries = fs.existsSync(envPath)
    ? parseEnvFile(fs.readFileSync(envPath, "utf8"))
    : {};
  const port = Number(config?.server?.port);
  return {
    configPath,
    envPath,
    host: typeof config?.server?.host === "string" ? config.server.host : null,
    port: Number.isInteger(port) && port > 0 ? port : null,
    instanceId: envEntries.PAPERCLIP_INSTANCE_ID || null,
    homeDir: envEntries.PAPERCLIP_HOME || null,
  };
}

function loopbackOnly(host) {
  if (host && LOOPBACK_HOSTS.has(host)) return host;
  if (host) {
    console.warn(
      `[cosgral-workspace] refusing non-loopback host ${host}; using ${DEFAULT_HOST}`
    );
  }
  return DEFAULT_HOST;
}

function resolveBackendTarget({ repoRoot, env = process.env }) {
  const worktree = readWorktreeInstance(repoRoot);
  const host = loopbackOnly(env.COSGRAL_HOST || env.HOST || worktree?.host || DEFAULT_HOST);
  const envPort = Number(env.COSGRAL_PORT || env.PORT);
  const port =
    Number.isInteger(envPort) && envPort > 0
      ? envPort
      : worktree?.port ?? DEFAULT_PORT;
  let dataHome = null;
  if (!worktree) {
    const explicit = env.PAPERCLIP_HOME || env.COSGRAL_DATA;
    dataHome = explicit
      ? path.resolve(explicit)
      : path.resolve(repoRoot, "..", "work", "cosgral-data");
  }
  return { repoRoot, host, port, worktree, dataHome };
}

// Inherited instance pointers would make the server attach to another
// instance; the repo-local .paperclip/.env must decide in worktree mode.
const INSTANCE_ENV_KEYS = [
  "PAPERCLIP_HOME",
  "PAPERCLIP_INSTANCE_ID",
  "PAPERCLIP_CONFIG",
  "PAPERCLIP_CONTEXT",
  "PAPERCLIP_IN_WORKTREE",
  "PAPERCLIP_WORKTREE_NAME",
  "PAPERCLIP_AGENT_JWT_SECRET",
  "PAPERCLIP_TOOL_ACTION_SIGNING_SECRET",
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
];

function buildBackendEnv(target, baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const key of INSTANCE_ENV_KEYS) delete env[key];
  env.HOST = target.host;
  env.PORT = String(target.port);
  env.PAPERCLIP_API_URL = `http://${target.host}:${target.port}`;
  env.PAPERCLIP_MIGRATION_AUTO_APPLY = "true";
  env.PAPERCLIP_MIGRATION_PROMPT = "never";
  env.SERVE_UI = env.SERVE_UI || "true";
  if (target.worktree) {
    env.PAPERCLIP_CONFIG = target.worktree.configPath;
  } else {
    env.PAPERCLIP_HOME = target.dataHome;
  }
  return env;
}

function resolveNodeBinary(env) {
  if (env.COSGRAL_NODE) return env.COSGRAL_NODE;
  return process.platform === "win32" ? "node.exe" : "node";
}

// An external node.exe cannot read files inside app.asar; electron-builder
// unpacks backend-entry.mjs next to it (build.asarUnpack).
function unpackedPath(filePath) {
  const marker = `${path.sep}app.asar${path.sep}`;
  return filePath.includes(marker)
    ? filePath.replace(marker, `${path.sep}app.asar.unpacked${path.sep}`)
    : filePath;
}

function pickSpawnCommand(repoRoot, env = process.env) {
  const serverDir = path.join(repoRoot, "server");
  const node = resolveNodeBinary(env);
  const entryWrapper = unpackedPath(path.join(__dirname, "backend-entry.mjs"));
  const distEntry = path.join(serverDir, "dist", "index.js");
  const tsxCli = path.join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");
  const sourceEntry = path.join(serverDir, "src", "index.ts");

  if (env.COSGRAL_BACKEND_MODE !== "source" && fs.existsSync(distEntry)) {
    return {
      label: "node server/dist",
      command: node,
      args: [entryWrapper, distEntry],
      cwd: serverDir,
      shell: false,
    };
  }

  if (fs.existsSync(tsxCli)) {
    // Same as `pnpm --filter @paperclipai/server dev` without pnpm/cmd.exe.
    return {
      label: "node tsx server/src",
      command: node,
      args: [tsxCli, entryWrapper, sourceEntry],
      cwd: serverDir,
      shell: false,
    };
  }

  return {
    label: "pnpm @paperclipai/server dev",
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: ["--filter", "@paperclipai/server", "dev"],
    cwd: repoRoot,
    shell: process.platform === "win32",
  };
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

async function waitForHealth(url, { timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS, intervalMs = 1000, child } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeHealth(url)) return true;
    if (child && child.exitCode !== null) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function writeLog(line) {
  if (logStream) logStream.write(`${new Date().toISOString()} ${line}\n`);
}

function forward(stream, sink) {
  stream?.on("data", (buf) => {
    for (const raw of String(buf).split(/\r?\n/)) {
      const line = raw.trimEnd();
      if (!line) continue;
      sink(`[backend] ${line}`);
      writeLog(line);
    }
  });
}

function spawnBackend(target, { logFile } = {}) {
  const pick = pickSpawnCommand(target.repoRoot);
  const env = buildBackendEnv(target);

  if (logFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    logStream = fs.createWriteStream(logFile, { flags: "a" });
  }

  const banner = [
    `[cosgral-workspace] starting backend via ${pick.label} (cwd=${pick.cwd})`,
    target.worktree
      ? `[cosgral-workspace] instance config ${target.worktree.configPath}`
      : `[cosgral-workspace] PAPERCLIP_HOME=${target.dataHome}`,
  ];
  for (const line of banner) {
    console.log(line);
    writeLog(line);
  }

  const child = spawn(pick.command, pick.args, {
    cwd: pick.cwd,
    env,
    // IPC lets us ask the server for an ordered shutdown on Windows,
    // where Node cannot deliver SIGTERM to another process.
    stdio: pick.shell ? ["ignore", "pipe", "pipe"] : ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
    shell: pick.shell,
  });

  forward(child.stdout, console.log);
  forward(child.stderr, console.error);
  child.on("exit", (code, signal) => {
    const line = `[cosgral-workspace] backend exited code=${code} signal=${signal || ""}`;
    console.log(line);
    writeLog(line);
    if (backendChild === child) {
      backendChild = null;
      startedByUs = false;
    }
  });
  child.on("error", (err) => {
    const line = `[cosgral-workspace] backend spawn error: ${err.message}`;
    console.error(line);
    writeLog(line);
  });

  backendChild = child;
  startedByUs = true;
  return child;
}

function forceKill(pid) {
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

/**
 * Ordered shutdown (server stops embedded Postgres cleanly), then a forced
 * tree kill if it does not exit within the grace period.
 */
function stopBackend({ graceMs = SHUTDOWN_GRACE_MS } = {}) {
  if (!backendChild || !startedByUs) return Promise.resolve();
  const child = backendChild;
  const pid = child.pid;
  backendChild = null;
  startedByUs = false;
  if (!pid || child.exitCode !== null) return Promise.resolve();

  console.log(`[cosgral-workspace] stopping backend pid=${pid}`);
  writeLog(`[cosgral-workspace] stopping backend pid=${pid}`);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      writeLog(`[cosgral-workspace] backend did not exit in ${graceMs}ms; killing tree`);
      forceKill(pid);
      resolve();
    }, graceMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      if (child.connected) {
        child.send({ type: "cosgral:shutdown" });
      } else if (process.platform !== "win32") {
        child.kill("SIGTERM");
      } else {
        clearTimeout(timer);
        forceKill(pid);
        resolve();
      }
    } catch {
      clearTimeout(timer);
      forceKill(pid);
      resolve();
    }
  });
}

/**
 * Ensure the loopback API (+ embedded DB via server) is up.
 * Skips spawn when already healthy or COSGRAL_SKIP_BACKEND=1.
 */
async function ensureBackend({ logFile } = {}) {
  const repoRoot = resolveRepoRoot();
  const target = resolveBackendTarget({ repoRoot });
  const url = healthUrl(target.host, target.port);
  const baseUrl = `http://${target.host}:${target.port}`;
  const result = { target, healthUrl: url, baseUrl };

  if (
    process.env.COSGRAL_SKIP_BACKEND === "1" ||
    process.env.COSGRAL_SKIP_BACKEND === "true"
  ) {
    console.log("[cosgral-workspace] COSGRAL_SKIP_BACKEND set — not spawning");
    return { ...result, ok: true, spawned: false, skipped: true };
  }

  if (await probeHealth(url)) {
    console.log(`[cosgral-workspace] backend already up at ${url}`);
    return { ...result, ok: true, spawned: false };
  }

  if (!fs.existsSync(path.join(repoRoot, "package.json"))) {
    console.error(
      `[cosgral-workspace] repo missing at ${repoRoot} — set COSGRAL_REPO`
    );
    return { ...result, ok: false, spawned: false, error: "repo_missing" };
  }
  if (!fs.existsSync(path.join(repoRoot, "node_modules"))) {
    console.error(
      `[cosgral-workspace] node_modules missing in ${repoRoot} — run pnpm install`
    );
    return { ...result, ok: false, spawned: false, error: "deps_missing" };
  }

  if (target.dataHome) {
    try {
      fs.mkdirSync(target.dataHome, { recursive: true });
    } catch (err) {
      console.error(`[cosgral-workspace] cannot create data home: ${err.message}`);
    }
  }

  const child = spawnBackend(target, { logFile });
  const timeoutMs = Number(process.env.COSGRAL_HEALTH_TIMEOUT_MS) || DEFAULT_HEALTH_TIMEOUT_MS;
  const ready = await waitForHealth(url, { timeoutMs, child });
  if (!ready) {
    const error = child.exitCode !== null ? "backend_exited" : "health_timeout";
    console.error(`[cosgral-workspace] backend not healthy (${error}): ${url}`);
    return { ...result, ok: false, spawned: true, error };
  }
  console.log(`[cosgral-workspace] backend ready at ${url}`);
  writeLog(`[cosgral-workspace] backend ready at ${url}`);
  return { ...result, ok: true, spawned: true };
}

module.exports = {
  ensureBackend,
  stopBackend,
  healthUrl,
  resolveRepoRoot,
  readWorktreeInstance,
  resolveBackendTarget,
  buildBackendEnv,
  pickSpawnCommand,
  unpackedPath,
};
