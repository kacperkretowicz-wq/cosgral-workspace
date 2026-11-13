// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentApproval,
  APPROVAL_RULE_KINDS,
  APPROVAL_RULES_NEVER_COVER,
  isApprovalRule,
} from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ApprovalRulesStore,
  commandMatchesPrefix,
  commandPrefixProblem,
  commonFolder,
  folderProblem,
  pathInside,
  ruleFromApproval,
  ruleMatches,
} from "./approval-rules";

const WORK = process.platform === "win32" ? "C:\\work\\app" : "/work/app";
const sub = (...parts: string[]) => join(WORK, ...parts);

function approval(overrides: Partial<AgentApproval> = {}): AgentApproval {
  return {
    requestId: 1,
    botId: "chief",
    threadId: "thread",
    turnId: "turn",
    kind: "command",
    command: "git status --porcelain",
    cwd: WORK,
    reason: null,
    grantRoot: null,
    permissions: null,
    ...overrides,
  };
}

describe("commands", () => {
  it("matches whole words only", () => {
    expect(commandMatchesPrefix("git status", "git status")).toBe(true);
    expect(commandMatchesPrefix("git status --short", "git status")).toBe(true);
    expect(commandMatchesPrefix("git statusx", "git status")).toBe(false);
    expect(commandMatchesPrefix("git push", "git status")).toBe(false);
  });

  it("never matches a command that chains, redirects or substitutes", () => {
    for (const command of [
      "git status; rm -r x",
      "git status && rm x",
      "git status | clip",
      "git status > out.txt",
      "git status `whoami`",
      "git status $(whoami)",
      "git status\nrm x",
    ]) {
      expect(commandMatchesPrefix(command, "git status")).toBe(false);
    }
  });

  it("refuses to save a bare shell or interpreter, or a chained prefix", () => {
    expect(commandPrefixProblem("powershell")).toMatch(/runs anything/);
    expect(commandPrefixProblem('"C:\\Windows\\System32\\cmd.exe"')).toMatch(/runs anything/);
    expect(commandPrefixProblem("node")).toMatch(/runs anything/);
    expect(commandPrefixProblem("git status; rm x")).toMatch(/cannot chain/);
    expect(commandPrefixProblem("g")).toMatch(/at least/);
    expect(commandPrefixProblem('"C:Program FilesGit')).toMatch(/inside quotes/);
    expect(commandPrefixProblem('"C:Program FilesGit\bingit.exe" status')).toBeNull();
    expect(commandPrefixProblem("git status")).toBeNull();
  });
});

describe("folders", () => {
  it("knows what is inside a folder and resolves ..", () => {
    expect(pathInside(WORK, WORK)).toBe(true);
    expect(pathInside(WORK, sub("src", "a.ts"))).toBe(true);
    expect(pathInside(WORK, join(WORK, "..", "other"))).toBe(false);
    expect(pathInside(WORK, sub("..", "app2"))).toBe(false);
    expect(pathInside("relative", "relative/x")).toBe(false);
  });

  it("does not accept a whole drive as a folder", () => {
    const root = process.platform === "win32" ? "C:\\" : "/";
    expect(folderProblem(root)).toMatch(/whole drive/);
    expect(folderProblem("not/absolute")).toMatch(/full folder path/);
    expect(folderProblem(WORK)).toBeNull();
  });

  it("finds the common folder of several paths", () => {
    expect(commonFolder([sub("src", "a.ts"), sub("src", "b", "c.ts")])).toBe(sub("src"));
    expect(commonFolder([])).toBeNull();
  });
});

