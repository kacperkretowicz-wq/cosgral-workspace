// @vitest-environment node
// COSGRAL W8-BE1: the pure rules of the access levels on the engine side (spec-w8.md 1A, W8-01…08; Q2, Q3, Q4).
import { type AgentAccess, type AgentApproval, defaultAgentAccess } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import {
  claudeToolRequest,
  cliAccess,
  commandPaths,
  decideApproval,
  decideToolPaths,
  toolPaths,
} from "./access-policy";

const WORK = "C:\\agents\\chief";
const SHARED = "C:\\shared";
const FOLDERS = { workspace: WORK, shared: SHARED };

function access(overrides: Partial<AgentAccess> = {}): AgentAccess {
  return { ...defaultAgentAccess("chief"), ...overrides };
}

function policy(overrides: Partial<AgentAccess> = {}) {
  const value = access(overrides);
  return {
    level: value.level,
    workspace: WORK,
    additionalFolders: value.additionalFolders,
    implicitFolders: [SHARED],
    excludedFolders: value.excludedFolders,
  };
}

function approval(overrides: Partial<AgentApproval> = {}): AgentApproval {
  return {
    requestId: 1,
    botId: "chief",
    threadId: "t",
    turnId: "u",
    kind: "command",
    command: "npm test",
    cwd: WORK,
    reason: null,
    grantRoot: null,
    permissions: null,
    ...overrides,
  };
}

describe("cliAccess: what the CLI is told", () => {
  it("working-folder and ask-first let the CLI write only in the folders; full does not narrow it", () => {
    const folderOnly = cliAccess(access({ additionalFolders: ["D:\\notes"] }), FOLDERS);
    expect(folderOnly.sandbox).toBe("workspace-write");
    expect(folderOnly.approvalPolicy).toBe("on-request");
    expect(folderOnly.runtimeWorkspaceRoots).toEqual([WORK, "D:\\notes", SHARED]);
    expect(folderOnly.sandboxPolicy).toEqual({
      type: "workspaceWrite",
      writableRoots: [WORK, "D:\\notes", SHARED],
      networkAccess: true,
    });
    expect(cliAccess(access({ level: "ask-first" }), FOLDERS).sandbox).toBe("workspace-write");
    const full = cliAccess(access({ level: "full" }), FOLDERS);
    expect(full.sandbox).toBe("danger-full-access");
    expect(full.sandboxPolicy).toEqual({ type: "dangerFullAccess" });
  });

  it("an excluded folder is never one of the roots, and the same folder is not listed twice", () => {
    const result = cliAccess(
      access({ additionalFolders: ["C:\\shared", "D:\\a"], excludedFolders: ["D:\\a"] }),
      FOLDERS,
    );
    expect(result.runtimeWorkspaceRoots).toEqual([WORK, SHARED]);
  });
});

describe("decideApproval: a request of the CLI to go further", () => {
  it("working-folder refuses a file change outside its folders, and says why", () => {
    const decision = decideApproval(policy(), approval({ kind: "file-change", command: null, grantRoot: "D:\\other" }));
    expect(decision).toMatchObject({ verdict: "deny", reason: "outside-folder" });
  });

  it("a file change inside the working folder goes on to the usual card and rules", () => {
    const decision = decideApproval(policy(), approval({ kind: "file-change", grantRoot: `${WORK}\\src` }));
    expect(decision).toEqual({ verdict: "allow" });
  });

  it("ask-first asks for a folder outside, and Always cannot open an excluded one", () => {
    const outside = approval({ kind: "file-change", grantRoot: "D:\\other" });
    expect(decideApproval(policy({ level: "ask-first" }), outside)).toEqual({ verdict: "ask" });
    const excluded = policy({ level: "ask-first", excludedFolders: ["D:\\other"] });
    expect(decideApproval(excluded, outside)).toMatchObject({ verdict: "deny", reason: "excluded" });
  });

  it("an excluded folder is refused at full too (Q3), also inside an added folder", () => {
    const decision = decideApproval(
      policy({ level: "full", additionalFolders: ["D:\\proj"], excludedFolders: ["D:\\proj\\secrets"] }),
      approval({ kind: "file-change", grantRoot: "D:\\proj\\secrets\\keys" }),
    );
    expect(decision).toMatchObject({ verdict: "deny", reason: "excluded" });
  });

  it("full lets any other folder go on to the usual card and rules", () => {
    expect(decideApproval(policy({ level: "full" }), approval({ kind: "file-change", grantRoot: "D:\\x" }))).toEqual({
      verdict: "allow",
    });
  });

  it("a command is judged by its folder and by the full paths it names", () => {
    expect(decideApproval(policy(), approval({ command: "npm test" }))).toEqual({ verdict: "allow" });
    expect(decideApproval(policy(), approval({ command: 'del /q "D:\\other\\old.txt"' }))).toMatchObject({
      verdict: "deny",
      reason: "outside-folder",
    });
    expect(
      decideApproval(policy({ level: "ask-first" }), approval({ command: "copy a.txt D:\\other\\a.txt" })),
    ).toEqual({
      verdict: "ask",
    });
    expect(
      decideApproval(
        policy({ level: "full", excludedFolders: ["D:\\other"] }),
        approval({ command: "type D:\\other\\a.txt" }),
      ),
    ).toMatchObject({ verdict: "deny", reason: "excluded" });
  });

  it("a command that climbs out with `..` cannot be checked: refused at working-folder, asked at ask-first, left alone at full", () => {
    const climbing = approval({ command: "type ..\\..\\other\\a.txt" });
    expect(decideApproval(policy(), climbing)).toMatchObject({ verdict: "deny", reason: "outside-folder" });
    expect(decideApproval(policy({ level: "ask-first" }), climbing)).toEqual({ verdict: "ask" });
    expect(decideApproval(policy({ level: "full" }), climbing)).toEqual({ verdict: "allow" });
    expect(decideApproval(policy(), approval({ command: "git log ...v2" }))).toEqual({ verdict: "allow" });
  });

  it("a request that names no folder at all is refused at working-folder and asked at ask-first", () => {
    const nothing = approval({ kind: "file-change", cwd: null, grantRoot: null, command: null });
    expect(decideApproval(policy(), nothing)).toMatchObject({ verdict: "deny" });
    expect(decideApproval(policy({ level: "ask-first" }), nothing)).toEqual({ verdict: "ask" });
  });

  it("extra permissions: a write outside is refused at working-folder, a read outside is not a write", () => {
    const write = approval({
      kind: "permissions",
      command: null,
      permissions: { fileSystem: { read: [], write: ["D:\\out"] }, network: false },
    });
    expect(decideApproval(policy(), write)).toMatchObject({ verdict: "deny", reason: "outside-folder" });
    const read = approval({
      kind: "permissions",
      command: null,
      permissions: { fileSystem: { read: ["D:\\out"], write: [] }, network: false },
    });
    expect(decideApproval(policy(), read)).toEqual({ verdict: "allow" });
    expect(decideApproval(policy({ excludedFolders: ["D:\\out"] }), read)).toMatchObject({ reason: "excluded" });
  });

  it("when one path is refused and another only asked, the refusal wins", () => {
    const decision = decideApproval(
      policy({ level: "ask-first", excludedFolders: ["D:\\secret"] }),
      approval({ command: "copy D:\\ok\\a D:\\secret\\a" }),
    );
    expect(decision).toMatchObject({ verdict: "deny", reason: "excluded" });
  });
});

