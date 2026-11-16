// @vitest-environment node
// COSGRAL W8-BE2: isolation of agent processes on the engine side (spec-w8.md 1B, W8-09…11; Q2): what this computer can
// do (checked, never assumed), what is in force for each agent, the card for turning it off, and the refusal of disk tools
// when isolation is on but impossible.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, DraftPreviewResolution, IsolationAvailability } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IsolationService, IsolationStore, probeIsolation } from "./isolation-service";

const CAN: IsolationAvailability = {
  checkedAt: "2026-11-16T12:00:00.000Z",
  mechanism: "app-container-job",
  jobObject: { ok: true, reason: null },
  appContainer: { ok: true, reason: null },
  windows: "10.0.19045",
};
const CANNOT: IsolationAvailability = {
  checkedAt: "2026-11-16T12:00:00.000Z",
  mechanism: "none",
  jobObject: { ok: false, reason: "Windows only." },
  appContainer: { ok: false, reason: "Windows only." },
  windows: null,
};

let dir: string;
let events: AgentEvent[];
let cards: Array<{ title: string; preview: string; answer: (value: DraftPreviewResolution) => void }>;
let known: Set<string>;
let owns: Map<string, boolean>;
let state: { availability: IsolationAvailability; host: string | null };

function make(file = join(dir, "agent-isolation.json")): IsolationService {
  return new IsolationService({
    store: new IsolationStore({ filePath: file }),
    check: async () => state,
    botIds: () => [...known],
    botName: (botId) => (known.has(botId) ? botId.toUpperCase() : null),
    ownProcesses: (botId) => owns.get(botId) ?? true,
    confirm: (_botId, input) =>
      new Promise<DraftPreviewResolution>((resolve) => {
        cards.push({ ...input, answer: resolve });
      }),
    emit: (event) => events.push(event),
  });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cosgral-isolation-service-"));
  events = [];
  cards = [];
  known = new Set(["claude", "codex"]);
  owns = new Map([["codex", false]]);
  state = { availability: CAN, host: "C:\\host\\cosgral-job-host.exe" };
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("what is in force (W8-09, W8-11)", () => {
  it("nothing is claimed before the computer was checked", () => {
    const service = make();
    expect(service.get("claude").state).toBe("unavailable");
    expect(service.availability().checkedAt).toBeNull();
  });

  it("after the check an agent with its own processes is active, one on a shared program is said to be shared", async () => {
    const service = make();
    await service.initialize();
    expect(service.get("claude")).toMatchObject({ state: "active", mechanism: "job-object", maxProcesses: 512 });
    expect(service.get("codex")).toMatchObject({ state: "shared-process", mechanism: "none" });
    expect(events.at(-1)).toMatchObject({ type: "isolation-changed" });
  });

  it("a computer that cannot isolate gives 'unavailable' with the reason, and the helper is not handed out", async () => {
    state = { availability: CANNOT, host: null };
    const service = make();
    await service.initialize();
    expect(service.get("claude")).toMatchObject({ state: "unavailable", mechanism: "none" });
    expect(service.get("claude").reason).toContain("Windows only.");
    expect(service.wrapFor("claude")).toBeNull();
  });

  it("hands out the helper only for an agent whose own processes run in a Job Object", async () => {
    const service = make();
    await service.initialize();
    expect(service.wrapFor("claude")).toEqual({ host: "C:\\host\\cosgral-job-host.exe", maxProcesses: 512 });
    expect(service.wrapFor("codex")).toBeNull();
    expect(service.wrapFor("ghost")).toBeNull();
  });
});

describe("Q2: no silent full disk", () => {
  it("disk tools are refused below Full when isolation is on and impossible; with the reason", async () => {
    state = { availability: CANNOT, host: null };
    const service = make();
    await service.initialize();
    expect(service.refusal("claude", "working-folder")).toContain("Windows only.");
    expect(service.refusal("claude", "ask-first")).not.toBeNull();
    expect(service.refusal("claude", "full")).toBeNull();
  });

  it("nothing is refused when isolation works, or when it is off for the agent", async () => {
    const service = make();
    await service.initialize();
    expect(service.refusal("claude", "working-folder")).toBeNull();
    state = { availability: CANNOT, host: null };
    await service.recheck();
    await service.setEnabled({ botId: "claude", enabled: false });
    cards[0]?.answer("send");
    await flush();
    expect(service.refusal("claude", "working-folder")).toBeNull();
  });
});

describe("turning isolation off is a card", () => {
  it("changes nothing until Allow, and a second request opens no second card", async () => {
    const service = make();
    await service.initialize();
    const result = await service.setEnabled({ botId: "claude", enabled: false });
    expect(result).toMatchObject({ offRequested: true, isolation: { state: "active" } });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.title).toContain("CLAUDE");
    expect((await service.setEnabled({ botId: "claude", enabled: false })).offRequested).toBe(true);
    expect(cards).toHaveLength(1);
    cards[0]?.answer("send");
    await flush();
    expect(service.get("claude").state).toBe("off");
  });

  it("Cancel, a kept draft or an expired card leaves it on", async () => {
    const service = make();
    await service.initialize();
    for (const answer of ["keep-draft", "edit", "expired"] as const) {
      await service.setEnabled({ botId: "claude", enabled: false });
      cards.at(-1)?.answer(answer);
      await flush();
    }
    expect(service.get("claude").state).toBe("active");
  });

  it("turning it back on is at once, with no card; the choice survives a restart", async () => {
    const service = make();
    await service.initialize();
    await service.setEnabled({ botId: "claude", enabled: false });
    cards[0]?.answer("send");
    await flush();
    const restarted = make();
    await restarted.initialize();
    expect(restarted.get("claude").state).toBe("off");
    const back = await restarted.setEnabled({ botId: "claude", enabled: true });
    expect(back).toMatchObject({ offRequested: false, isolation: { state: "active" } });
    expect(cards).toHaveLength(1);
  });

  it("a request that was asked and then replaced by 'on' is not applied when the old card is allowed", async () => {
    const service = make();
    await service.initialize();
    await service.setEnabled({ botId: "claude", enabled: false });
    await service.setEnabled({ botId: "claude", enabled: true });
    cards[0]?.answer("send");
    await flush();
    expect(service.get("claude").enabled).toBe(true);
  });

  it("an agent that does not exist gets nothing", async () => {
    const service = make();
    await service.initialize();
    await expect(service.setEnabled({ botId: "ghost", enabled: false })).rejects.toThrow("agent");
  });

  it("a deleted agent leaves no choice behind", async () => {
    const service = make();
    await service.initialize();
    await service.setEnabled({ botId: "claude", enabled: false });
    cards[0]?.answer("send");
    await flush();
    service.forgetBot("claude");
    expect(make().get("claude").enabled).toBe(true);
  });
});

