// @vitest-environment node
// COSGRAL W8-BE1: the access levels of the agents (spec-w8.md 1A, W8-01…08; Q2, Q3, Q4, Q9).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentApproval, AgentEvent, DraftPreviewResolution } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccessService } from "./access-service";
import { AccessStore } from "./access-store";

const WORK = "C:\\agents\\chief";
const SHARED = "C:\\shared";

interface Cards {
  title: string;
  preview: string;
  answer: (value: DraftPreviewResolution) => void;
}

let dir: string;
let events: AgentEvent[];
let cards: Cards[];
let service: AccessService;
let known: Set<string>;
/** W8-BE2: what the isolation says about refusing disk tools (null: nothing against it). */
let isolationRefusal: string | null;

function makeService(file = join(dir, "access.json")): AccessService {
  return new AccessService({
    store: new AccessStore({ filePath: file }),
    folders: (botId) => (known.has(botId) ? { workspace: WORK, shared: SHARED } : null),
    botName: (botId) => (known.has(botId) ? "Chief" : null),
    confirm: (_botId, input) =>
      new Promise<DraftPreviewResolution>((resolve) => {
        cards.push({ ...input, answer: resolve });
      }),
    emit: (event) => events.push(event),
    isolationRefusal: () => isolationRefusal,
  });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cosgral-access-service-"));
  events = [];
  cards = [];
  known = new Set(["chief"]);
  isolationRefusal = null;
  service = makeService();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function approval(overrides: Partial<AgentApproval> = {}): AgentApproval {
  return {
    requestId: 1,
    botId: "chief",
    threadId: "t",
    turnId: "u",
    kind: "file-change",
    command: null,
    cwd: WORK,
    reason: null,
    grantRoot: null,
    permissions: null,
    ...overrides,
  };
}

describe("levels (W8-01, W8-04)", () => {
  it("a new agent is at working-folder, with no folders", () => {
    expect(service.get("chief")).toMatchObject({ level: "working-folder", additionalFolders: [], raisedAt: null });
  });

  it("raising is a card and changes nothing until it is allowed (Q2, 1G)", async () => {
    const result = await service.setLevel({ botId: "chief", level: "full" });
    expect(result.raiseRequested).toBe(true);
    expect(result.access.level).toBe("working-folder");
    expect(cards).toHaveLength(1);
    expect(cards[0]?.title).toContain("Chief");
    expect(cards[0]?.preview).toContain("Full access");
    expect(service.get("chief").level).toBe("working-folder");

    cards[0]?.answer("send");
    await flush();
    expect(service.get("chief")).toMatchObject({ level: "full" });
    expect(service.get("chief").raisedAt).not.toBeNull();
    expect(events.at(-1)).toMatchObject({ type: "access-changed", access: { botId: "chief", level: "full" } });
  });

  it("cancelling the card keeps the level, and so does keeping the draft or an expired card", async () => {
    for (const answer of ["keep-draft", "edit", "expired"] as const) {
      await service.setLevel({ botId: "chief", level: "ask-first" });
      cards.at(-1)?.answer(answer);
      await flush();
    }
    expect(service.get("chief").level).toBe("working-folder");
  });

  it("asking twice for the same raise opens one card", async () => {
    await service.setLevel({ botId: "chief", level: "ask-first" });
    const again = await service.setLevel({ botId: "chief", level: "ask-first" });
    expect(again.raiseRequested).toBe(true);
    expect(cards).toHaveLength(1);
  });

  it("lowering is done at once, with no card", async () => {
    await service.setLevel({ botId: "chief", level: "full" });
    cards[0]?.answer("send");
    await flush();
    const result = await service.setLevel({ botId: "chief", level: "working-folder" });
    expect(result).toMatchObject({ raiseRequested: false, access: { level: "working-folder" } });
    expect(cards).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "access-changed", access: { level: "working-folder" } });
  });

  it("a raise that was asked for and then lowered or changed is not applied when the old card is allowed", async () => {
    await service.setLevel({ botId: "chief", level: "full" });
    await service.setLevel({ botId: "chief", level: "working-folder" });
    cards[0]?.answer("send");
    await flush();
    expect(service.get("chief").level).toBe("working-folder");
  });

  it("the same level is not a change", async () => {
    const result = await service.setLevel({ botId: "chief", level: "working-folder" });
    expect(result.raiseRequested).toBe(false);
    expect(events).toHaveLength(0);
  });

  it("an agent that does not exist gets nothing", async () => {
    await expect(service.setLevel({ botId: "ghost", level: "ask-first" })).rejects.toThrow("agent");
    expect(() => service.setFolders({ botId: "ghost", excludedFolders: ["D:\\x"] })).toThrow("agent");
  });

  it("the level and folders come back after a restart (W8-06)", async () => {
    await service.setLevel({ botId: "chief", level: "ask-first" });
    cards[0]?.answer("send");
    await flush();
    service.setFolders({ botId: "chief", additionalFolders: ["D:\\proj"], excludedFolders: ["D:\\proj\\keys"] });
    const restarted = makeService();
    expect(restarted.get("chief")).toMatchObject({
      level: "ask-first",
      additionalFolders: ["D:\\proj"],
      excludedFolders: ["D:\\proj\\keys"],
    });
  });

  it("an agent made from a template or imported starts at working-folder whatever was kept for its id (Q9)", async () => {
    await service.setLevel({ botId: "chief", level: "full" });
    cards[0]?.answer("send");
    await flush();
    service.agentCreated("chief");
    expect(service.get("chief")).toMatchObject({ level: "working-folder", raisedAt: null });
  });

  it("a deleted agent leaves nothing behind", async () => {
    service.setFolders({ botId: "chief", excludedFolders: ["D:\\x"] });
    service.forgetBot("chief");
    expect(makeService().get("chief").excludedFolders).toEqual([]);
  });
});