describe("commandPaths", () => {
  it("finds drive, quoted, UNC and unix paths and skips switches", () => {
    expect(commandPaths('copy "C:\\Program Files\\a b.txt" D:\\x\\y.txt /q /s')).toEqual([
      "C:\\Program Files\\a b.txt",
      "D:\\x\\y.txt",
    ]);
    expect(commandPaths("type \\\\server\\share\\a.txt")).toEqual(["\\\\server\\share\\a.txt"]);
    expect(commandPaths("rm -rf /home/me/old && ls /c")).toEqual(["/home/me/old"]);
    expect(commandPaths("npm test")).toEqual([]);
  });
});

describe("tools of the program: paths in their arguments", () => {
  it("collects path-like arguments and resolves a relative one against the working folder", () => {
    expect(toolPaths({ path: "..\\..\\other\\a.txt", name: "x" }, WORK)).toEqual(["C:\\other\\a.txt"]);
    expect(toolPaths({ files: ["D:\\a.txt", "notes\\b.txt"], title: "D:\\not-a-key" }, WORK)).toEqual([
      "D:\\a.txt",
      "C:\\agents\\chief\\notes\\b.txt",
    ]);
    expect(toolPaths("D:\\a.txt", WORK)).toEqual([]);
    expect(toolPaths({ nested: { path: "D:\\deep.txt" } }, WORK)).toEqual(["D:\\deep.txt"]);
  });

  it("an excluded folder is refused for every tool, a write outside only at working-folder", () => {
    const excluded = policy({ level: "full", excludedFolders: ["D:\\secret"] });
    expect(decideToolPaths(excluded, "library_add", ["D:\\secret\\a"])).toMatchObject({ reason: "excluded" });
    expect(decideToolPaths(policy(), "library_save_file", ["D:\\out\\a"])).toMatchObject({
      verdict: "deny",
      reason: "outside-folder",
    });
    expect(decideToolPaths(policy(), "library_add", ["D:\\out\\a"])).toEqual({ verdict: "allow" });
    expect(decideToolPaths(policy({ level: "ask-first" }), "library_add", ["D:\\out\\a"])).toEqual({ verdict: "ask" });
    expect(decideToolPaths(policy(), "library_add", [])).toEqual({ verdict: "allow" });
  });
});

describe("claudeToolRequest: the tools of Claude Code as the requests the program already knows", () => {
  it("a file tool becomes a file change with the folder of the file; a read tool a read", () => {
    expect(claudeToolRequest("Write", { file_path: "D:\\a\\b.txt" }, WORK)).toEqual({
      kind: "file-change",
      path: "D:\\a",
      operation: "write",
    });
    expect(claudeToolRequest("Edit", { file_path: "notes\\b.txt" }, WORK)).toMatchObject({
      kind: "file-change",
      path: "C:\\agents\\chief\\notes",
    });
    expect(claudeToolRequest("Read", { file_path: "D:\\a\\b.txt" }, WORK)).toMatchObject({ operation: "read" });
    expect(claudeToolRequest("Bash", { command: "dir D:\\x" }, WORK)).toEqual({
      kind: "command",
      command: "dir D:\\x",
      cwd: WORK,
      operation: "write",
    });
    expect(claudeToolRequest("WebFetch", { url: "https://example.com" }, WORK)).toBeNull();
    expect(claudeToolRequest("mcp__openbot__x", {}, WORK)).toBeNull();
  });
});