describe("the check of this computer (probeIsolation)", () => {
  it("is not Windows: unavailable with the reason, and nothing is built", async () => {
    const result = await probeIsolation({
      folder: dir,
      platform: "linux",
      now: () => new Date("2026-11-16T12:00:00.000Z"),
    });
    expect(result.host).toBeNull();
    expect(result.availability).toMatchObject({ mechanism: "none", jobObject: { ok: false } });
    expect(result.availability.jobObject.reason).toMatch(/Windows/);
  });

  it("has no compiler: says so and does not pretend", async () => {
    const result = await probeIsolation({ folder: dir, platform: "win32", findCsc: () => null });
    expect(result.availability.jobObject.ok).toBe(false);
    expect(result.availability.jobObject.reason).toMatch(/csc\.exe/);
  });

  it("the helper cannot be built: the reason is the compiler's, not a guess", async () => {
    const result = await probeIsolation({
      folder: dir,
      platform: "win32",
      findCsc: () => "csc",
      ensureHost: async () => {
        throw new Error("The isolation helper could not be built: error CS1002");
      },
    });
    expect(result.availability.jobObject.reason).toContain("CS1002");
    expect(result.host).toBeNull();
  });

  it("reads what the helper reports, part by part", async () => {
    const result = await probeIsolation({
      folder: dir,
      platform: "win32",
      findCsc: () => "csc",
      ensureHost: async () => "host.exe",
      runProbe: async () => ({
        job: null,
        appContainer: "cannot derive an AppContainer id (0x80070005)",
        windows: "10.0.19045.0",
      }),
    });
    expect(result.host).toBe("host.exe");
    expect(result.availability).toMatchObject({
      mechanism: "job-object",
      jobObject: { ok: true, reason: null },
      appContainer: { ok: false },
      windows: "10.0.19045.0",
    });
  });

  it("a computer with both reports the AppContainer wall as possible", async () => {
    const result = await probeIsolation({
      folder: dir,
      platform: "win32",
      findCsc: () => "csc",
      ensureHost: async () => "host.exe",
      runProbe: async () => ({ job: null, appContainer: null, windows: "10.0.19045.0" }),
    });
    expect(result.availability.mechanism).toBe("app-container-job");
  });
});

describe.runIf(process.platform === "win32")("the check on this Windows (real helper)", () => {
  it("finds a Job Object and an AppContainer without the administrator", async () => {
    const result = await probeIsolation({ folder: join(dir, "bin") });
    expect(result.availability.jobObject).toEqual({ ok: true, reason: null });
    expect(result.availability.appContainer).toEqual({ ok: true, reason: null });
    expect(result.host).not.toBeNull();
  }, 120_000);
});