describe("folders (W8-05)", () => {
  it("replaces the lists, keeps the one that was left out, and tells the window", () => {
    service.setFolders({ botId: "chief", additionalFolders: ["D:\\a"] });
    const next = service.setFolders({ botId: "chief", excludedFolders: ["D:\\b"] });
    expect(next).toMatchObject({ additionalFolders: ["D:\\a"], excludedFolders: ["D:\\b"] });
    expect(events.at(-1)).toMatchObject({ type: "access-changed" });
  });

  it("refuses a relative folder, a whole drive and more than the limit", () => {
    expect(() => service.setFolders({ botId: "chief", additionalFolders: ["docs"] })).toThrow();
    expect(() => service.setFolders({ botId: "chief", excludedFolders: ["C:\\"] })).toThrow();
    expect(() =>
      service.setFolders({ botId: "chief", additionalFolders: Array.from({ length: 21 }, (_, i) => `D:\\f${i}`) }),
    ).toThrow();
  });
});

describe("the CLI of an agent", () => {
  it("is told the level's sandbox, with the added folders as roots", () => {
    service.setFolders({ botId: "chief", additionalFolders: ["D:\\proj"] });
    const bot = { id: "chief" };
    const access = service.cliAccess(bot.id);
    expect(access.sandbox).toBe("workspace-write");
    expect(access.runtimeWorkspaceRoots).toEqual([WORK, "D:\\proj", SHARED]);
  });
});

describe("a request of the CLI (W8-02, W8-03, W8-05)", () => {
  it("at working-folder, a change outside is refused with a reason, and the window is told", () => {
    const decision = service.inspectApproval(approval({ grantRoot: "D:\\other" }));
    expect(decision).toMatchObject({ verdict: "deny", reason: "outside-folder" });
    expect(events.at(-1)).toMatchObject({
      type: "access-denied",
      botId: "chief",
      threadId: "t",
      kind: "file-change",
      reason: "outside-folder",
      path: "D:\\other",
    });
  });

  it("an excluded folder is refused at full, with the reason 'excluded'", async () => {
    await service.setLevel({ botId: "chief", level: "full" });
    cards[0]?.answer("send");
    await flush();
    service.setFolders({ botId: "chief", excludedFolders: ["D:\\secret"] });
    events.length = 0;
    const decision = service.inspectApproval(approval({ grantRoot: "D:\\secret\\a" }));
    expect(decision).toMatchObject({ verdict: "deny", reason: "excluded" });
    expect(events.at(-1)).toMatchObject({ type: "access-denied", reason: "excluded" });
  });

  it("a request that is only inside the folders is not a refusal and shows nothing", () => {
    expect(service.inspectApproval(approval({ grantRoot: `${WORK}\\src` }))).toEqual({ verdict: "allow" });
    expect(events).toHaveLength(0);
  });

  it("lowering takes hold at once for the next request", async () => {
    await service.setLevel({ botId: "chief", level: "full" });
    cards[0]?.answer("send");
    await flush();
    expect(service.inspectApproval(approval({ grantRoot: "D:\\other" }))).toEqual({ verdict: "allow" });
    await service.setLevel({ botId: "chief", level: "working-folder" });
    expect(service.inspectApproval(approval({ grantRoot: "D:\\other" })).verdict).toBe("deny");
  });

  it("a request of an unknown agent is not judged (the old path decides)", () => {
    expect(service.inspectApproval(approval({ botId: "ghost", grantRoot: "D:\\o" }))).toEqual({ verdict: "allow" });
  });
});

