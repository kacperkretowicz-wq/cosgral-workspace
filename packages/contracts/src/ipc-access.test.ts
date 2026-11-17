import { describe, expect, it } from "vitest";
import {
  ACCESS_LIMITS,
  type AccessPolicy,
  type AgentAccess,
  accessDecision,
  accessFolderProblem,
  accessIsRaise,
  accessRaiseCard,
  DEFAULT_ACCESS_LEVEL,
  defaultAgentAccess,
  IPC_CHANNELS,
  isAccessChanged,
  isAccessDenied,
  isAgentAccess,
  isAgentAccessList,
  isSetAccessLevelResult,
  normalizeAccessPath,
  parseAccessAgentInput,
  parseSetAccessFoldersInput,
  parseSetAccessLevelInput,
  pathIsInside,
} from "./ipc";
import { isAgentEvent } from "./ipc-conversation";

const WORK = "C:\\Agents\\chief\\work";
const policy = (patch: Partial<AccessPolicy> = {}): AccessPolicy => ({
  level: "working-folder",
  workspace: WORK,
  additionalFolders: [],
  implicitFolders: ["C:\\Shared"],
  excludedFolders: [],
  ...patch,
});

describe("access contract: paths", () => {
  it("makes paths comparable: separators, dot segments, case on Windows, trailing separator", () => {
    expect(normalizeAccessPath("C:\\Work\\..\\Work/Docs\\")).toBe("c:/work/docs");
    expect(normalizeAccessPath("c:/WORK/./docs")).toBe("c:/work/docs");
    expect(normalizeAccessPath("/home/Me/Docs/")).toBe("/home/Me/Docs");
    expect(normalizeAccessPath("\\\\Server\\Share\\Dir")).toBe("//server/share/dir");
    expect(normalizeAccessPath("C:\\")).toBe("c:/");
    for (const bad of ["", "docs", "..\\x", "C:\\..\\x", "C:", "a\0b", "~/x"])
      expect(normalizeAccessPath(bad)).toBeNull();
  });

  it("says what is inside a folder: the folder itself and below, not a sibling with the same start, not by '..'", () => {
    expect(pathIsInside(WORK, WORK)).toBe(true);
    expect(pathIsInside(WORK, "c:/agents/CHIEF/work/a/b.txt")).toBe(true);
    expect(pathIsInside(WORK, "C:\\Agents\\chief\\work2\\a.txt")).toBe(false);
    expect(pathIsInside(WORK, "C:\\Agents\\chief\\work\\..\\other\\a.txt")).toBe(false);
    expect(pathIsInside(WORK, "relative\\a.txt")).toBe(false);
    expect(pathIsInside("relative", WORK)).toBe(false);
    expect(pathIsInside("C:\\", "C:\\Anything\\x")).toBe(true);
  });

  it("refuses to list a folder that is not a full path, a whole drive or share, or too long", () => {
    expect(accessFolderProblem("C:\\Work\\Clients")).toBeNull();
    expect(accessFolderProblem("/home/me/work")).toBeNull();
    expect(accessFolderProblem("\\\\server\\share\\dir")).toBeNull();
    expect(accessFolderProblem("")).toMatch(/Choose a folder/);
    expect(accessFolderProblem("docs")).toMatch(/full path/);
    expect(accessFolderProblem("C:\\")).toMatch(/whole drive/);
    expect(accessFolderProblem("/")).toMatch(/whole drive/);
    expect(accessFolderProblem("\\\\server\\share")).toMatch(/whole network share/);
    expect(accessFolderProblem(`C:\\${"a".repeat(ACCESS_LIMITS.path)}`)).toMatch(/too long/);
  });
});

describe("access contract: decisions (W8-02, W8-03, W8-05, Q3)", () => {
  it("working-folder: its own folders are allowed, a write elsewhere is refused with a reason (W8-02)", () => {
    expect(accessDecision(policy(), "write", `${WORK}\\a.txt`)).toEqual({ verdict: "allow" });
    expect(accessDecision(policy(), "write", "C:\\Shared\\team\\a.txt")).toEqual({ verdict: "allow" });
    const refused = accessDecision(policy(), "write", "D:\\Other\\a.txt");
    expect(refused).toMatchObject({ verdict: "deny", reason: "outside-folder" });
    expect(refused.verdict === "deny" && refused.message).toMatch(/working folder/);
    expect(accessDecision(policy(), "write", "C:\\Agents\\chief\\work\\..\\..\\x.txt")).toMatchObject({
      verdict: "deny",
    });
    // A read follows the sandbox of the CLI (it reads widely); only an excluded folder is refused for reads.
    expect(accessDecision(policy(), "read", "D:\\Other\\a.txt")).toEqual({ verdict: "allow" });
  });

  it("ask-first: elsewhere asks, its own folders do not (W8-03)", () => {
    const ask = policy({ level: "ask-first" });
    expect(accessDecision(ask, "write", "D:\\Other\\a.txt")).toEqual({ verdict: "ask" });
    expect(accessDecision(ask, "read", "D:\\Other\\a.txt")).toEqual({ verdict: "ask" });
    expect(accessDecision(ask, "write", `${WORK}\\a.txt`)).toEqual({ verdict: "allow" });
  });

  it("added folders are the agent's too (W8-05)", () => {
    const withClients = policy({ additionalFolders: ["D:\\Clients"] });
    expect(accessDecision(withClients, "write", "D:\\Clients\\acme\\a.txt")).toEqual({ verdict: "allow" });
    expect(accessDecision(withClients, "write", "D:\\ClientsX\\a.txt")).toMatchObject({ verdict: "deny" });
  });

  it("full allows everywhere", () => {
    expect(accessDecision(policy({ level: "full" }), "write", "E:\\anything\\a.txt")).toEqual({ verdict: "allow" });
  });

  it("an excluded folder is refused at EVERY level, also full, also inside an added folder, also for reads (Q3)", () => {
    for (const level of ["working-folder", "ask-first", "full"] as const) {
      const p = policy({
        level,
        additionalFolders: ["D:\\Clients"],
        excludedFolders: ["D:\\Clients\\Secret", `${WORK}\\private`],
      });
      for (const op of ["read", "write"] as const) {
        expect(accessDecision(p, op, "D:\\Clients\\secret\\key.txt")).toMatchObject({
          verdict: "deny",
          reason: "excluded",
        });
        expect(accessDecision(p, op, `${WORK}\\private\\x.txt`)).toMatchObject({ verdict: "deny", reason: "excluded" });
      }
      expect(accessDecision(p, "write", "D:\\Clients\\open\\a.txt")).toEqual({ verdict: "allow" });
    }
  });

  it("a path that is not a full path is never allowed by guessing", () => {
    expect(accessDecision(policy(), "write", "notes.txt")).toMatchObject({ verdict: "deny" });
    expect(accessDecision(policy({ level: "ask-first" }), "write", "notes.txt")).toEqual({ verdict: "ask" });
    expect(accessDecision(policy({ level: "full" }), "write", "..\\notes.txt")).toEqual({ verdict: "ask" });
  });
});

