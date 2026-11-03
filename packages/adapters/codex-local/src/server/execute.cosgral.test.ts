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
  await Promise.all([bin, cwd, selected].map(dir => fs.mkdir(dir)));
  await fs.writeFile(path.join(selected, "config.toml"), "# operator config must not reach the process\n");
  await fs.writeFile(path.join(selected, "other-agent-credential"), "synthetic-canary");
  const fake = `#!${process.execPath}
const fs = require('fs');
if(process.argv.includes('--version')) { console.log('codex-cli 0.160.0'); process.exit(0); }
if(process.env.OTHER_AGENT_SECRET) process.exit(31);
try { fs.readFileSync(${JSON.stringify(path.join(selected, "other-agent-credential"))}); process.exit(32); } catch(e) {}
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