describe("the tools of the program (W8-02, Q3)", () => {
  it("a tool that names an excluded folder is refused with a readable text", async () => {
    service.setFolders({ botId: "chief", excludedFolders: ["D:\\secret"] });
    const result = await service.inspectTool("chief", "t", "data_add_file", { path: "D:\\secret\\a.txt" });
    expect(result).toMatchObject({ allowed: false });
    expect(result.allowed === false && result.message).toContain("excluded");
    expect(events.at(-1)).toMatchObject({ type: "access-denied", kind: "tool", reason: "excluded" });
  });

  it("a relative path that climbs out of the working folder is judged where it goes", async () => {
    const result = await service.inspectTool("chief", "t", "data_save_file", { path: "..\\..\\out\\a.txt" });
    expect(result.allowed).toBe(false);
  });

  it("a tool with no path is never held up", async () => {
    expect(await service.inspectTool("chief", "t", "tables_list", { name: "x" })).toEqual({ allowed: true });
  });

  it("at ask-first a path outside opens a card; Allow lets it through, anything else refuses", async () => {
    await service.setLevel({ botId: "chief", level: "ask-first" });
    cards[0]?.answer("send");
    await flush();
    const pending = service.inspectTool("chief", "t", "data_add_file", { path: "D:\\docs\\a.txt" });
    await flush();
    expect(cards).toHaveLength(2);
    expect(cards[1]?.preview).toContain("D:\\docs\\a.txt");
    cards[1]?.answer("send");
    expect(await pending).toEqual({ allowed: true });

    const second = service.inspectTool("chief", "t", "data_add_file", { path: "D:\\docs\\b.txt" });
    await flush();
    cards[2]?.answer("keep-draft");
    expect(await second).toMatchObject({ allowed: false });
  });
});

describe("the tools of Claude Code", () => {
  it("a write outside the working folder is refused at working-folder; inside it goes through", async () => {
    expect(await service.inspectClaudeTool("chief", "t", "Write", { file_path: "D:\\x\\a.txt" })).toMatchObject({
      behavior: "deny",
    });
    expect(await service.inspectClaudeTool("chief", "t", "Write", { file_path: `${WORK}\\a.txt` })).toEqual({
      behavior: "allow",
    });
    expect(await service.inspectClaudeTool("chief", "t", "Read", { file_path: "D:\\x\\a.txt" })).toEqual({
      behavior: "allow",
    });
    expect(await service.inspectClaudeTool("chief", "t", "WebFetch", { url: "https://x.y" })).toEqual({
      behavior: "allow",
    });
  });

  it("at ask-first a command naming a folder outside opens a card", async () => {
    await service.setLevel({ botId: "chief", level: "ask-first" });
    cards[0]?.answer("send");
    await flush();
    const pending = service.inspectClaudeTool("chief", "t", "Bash", { command: "del D:\\old\\a.txt" });
    await flush();
    expect(cards[1]?.preview).toContain("del D:\\old\\a.txt");
    cards[1]?.answer("send");
    expect(await pending).toEqual({ behavior: "allow" });
  });

  it("an excluded folder is refused at full for a read too (Q3)", async () => {
    await service.setLevel({ botId: "chief", level: "full" });
    cards[0]?.answer("send");
    await flush();
    service.setFolders({ botId: "chief", excludedFolders: ["D:\\secret"] });
    const result = await service.inspectClaudeTool("chief", "t", "Read", { file_path: "D:\\secret\\keys.txt" });
    expect(result).toMatchObject({ behavior: "deny" });
  });
});

describe("Q2: isolation on but impossible (W8-BE2)", () => {
  const reason = "This computer cannot isolate processes. Disk tools of this agent are refused below Full access.";

  it("refuses a command or a file change of the CLI with its own reason, even inside the folders", () => {
    isolationRefusal = reason;
    const inside = service.inspectApproval(approval({ grantRoot: `${WORK}\\src` }));
    expect(inside).toMatchObject({ verdict: "deny", reason: "isolation-unavailable", message: reason });
    expect(events.at(-1)).toMatchObject({
      type: "access-denied",
      reason: "isolation-unavailable",
      kind: "file-change",
    });
    const command = service.inspectApproval(approval({ kind: "command", command: "npm test", cwd: WORK }));
    expect(command).toMatchObject({ verdict: "deny", reason: "isolation-unavailable" });
  });

  it("leaves a request that asks only to see a screen or camera (their own consents) to its own card", () => {
    isolationRefusal = reason;
    expect(service.inspectApproval(approval({ kind: "screen", command: null, cwd: null }))).toEqual({
      verdict: "allow",
    });
  });

  it("refuses the file tools and the shell of Claude, but not reads and not tools that touch no folder", async () => {
    isolationRefusal = reason;
    expect(await service.inspectClaudeTool("chief", "t", "Bash", { command: "dir" })).toMatchObject({
      behavior: "deny",
      message: reason,
    });
    expect(await service.inspectClaudeTool("chief", "t", "Write", { file_path: `${WORK}\\a.txt` })).toMatchObject({
      behavior: "deny",
    });
    expect(await service.inspectClaudeTool("chief", "t", "Read", { file_path: `${WORK}\\a.txt` })).toEqual({
      behavior: "allow",
    });
    expect(await service.inspectClaudeTool("chief", "t", "WebFetch", { url: "https://x.y" })).toEqual({
      behavior: "allow",
    });
    expect(
      events.filter((event) => event.type === "access-denied" && event.reason === "isolation-unavailable"),
    ).toHaveLength(2);
  });

  it("nothing changes while the isolation has no objection", async () => {
    expect(service.inspectApproval(approval({ grantRoot: `${WORK}\\src` }))).toEqual({ verdict: "allow" });
    expect(await service.inspectClaudeTool("chief", "t", "Bash", { command: "dir" })).toEqual({ behavior: "allow" });
  });
});