describe("access contract: levels, cards and answers", () => {
  it("knows a raise from a lowering", () => {
    expect(accessIsRaise("working-folder", "ask-first")).toBe(true);
    expect(accessIsRaise("ask-first", "full")).toBe(true);
    expect(accessIsRaise("full", "ask-first")).toBe(false);
    expect(accessIsRaise("ask-first", "ask-first")).toBe(false);
    expect(DEFAULT_ACCESS_LEVEL).toBe("working-folder");
    expect(defaultAgentAccess("chief")).toEqual({
      botId: "chief",
      level: "working-folder",
      additionalFolders: [],
      excludedFolders: [],
      raisedAt: null,
      updatedAt: null,
    });
  });

  it("the card of a raise says what the level means and that excluded folders stay forbidden; full says it has no Computer Use", () => {
    const card = accessRaiseCard({ agentName: "Chief", from: "ask-first", to: "full" });
    expect(card.title).toBe("Give Chief more access?");
    expect(card.preview).toMatch(/Ask first → Full access/);
    expect(card.preview).toMatch(/does not include Computer Use or the camera/);
    expect(card.preview).toMatch(/Folders you excluded stay forbidden/);
  });

  it("parses the window's calls", () => {
    expect(parseAccessAgentInput({ botId: "chief" })).toEqual({ botId: "chief" });
    expect(() => parseAccessAgentInput({ botId: "" })).toThrow(/Choose an agent/);
    expect(parseSetAccessLevelInput({ botId: "chief", level: "full" })).toEqual({ botId: "chief", level: "full" });
    expect(() => parseSetAccessLevelInput({ botId: "chief", level: "root" })).toThrow(/level is one of/);
    expect(parseSetAccessFoldersInput({ botId: "chief", excludedFolders: ["C:\\a\\b", "c:/A/B/"] })).toEqual({
      botId: "chief",
      excludedFolders: ["C:\\a\\b"],
    });
    expect(() => parseSetAccessFoldersInput({ botId: "chief" })).toThrow(/Give the added folders/);
    expect(() => parseSetAccessFoldersInput({ botId: "chief", additionalFolders: ["docs"] })).toThrow(/full path/);
    expect(() => parseSetAccessFoldersInput({ botId: "chief", additionalFolders: "C:\\a" })).toThrow(/list of folders/);
    expect(() =>
      parseSetAccessFoldersInput({
        botId: "chief",
        additionalFolders: Array.from({ length: ACCESS_LIMITS.folders + 1 }, (_, i) => `C:\\f${i}`),
      }),
    ).toThrow(/At most/);
  });

  it("recognises the answers and the events", () => {
    const access: AgentAccess = defaultAgentAccess("chief");
    expect(isAgentAccess(access)).toBe(true);
    expect(isAgentAccess({ ...access, level: "root" })).toBe(false);
    expect(isAgentAccess({ ...access, excludedFolders: [1] })).toBe(false);
    expect(isAgentAccessList([access, access])).toBe(true);
    expect(isAgentAccessList([access, {}])).toBe(false);
    expect(isSetAccessLevelResult({ access, raiseRequested: true })).toBe(true);
    expect(isSetAccessLevelResult({ access })).toBe(false);
    expect(isAccessChanged({ type: "access-changed", access })).toBe(true);
    expect(isAgentEvent({ type: "access-changed", access })).toBe(true);
    const denied = {
      type: "access-denied",
      botId: "chief",
      threadId: null,
      kind: "file-change",
      reason: "excluded",
      path: "C:\\x",
      message: "no",
    };
    expect(isAccessDenied(denied)).toBe(true);
    expect(isAgentEvent(denied)).toBe(true);
    expect(isAgentEvent({ ...denied, reason: "because" })).toBe(false);
  });

  it("has channels for the access", () => {
    expect(IPC_CHANNELS.accessGet).toBe("access:get");
    expect(IPC_CHANNELS.accessList).toBe("access:list");
    expect(IPC_CHANNELS.accessSetFolders).toBe("access:set-folders");
    expect(IPC_CHANNELS.accessSetLevel).toBe("access:set-level");
  });
});
