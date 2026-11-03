import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { execute } from "./execute.js";
import { resolveManagedCodexHomeDir } from "./codex-home.js";
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });

it.each(["worker", "coordinator"])("confines the actual Codex CLI launch without a model (%s)", async role => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cosgral8-adapter-")); roots.push(root);
  const bin = path.join(root, "bin"), cwd = path.join(root, "workspace"), selected = path.join(root, "selected-home");
  await Promise.all([bin, selected].map(dir => fs.mkdir(dir)));
  const repo = path.join(root, "repo"); await fs.mkdir(repo);
  const git = (...args: string[]) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
  git("init"); await fs.writeFile(path.join(repo, "tracked.txt"), "tracked");
  git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "fixture");
  git("worktree", "add", "-b", "own", cwd);
  await fs.writeFile(path.join(cwd, "staged.txt"), "own-staged");
  execFileSync("git", ["-C", cwd, "add", "staged.txt"], { stdio: "pipe" });
  await fs.writeFile(path.join(repo, ".env"), "synthetic-private");
  const sibling = path.join(root, "sibling");
  git("worktree", "add", "-b", "other", sibling);
  await fs.writeFile(path.join(sibling, "other-agent.txt"), "synthetic-other-agent-private");
  execFileSync("git", ["-C", sibling, "add", "."], { stdio: "pipe" });
  execFileSync("git", ["-C", sibling, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "other fixture"], { stdio: "pipe" });
  const foreignBlob = execFileSync("git", ["-C", sibling, "rev-parse", "HEAD:other-agent.txt"], { encoding: "utf8" }).trim();
  await fs.writeFile(path.join(selected, "config.toml"), "# operator config must not reach the process\n");
  await fs.writeFile(path.join(selected, "other-agent-credential"), "synthetic-canary");
  const fake = `#!${process.execPath}
const fs = require('fs');
if(process.argv.includes('--version')) { console.log('codex-cli 0.160.0'); process.exit(0); }
if(process.env.OTHER_AGENT_SECRET) process.exit(31);
try { fs.readFileSync(${JSON.stringify(path.join(selected, "other-agent-credential"))}); process.exit(32); } catch(e) {}
fs.writeFileSync(process.env.TMPDIR + '/.sandbox-init', 'ok');
if (!process.env.TMPDIR.startsWith(process.env.HOME + '/')) process.exit(36);
const cp = require('child_process');
cp.execFileSync('git', ['status', '--porcelain'], {stdio:'pipe'});
cp.execFileSync('git', ['show', 'HEAD:tracked.txt'], {stdio:'pipe'});
if(cp.execFileSync('git', ['show', ':staged.txt'], {encoding:'utf8'}) !== 'own-staged') process.exit(40);
try { cp.execFileSync('git', ['cat-file', '-e', ${JSON.stringify(foreignBlob)}], {stdio:'pipe'}); process.exit(39); } catch(e) {}

for (const hidden of ${JSON.stringify([path.join(root, "repo", ".env"), path.join(root, "repo", ".git", "config"), path.join(root, "repo", ".git", "worktrees")])}) {
  try { fs.statSync(hidden); process.exit(37); } catch(e) {}
}
try { fs.writeFileSync(cp.execFileSync('git',['rev-parse','--absolute-git-dir'],{encoding:'utf8'}).trim() + '/index.lock','bad'); process.exit(38); } catch(e) {}
// Codex's nested sandbox mounts protected metadata even when absent.
// Exercise that mount behavior under the real outer RO/RW boundary.
cp.execFileSync('bwrap', ['--die-with-parent', '--bind', '/', '/',
  ...['.agents', '.codex', '.aws'].flatMap(name => ['--tmpfs', process.cwd() + '/' + name,
    '--remount-ro', process.cwd() + '/' + name]),
  '--', '/bin/true'], {stdio:'pipe'});
const args = process.argv.slice(2);
if(args.includes('--yolo') || args.includes('--dangerously-bypass-approvals-and-sandbox')) process.exit(33);
if(!args.includes(${JSON.stringify("workspace-write")})) process.exit(34);
let wrote = false;
try { fs.writeFileSync('result.txt','own'); wrote = true; } catch(e) {}
if(wrote !== ${role === "worker"}) process.exit(35);
console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-thread'}));
console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:0,output_tokens:0}}));
`;
  await fs.writeFile(path.join(bin, "codex"), fake, { mode: 0o755 });
  vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
  vi.stubEnv("PAPERCLIP_HOME", path.join(root, "paperclip"));
  vi.stubEnv("CODEX_HOME", selected);
  vi.stubEnv("OTHER_AGENT_SECRET", "synthetic-canary");
  const result = await execute({
    runId: `fixture-${role}`, agent: { id: "own-agent", companyId: "own-company", name: "Fixture", adapterType: "codex_local", adapterConfig: {} },
    runtime: { sessionId: null, sessionParams: null, sessionDisplayId: null, taskKey: null },
    config: { cosgralExecutionRole: role, engine: "cli", cwd, env: { CODEX_HOME: selected, OPENAI_API_KEY: "synthetic-provider-key" },
      paperclipRuntimeSkills: [], dangerouslyBypassApprovalsAndSandbox: true, extraArgs: ["--yolo"], timeoutSec: 10 },
    context: {}, onLog: async () => {},
  });
  expect(result.errorMessage).toBeFalsy();
  expect(result.exitCode).toBe(0);
  if(role === "worker") expect(await fs.readFile(path.join(cwd, "result.txt"), "utf8")).toBe("own");
  await expect(fs.access(path.join(resolveManagedCodexHomeDir(process.env, "own-company"),
    "cosgral-runtimes", "own-agent", `fixture-${role}`))).rejects.toThrow();
}, 30000);
