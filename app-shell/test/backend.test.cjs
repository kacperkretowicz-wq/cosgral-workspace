"use strict";

// Run: node --test app-shell/test
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  readWorktreeInstance,
  resolveBackendTarget,
  buildBackendEnv,
  pickSpawnCommand,
} = require("../src/backend");

function makeRepo({ config, env, tsx = true, dist = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cosgral shell "));
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.mkdirSync(path.join(root, "server", "src"), { recursive: true });
  if (tsx) {
    const tsxDir = path.join(root, "server", "node_modules", "tsx", "dist");
    fs.mkdirSync(tsxDir, { recursive: true });
    fs.writeFileSync(path.join(tsxDir, "cli.mjs"), "");
  }
  if (dist) {
    fs.mkdirSync(path.join(root, "server", "dist"), { recursive: true });
    fs.writeFileSync(path.join(root, "server", "dist", "index.js"), "");
  }
  if (config) {
    fs.mkdirSync(path.join(root, ".paperclip"), { recursive: true });
    fs.writeFileSync(path.join(root, ".paperclip", "config.json"), JSON.stringify(config));
  }
  if (env) {
    fs.mkdirSync(path.join(root, ".paperclip"), { recursive: true });
    fs.writeFileSync(path.join(root, ".paperclip", ".env"), env);
  }
  return root;
}

test("readWorktreeInstance returns null without repo-local config", () => {
  const repo = makeRepo();
  assert.equal(readWorktreeInstance(repo), null);
});

test("readWorktreeInstance reads port, host and instance id", () => {
  const repo = makeRepo({
    config: { server: { host: "127.0.0.1", port: 3110 } },
    env: [
      "# generated",
      'PAPERCLIP_INSTANCE_ID="backend"',
      'PAPERCLIP_HOME="C:\\\\data\\\\backend"',
      "",
    ].join("\n"),
  });
  const instance = readWorktreeInstance(repo);
  assert.equal(instance.port, 3110);
  assert.equal(instance.host, "127.0.0.1");
  assert.equal(instance.instanceId, "backend");
  assert.equal(instance.homeDir, "C:\\data\\backend");
  assert.equal(instance.configPath, path.join(repo, ".paperclip", "config.json"));
});

test("resolveBackendTarget: env port beats worktree config, worktree beats default", () => {
  const repo = makeRepo({ config: { server: { host: "127.0.0.1", port: 3120 } } });
  assert.equal(resolveBackendTarget({ repoRoot: repo, env: {} }).port, 3120);
  assert.equal(resolveBackendTarget({ repoRoot: repo, env: { COSGRAL_PORT: "3999" } }).port, 3999);
  const plain = makeRepo();
  assert.equal(resolveBackendTarget({ repoRoot: plain, env: {} }).port, 3100);
});

test("resolveBackendTarget keeps the server on loopback", () => {
  const repo = makeRepo({ config: { server: { host: "0.0.0.0", port: 3110 } } });
  assert.equal(resolveBackendTarget({ repoRoot: repo, env: {} }).host, "127.0.0.1");
  assert.equal(resolveBackendTarget({ repoRoot: repo, env: { HOST: "192.168.1.5" } }).host, "127.0.0.1");
});

test("buildBackendEnv in worktree mode drops inherited instance vars and pins the config", () => {
  const repo = makeRepo({ config: { server: { host: "127.0.0.1", port: 3110 } } });
  const target = resolveBackendTarget({ repoRoot: repo, env: {} });
  const env = buildBackendEnv(target, {
    PATH: "x",
    PAPERCLIP_HOME: "C:\\other",
    PAPERCLIP_INSTANCE_ID: "other",
    DATABASE_URL: "postgres://elsewhere",
  });
  assert.equal(env.PATH, "x");
  assert.equal(env.PAPERCLIP_HOME, undefined);
  assert.equal(env.PAPERCLIP_INSTANCE_ID, undefined);
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.PAPERCLIP_CONFIG, path.join(repo, ".paperclip", "config.json"));
  assert.equal(env.PORT, "3110");
  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.SERVE_UI, "true");
});

test("buildBackendEnv without worktree config sets PAPERCLIP_HOME", () => {
  const repo = makeRepo();
  const target = resolveBackendTarget({ repoRoot: repo, env: { COSGRAL_DATA: "D:\\cosgral" } });
  const env = buildBackendEnv(target, {});
  assert.equal(env.PAPERCLIP_HOME, path.resolve("D:\\cosgral"));
});

test("pickSpawnCommand runs server sources through tsx with the chosen node", () => {
  const repo = makeRepo();
  const pick = pickSpawnCommand(repo, { COSGRAL_NODE: "C:\\tools\\node\\node.exe" });
  assert.equal(pick.command, "C:\\tools\\node\\node.exe");
  assert.equal(pick.cwd, path.join(repo, "server"));
  assert.equal(pick.args[0], path.join(repo, "server", "node_modules", "tsx", "dist", "cli.mjs"));
  assert.ok(pick.args.includes(path.join(repo, "server", "src", "index.ts")));
  assert.equal(pick.shell, false);
});

test("pickSpawnCommand prefers a built server/dist", () => {
  const repo = makeRepo({ dist: true });
  const pick = pickSpawnCommand(repo, {});
  assert.ok(pick.args.includes(path.join(repo, "server", "dist", "index.js")));
});
