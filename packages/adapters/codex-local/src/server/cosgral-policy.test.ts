import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cosgralPolicy, cosgralProcessEnvironment, prepareCosgralReadOnlyCwd } from "./cosgral-policy.js";

import { buildCodexExecArgs } from "./codex-args.js";
describe("COSGRAL enforced CLI permissions", () => {
  it.each(["worker", "coordinator"])("cannot bypass confinement through flags or custom command (%s)", role => {
    const config = cosgralPolicy({ cosgralExecutionRole: role, engine: "acp", command: "/tmp/evil",
      extraArgs: ["--yolo"], dangerouslyBypassSandbox: true, filesystemExtraPaths: ["/"] });
    const { args } = buildCodexExecArgs(config, { resumeSessionId: "existing" });
    expect(args).not.toContain("--yolo");
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args).toContain("workspace-write");
    expect(config.filesystemScope).toBe("workspace");
    expect(config.command).toBe("codex");
    expect(config.engine).toBe("cli");
  });
  it("only delivers own resolved capabilities, excluding server and other-agent credentials", () => {
    expect(cosgralProcessEnvironment({ PATH: "/usr/bin", OTHER_AGENT_TOKEN: "not-for-this-run", DATABASE_URL: "private" },
      { PAPERCLIP_API_KEY: "own-run", CODEX_HOME: "/own" })).toEqual({ PATH: "/usr/bin", PAPERCLIP_API_KEY: "own-run", CODEX_HOME: "/own" });
  });
  it("preserves unrelated adapter behavior", () => {
    const config = { engine: "acp" }; expect(cosgralPolicy(config)).toBe(config);
  });
});

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });

it("prepares missing metadata mounts while preserving repository instructions", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cosgral11-mounts-")); roots.push(cwd);
  await fs.mkdir(path.join(cwd, ".agents"));
  await fs.writeFile(path.join(cwd, ".agents", "instructions"), "keep");
  await prepareCosgralReadOnlyCwd(cwd);
  await prepareCosgralReadOnlyCwd(cwd);
  expect(await fs.readFile(path.join(cwd, ".agents", "instructions"), "utf8")).toBe("keep");
  for (const name of [".codex", ".aws"]) expect(await fs.readdir(path.join(cwd, name))).toEqual([]);
});

it("rejects a repository symlink rather than writing outside its worktree", async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "cosgral11-symlink-")); roots.push(cwd);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "cosgral11-outside-")); roots.push(outside);
  await fs.symlink(outside, path.join(cwd, ".agents"));
  await expect(prepareCosgralReadOnlyCwd(cwd)).rejects.toThrow(/Unsafe.*mount target/);
  expect(await fs.readdir(outside)).toEqual([]);
});