describe("making a rule from an open approval", () => {
  it("defaults a command rule to the whole command and accepts a shorter set of words", () => {
    expect(ruleFromApproval(approval(), {})).toEqual({
      ok: true,
      rule: { kind: "command", prefix: "git status --porcelain" },
    });
    expect(ruleFromApproval(approval(), { prefix: "git status" })).toEqual({
      ok: true,
      rule: { kind: "command", prefix: "git status" },
    });
  });

  it("refuses a scope that does not cover the open command, a single loose word or a chained command", () => {
    expect(ruleFromApproval(approval(), { prefix: "git push" })).toMatchObject({ ok: false });
    expect(ruleFromApproval(approval(), { prefix: "git" })).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/two words/),
    });
    expect(ruleFromApproval(approval({ command: "git status; rm x" }), {})).toMatchObject({ ok: false });
    expect(ruleFromApproval(approval({ command: "powershell" }), {})).toMatchObject({ ok: false });
  });

  it("makes a file-change rule from the folder the request names, and only from that", () => {
    const change = approval({ kind: "file-change", command: null, grantRoot: sub("src") });
    expect(ruleFromApproval(change, {})).toEqual({ ok: true, rule: { kind: "file-change", folder: sub("src") } });
    expect(ruleFromApproval(change, { folder: WORK })).toMatchObject({ ok: true });
    expect(ruleFromApproval(change, { folder: sub("docs") })).toMatchObject({ ok: false });
    expect(ruleFromApproval(approval({ kind: "file-change", command: null, cwd: null }), {})).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/does not say which folder/),
    });
  });

  it("makes a permissions rule, never for network and never smaller than the request", () => {
    const request = approval({
      kind: "permissions",
      command: null,
      permissions: { fileSystem: { read: [sub("src")], write: [sub("src", "out")] }, network: false },
    });
    expect(ruleFromApproval(request, {})).toEqual({
      ok: true,
      rule: { kind: "permissions", folder: sub("src"), access: "write" },
    });
    expect(ruleFromApproval(request, { access: "read" })).toMatchObject({ ok: false });
    expect(ruleFromApproval(request, { folder: sub("src", "out") })).toMatchObject({ ok: false });
    const withNetwork = approval({
      kind: "permissions",
      command: null,
      permissions: { fileSystem: { read: [sub("src")], write: [] }, network: true },
    });
    expect(ruleFromApproval(withNetwork, {})).toMatchObject({ ok: false, reason: expect.stringMatching(/Network/) });
  });

  it("can never make a rule for agent eyes", () => {
    expect(ruleFromApproval(approval({ kind: "screen" }), {})).toMatchObject({ ok: false });
    expect(ruleFromApproval(approval({ kind: "camera" }), {})).toMatchObject({ ok: false });
  });

  it("only knows the three provider kinds, and lists what rules never cover", () => {
    expect([...APPROVAL_RULE_KINDS]).toEqual(["command", "file-change", "permissions"]);
    expect(APPROVAL_RULES_NEVER_COVER).toEqual(
      expect.arrayContaining([
        "Computer Use",
        "the Vault",
        "payments",
        "Mobile Connect pairing",
        "taking over the browser",
      ]),
    );
  });
});

describe("matching", () => {
  const command = {
    id: "r",
    botId: "chief",
    createdAt: "",
    lastUsedAt: null,
    uses: 0,
    kind: "command",
    prefix: "git status",
  } as const;

  it("is per agent and per kind", () => {
    expect(ruleMatches(command, approval())).toBe(true);
    expect(ruleMatches(command, approval({ botId: "other" }))).toBe(false);
    expect(ruleMatches(command, approval({ kind: "file-change" }))).toBe(false);
  });

  it("file-change matches inside the folder and never without a folder", () => {
    const rule = {
      id: "r",
      botId: "chief",
      createdAt: "",
      lastUsedAt: null,
      uses: 0,
      kind: "file-change",
      folder: WORK,
    } as const;
    expect(ruleMatches(rule, approval({ kind: "file-change", command: null, grantRoot: sub("src") }))).toBe(true);
    expect(ruleMatches(rule, approval({ kind: "file-change", command: null, grantRoot: join(WORK, "..", "x") }))).toBe(
      false,
    );
    expect(ruleMatches(rule, approval({ kind: "file-change", command: null, grantRoot: null, cwd: null }))).toBe(false);
  });

  it("permissions needs write access for writes, stays inside the folder and never covers network", () => {
    const read = {
      id: "r",
      botId: "chief",
      createdAt: "",
      lastUsedAt: null,
      uses: 0,
      kind: "permissions",
      folder: WORK,
      access: "read",
    } as const;
    const write = { ...read, access: "write" } as const;
    const wants = (readPaths: string[], writePaths: string[], network = false) =>
      approval({
        kind: "permissions",
        command: null,
        permissions: { fileSystem: { read: readPaths, write: writePaths }, network },
      });
    expect(ruleMatches(read, wants([sub("a")], []))).toBe(true);
    expect(ruleMatches(read, wants([], [sub("a")]))).toBe(false);
    expect(ruleMatches(write, wants([sub("a")], [sub("b")]))).toBe(true);
    expect(ruleMatches(write, wants([join(WORK, "..", "x")], []))).toBe(false);
    expect(ruleMatches(write, wants([sub("a")], [], true))).toBe(false);
    expect(ruleMatches(write, wants([], []))).toBe(false);
  });
});

