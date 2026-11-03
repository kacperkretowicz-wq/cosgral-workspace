import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { realizeExecutionWorkspace, cleanupExecutionWorkspaceArtifacts } from "../workspace-runtime.js";
import { runChildProcess } from "@paperclipai/adapter-utils/server-utils";
import { protectConversationConfig } from "./project-conversation-execution.js";

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });

it("isolates concurrent task branches, confines writes/reads and safely removes only finished worktrees", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cosgral8-isolation-")); roots.push(root);
  const repo = path.join(root, "repo"), other = path.join(root, "other-agent"), home = path.join(root, "own-home");
  await Promise.all([repo, other, home].map(dir => fs.mkdir(dir)));
  await fs.writeFile(path.join(other, "credential"), "synthetic-canary");
  const git = (args: string[]) => exec("git", args, { cwd: repo });
  await git(["init", "-q"]);
  // Only a disposable fixture repository receives an initial commit.
  await fs.writeFile(path.join(repo, "source.txt"), "base");
  await git(["add", "source.txt"]);
  await git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"]);
  const create = (id: string) => realizeExecutionWorkspace({
    base: { baseCwd: repo, source: "project_primary", projectId: "p", workspaceId: "ws", repoUrl: null, repoRef: null },
    issue: { id, identifier: id, title: "Task" }, agent: { id: "worker", companyId: "c", name: "Worker" },
    config: protectConversationConfig({}, "worker"),
  });
  const [a, b] = await Promise.all([create("task-a"), create("task-b")]);
  expect(a.branchName).toBe("cosgral/task-a/worker");
  expect(b.branchName).toBe("cosgral/task-b/worker");
  expect(a.cwd).not.toBe(b.cwd);
  const run = (cwd: string, access: "ro" | "rw", code: string) => runChildProcess("fixture", process.execPath, ["-e", code], {
    cwd, env: { PATH: process.env.PATH ?? "/usr/bin" }, timeoutSec: 10, graceSec: 1, onLog: async () => {},
    localProcessSandbox: { workspaceDir: cwd, filesystemScope: "workspace", workspaceAccess: access,
      homeDir: home, managedPaths: [{ path: home, access: "rw" }], inheritEnvironment: false },
  });
  const probe = `const fs=require('fs');
    for(const p of ${JSON.stringify([other, b.cwd])}) { try { fs.readdirSync(p); process.exit(11); } catch(e) { if(e.code!=='ENOENT' && e.code!=='EACCES') throw e; } }
    if(process.env.COSGRAL_TEST_OTHER_TOKEN) process.exit(12);
    fs.writeFileSync('result.txt','own-result');`;
  const prior = process.env.COSGRAL_TEST_OTHER_TOKEN;
  process.env.COSGRAL_TEST_OTHER_TOKEN = "synthetic-canary";
  try { const result = await run(a.cwd, "rw", probe); expect(result.stderr).toBe(""); expect(result.exitCode).toBe(0); }
  finally { if(prior === undefined) delete process.env.COSGRAL_TEST_OTHER_TOKEN; else process.env.COSGRAL_TEST_OTHER_TOKEN = prior; }
  expect(await fs.readFile(path.join(a.cwd, "result.txt"), "utf8")).toBe("own-result");
  await expect(fs.access(path.join(b.cwd, "result.txt"))).rejects.toThrow();
  expect((await run(repo, "ro", "require('fs').writeFileSync('forbidden.txt','x')")).exitCode).not.toBe(0);
  await expect(fs.access(path.join(repo, "forbidden.txt"))).rejects.toThrow();
  // Preserve dirty work. Terminal cleanup is used only after delivery/retention gates.
  await fs.rm(path.join(a.cwd, "result.txt"));
  const removed = await cleanupExecutionWorkspaceArtifacts({
    workspace: { id: "fixture-a", companyId: "c", cwd: a.cwd, providerType: "git_worktree", providerRef: a.cwd,
      branchName: a.branchName, repoUrl: null, baseRef: null, projectId: "p", projectWorkspaceId: "ws", sourceIssueId: "task-a",
      metadata: { createdByRuntime: true, gitBranchOwnershipVersion: 1 } },
    projectWorkspace: { cwd: repo, cleanupCommand: null }, runCleanupCommands: false,
  });
  expect(removed.warnings).toEqual([]);
  await expect(fs.access(a.cwd)).rejects.toThrow();
  expect(await fs.readFile(path.join(b.cwd, "source.txt"), "utf8")).toBe("base");
  expect(await fs.readFile(path.join(repo, "source.txt"), "utf8")).toBe("base");
}, 30000);