describe("ApprovalRulesStore", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "cosgral-rules-"));
    file = join(dir, "approval-rules.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("saves a rule, keeps it after a restart, counts its uses and revokes it", () => {
    const changes: number[] = [];
    const store = new ApprovalRulesStore({ filePath: file, onChange: (rules) => changes.push(rules.length) });
    const rule = store.addFromApproval(approval(), { prefix: "git status" });
    expect(isApprovalRule(rule)).toBe(true);
    expect(changes).toEqual([1]);

    const again = new ApprovalRulesStore({ filePath: file });
    expect(again.list()).toHaveLength(1);
    expect(again.match(approval())?.uses).toBe(1);
    expect(again.match(approval({ command: "git push" }))).toBeNull();
    expect(new ApprovalRulesStore({ filePath: file }).list()[0]?.uses).toBe(1);

    expect(again.revoke(rule.id)).toEqual([]);
    expect(new ApprovalRulesStore({ filePath: file }).list()).toEqual([]);
  });

  it("keeps the same rule once, lists per agent and drops an agent's rules with it", () => {
    const store = new ApprovalRulesStore({ filePath: file });
    const first = store.addFromApproval(approval(), { prefix: "git status" });
    expect(store.addFromApproval(approval(), { prefix: "git status" }).id).toBe(first.id);
    store.addFromApproval(approval({ botId: "other" }), { prefix: "git status" });
    expect(store.list("chief")).toHaveLength(1);
    expect(store.list()).toHaveLength(2);
    store.removeForBot("chief");
    expect(store.list().map((rule) => rule.botId)).toEqual(["other"]);
  });

  it("throws the reason when a rule cannot be made, and saves nothing", () => {
    const store = new ApprovalRulesStore({ filePath: file });
    expect(() => store.addFromApproval(approval({ command: "powershell" }), {})).toThrow(/runs anything/);
    expect(() => store.addFromApproval(approval({ kind: "screen" }), {})).toThrow(/never be allowed/);
    expect(store.list()).toEqual([]);
  });

  it("ignores a broken or foreign file and keeps only valid rules", async () => {
    await writeFile(file, "not json", "utf8");
    expect(new ApprovalRulesStore({ filePath: file }).list()).toEqual([]);
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        rules: [
          { kind: "command" },
          { id: "a", botId: "b", createdAt: "", lastUsedAt: null, uses: 0, kind: "command", prefix: "git status" },
        ],
      }),
      "utf8",
    );
    expect(new ApprovalRulesStore({ filePath: file }).list()).toHaveLength(1);
    await writeFile(file, JSON.stringify({ version: 99, rules: [] }), "utf8");
    expect(new ApprovalRulesStore({ filePath: file }).list()).toEqual([]);
    expect(JSON.parse(await readFile(file, "utf8")).version).toBe(99);
  });
});
