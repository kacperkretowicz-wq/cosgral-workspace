// @vitest-environment node
// W12-KK (g2): Transfer and Import on a FAKE program (agents, library, memories, routines, settings) and a fake dialog. No real data.
import { INSTANCE_TRANSFER_LIMITS, isApplyTransferResult, isTransferPreview } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createZip, readZip } from "../zip";
import {
  copyName,
  FOREIGN_MANIFEST,
  InstanceTransferService,
  TRANSFER_MANIFEST,
  type TransferAgentRecord,
  type TransferHost,
  type TransferMemory,
  type TransferRoutine,
  type TransferSkill,
} from "./transfer-service";

const SECRET = "sk-test-secret-value-must-never-travel";

interface World {
  agents: TransferAgentRecord[];
  skills: Map<string, TransferSkill[]>;
  memories: Map<string, TransferMemory[]>;
  routines: Map<string, TransferRoutine[]>;
  settings: unknown;
  created: Array<{ id: string; name: string; role: string }>;
  savedMemories: Array<{ agentId: string; memory: TransferMemory }>;
  installed: Array<{ agentId: string; skill: string }>;
  pausedRoutines: Array<{ agentId: string; routine: TransferRoutine }>;
  appliedSettings: unknown[];
  libraryHas: Set<string>;
  failCreate: Set<string>;
  failMemory: boolean;
  counter: number;
}

function world(): World {
  return {
    agents: [
      {
        id: "a1",
        name: "Chief",
        role: "Coordinator",
        instructions: "Lead the team.",
        avatarSeed: "chief",
        avatarHue: 30,
      },
      { id: "a2", name: "Writer", role: "Drafts", instructions: "Write well.", avatarSeed: "writer", avatarHue: null },
    ],
    skills: new Map([
      [
        "a1",
        [
          {
            name: "plan-a-week",
            skillMd: "---\nname: plan-a-week\n---\nPlan.",
            files: [{ path: "notes/tips.md", content: "tips" }],
          },
        ],
      ],
    ]),
    memories: new Map([
      ["a1", [{ text: "Likes short answers", inclusion: "essential" }]],
      ["a2", [{ text: "Writes in English", inclusion: "searchable" }]],
    ]),
    routines: new Map([
      [
        "a1",
        [
          {
            name: "Morning summary",
            prompt: "Summarize.",
            schedule: { type: "daily", time: "08:00" },
            timezone: "Europe/Warsaw",
          },
        ],
      ],
    ]),
    settings: { personality: "calm" },
    created: [],
    savedMemories: [],
    installed: [],
    pausedRoutines: [],
    appliedSettings: [],
    libraryHas: new Set(),
    failCreate: new Set(),
    failMemory: false,
    counter: 0,
  };
}

function hostFor(state: World, options: { settings?: boolean } = {}): TransferHost {
  return {
    appVersion: "0.0.test",
    listAgents: () => [
      ...state.agents,
      ...state.created.map((agent) => ({ ...agent, instructions: "", avatarSeed: agent.name, avatarHue: null })),
    ],
    skillsOf: async (id) => ({
      skills: state.skills.get(id) ?? [],
      warnings: id === "a2" ? ["a skill file was left out (it is not text)."] : [],
    }),
    memoriesOf: (id) => state.memories.get(id) ?? [],
    routinesOf: (id) => state.routines.get(id) ?? [],
    createAgent: async (input) => {
      if (state.failCreate.has(input.name)) throw new Error("no");
      state.counter += 1;
      const created = { id: `n${state.counter}`, name: input.name, role: input.role };
      state.created.push(created);
      return { id: created.id, name: created.name };
    },
    saveMemory: (agentId, memory) => {
      if (state.failMemory) throw new Error("full");
      state.savedMemories.push({ agentId, memory });
    },
    installSkill: async (agentId, skill) => {
      if (state.libraryHas.has(skill.name)) return "kept-existing";
      state.installed.push({ agentId, skill: skill.name });
      return "installed";
    },
    createPausedRoutine: (agentId, routine) => {
      state.pausedRoutines.push({ agentId, routine });
    },
    exportSettings: options.settings === false ? null : () => state.settings,
    applySettings:
      options.settings === false
        ? null
        : (value) => {
            state.appliedSettings.push(value);
            return true;
          },
  };
}

function service(state: World, options: { settings?: boolean; now?: () => Date } = {}) {
  const dialog: { saved: Buffer | null; savedName: string; toOpen: Buffer | null; cancelSave: boolean } = {
    saved: null,
    savedName: "",
    toOpen: null,
    cancelSave: false,
  };
  const instance = new InstanceTransferService({
    host: hostFor(state, options),
    files: {
      save: async (name, bytes) => {
        if (dialog.cancelSave) return null;
        dialog.saved = bytes;
        dialog.savedName = name;
        return name;
      },
      open: async () => dialog.toOpen,
    },
    now: options.now,
  });
  return { instance, dialog };
}

async function exportAll(state: World, ids: string[] = ["a1", "a2"], includeSettings = true) {
  const { instance, dialog } = service(state);
  const result = await instance.exportAgents({ agentIds: ids, includeSettings });
  if (result.status !== "saved" || dialog.saved === null) throw new Error("export did not save");
  return { result, bytes: dialog.saved };
}

describe("export", () => {
  it("writes a manifest and the skill files, and carries nothing secret", async () => {
    const state = world();
    const { result, bytes } = await exportAll(state);
    expect(result).toMatchObject({ status: "saved", agents: 2 });
    const entries = readZip(bytes, { entries: 100, entryBytes: 1024 * 1024, totalBytes: 10 * 1024 * 1024 });
    expect(entries.map((entry) => entry.name).sort()).toEqual([
      "agents/agent-1/skills/plan-a-week/SKILL.md",
      "agents/agent-1/skills/plan-a-week/notes/tips.md",
      TRANSFER_MANIFEST,
    ]);
    const manifest = JSON.parse(
      entries.find((entry) => entry.name === TRANSFER_MANIFEST)?.data.toString("utf8") ?? "{}",
    );
    expect(manifest).toMatchObject({
      format: "cosgral-instance-transfer",
      version: 1,
      settings: { personality: "calm" },
    });
    expect(manifest.agents).toHaveLength(2);
    expect(Buffer.concat(entries.map((entry) => entry.data)).toString("utf8")).not.toContain(SECRET);
    expect(result.status === "saved" && result.warnings).toEqual([
      "Writer: a skill file was left out (it is not text).",
    ]);
  });

  it("an unknown agent is refused, a closed dialog is cancelled, and a missing settings export is said", async () => {
    const state = world();
    const { instance, dialog } = service(state, { settings: false });
    await expect(instance.exportAgents({ agentIds: ["nope"], includeSettings: false })).rejects.toThrow(
      /does not exist/,
    );
    dialog.cancelSave = true;
    expect(await instance.exportAgents({ agentIds: ["a1"], includeSettings: false })).toEqual({ status: "cancelled" });
    dialog.cancelSave = false;
    const saved = await instance.exportAgents({ agentIds: ["a1"], includeSettings: true });
    expect(saved.status === "saved" && saved.warnings.join(" ")).toMatch(/no portable settings/);
    expect((await instance.summary()).capabilities).toEqual({ settings: false, files: false, history: false });
  });

  it("the summary counts what each agent brings", async () => {
    const { instance } = service(world());
    const summary = await instance.summary();
    expect(summary.agents.find((agent) => agent.id === "a1")).toMatchObject({
      skillCount: 1,
      routineCount: 1,
      memoryCount: 1,
    });
    expect(summary.agents.find((agent) => agent.id === "a2")).toMatchObject({
      skillCount: 0,
      routineCount: 0,
      memoryCount: 1,
    });
  });
});

describe("import of our own file", () => {
  it("round trip: staging changes nothing; apply makes NEW agents with numbered names, paused routines and skills", async () => {
    const source = world();
    const { bytes } = await exportAll(source);
    const target = world();
    const { instance, dialog } = service(target);
    dialog.toOpen = bytes;
    const preview = await instance.choose();
    expect(preview && isTransferPreview(preview)).toBe(true);
    expect(target.created).toEqual([]);
    expect(
      preview?.agents.map((agent) => [
        agent.name,
        agent.nameTaken,
        agent.skillNames,
        agent.routineNames,
        agent.memoryCount,
      ]),
    ).toEqual([
      ["Chief", true, ["plan-a-week"], ["Morning summary"], 1],
      ["Writer", true, [], [], 1],
    ]);
    expect(preview).toMatchObject({ source: "transfer", sourceApp: "COSGRAL Workspace", hasSettings: true });
    if (!preview) return;
    const result = await instance.apply({ token: preview.token, keys: ["agent-1", "agent-2"], includeSettings: true });
    expect(isApplyTransferResult(result)).toBe(true);
    expect(result.agents.map((agent) => agent.name)).toEqual(["Chief (imported 2)", "Writer (imported 2)"]);
    expect(target.agents.map((agent) => agent.name)).toEqual(["Chief", "Writer"]);
    expect(target.created[0]).toMatchObject({ role: "Coordinator" });
    expect(target.savedMemories.map((entry) => [entry.agentId, entry.memory])).toEqual([
      ["n1", { text: "Likes short answers", inclusion: "essential" }],
      ["n2", { text: "Writes in English", inclusion: "searchable" }],
    ]);
    expect(target.installed).toEqual([{ agentId: "n1", skill: "plan-a-week" }]);
    expect(target.pausedRoutines).toHaveLength(1);
    expect(target.pausedRoutines[0]?.routine).toMatchObject({
      name: "Morning summary",
      schedule: { type: "daily", time: "08:00" },
    });
    expect(result.warnings.join(" ")).toMatch(/created paused/);
    expect(result.settingsApplied).toBe(true);
    expect(target.appliedSettings).toEqual([{ personality: "calm" }]);
  });

  it("only the chosen agents are made, the rest are reported, and settings can be left out", async () => {
    const { bytes } = await exportAll(world());
    const target = world();
    const { instance, dialog } = service(target);
    dialog.toOpen = bytes;
    const preview = await instance.choose();
    if (!preview) throw new Error("no preview");
    const result = await instance.apply({ token: preview.token, keys: ["agent-2"], includeSettings: false });
    expect(result.agents.map((agent) => agent.key)).toEqual(["agent-2"]);
    expect(result.skipped).toEqual([{ key: "agent-1", reason: "unselected" }]);
    expect(result.settingsApplied).toBe(false);
    expect(target.appliedSettings).toEqual([]);
  });

  it("a token is used once; a discarded or expired file cannot be applied; the oldest staged file goes first", async () => {
    const { bytes } = await exportAll(world());
    let clock = Date.parse("2026-11-17T12:00:00.000Z");
    const target = world();
    const { instance, dialog } = service(target, { now: () => new Date(clock) });
    dialog.toOpen = bytes;
    const first = await instance.choose();
    if (!first) throw new Error("no preview");
    await instance.apply({ token: first.token, keys: ["agent-1"], includeSettings: false });
    await expect(instance.apply({ token: first.token, keys: ["agent-1"], includeSettings: false })).rejects.toThrow(
      /no longer staged/,
    );
    const second = await instance.choose();
    if (!second) throw new Error("no preview");
    instance.discard(second.token);
    await expect(instance.apply({ token: second.token, keys: ["agent-1"], includeSettings: false })).rejects.toThrow(
      /no longer staged/,
    );
    const third = await instance.choose();
    if (!third) throw new Error("no preview");
    clock += 11 * 60 * 1000;
    await expect(instance.apply({ token: third.token, keys: ["agent-1"], includeSettings: false })).rejects.toThrow(
      /no longer staged/,
    );
    const tokens: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const preview = await instance.choose();
      if (preview) tokens.push(preview.token);
    }
    await expect(instance.apply({ token: tokens[0] ?? "", keys: ["agent-1"], includeSettings: false })).rejects.toThrow(
      /no longer staged/,
    );
    expect(
      (await instance.apply({ token: tokens[3] ?? "", keys: ["agent-1"], includeSettings: false })).agents,
    ).toHaveLength(1);
  });

  it("a failure of one part is a warning; a failure to create an agent skips only that agent", async () => {
    const { bytes } = await exportAll(world());
    const target = world();
    target.failMemory = true;
    target.libraryHas.add("plan-a-week");
    target.failCreate.add("Writer (imported 2)");
    const { instance, dialog } = service(target);
    dialog.toOpen = bytes;
    const preview = await instance.choose();
    if (!preview) throw new Error("no preview");
    const result = await instance.apply({ token: preview.token, keys: ["agent-1", "agent-2"], includeSettings: false });
    expect(result.agents.map((agent) => agent.key)).toEqual(["agent-1"]);
    expect(result.skipped).toEqual([{ key: "agent-2", reason: "failed" }]);
    const text = result.warnings.join(" | ");
    expect(text).toMatch(/memory\(ies\) could not be saved/);
    expect(text).toMatch(/already in your Library/);
    expect(target.installed).toEqual([]);
  });

  it("a closed dialog answers null", async () => {
    const { instance } = service(world());
    expect(await instance.choose()).toBeNull();
  });
});

function fileWith(files: Array<{ name: string; data: string }>): Buffer {
  return createZip(files.map((file) => ({ name: file.name, data: Buffer.from(file.data, "utf8") })));
}

async function chooseOf(bytes: Buffer, state = world()) {
  const { instance, dialog } = service(state);
  dialog.toOpen = bytes;
  return { instance, preview: await instance.choose(), state };
}

describe("import of files that are not ours or not good", () => {
  it("reads the agent export of another program: skills as folders, memories as texts; its routines are not imported", async () => {
    const bytes = fileWith([
      {
        name: FOREIGN_MANIFEST,
        data: JSON.stringify({
          format: "openbot-agent-import",
          version: 1,
          source: { app: "Some Bot", exportedAt: "2026-11-01T00:00:00.000Z" },
          agents: [
            {
              key: "scout",
              name: "Scout",
              title: "Research",
              description: "Find things.",
              skills: ["agents/scout/skills/find-things"],
              memories: ["Prefers sources", "  ", "x".repeat(30_000)],
              routines: [{ name: "Daily", instruction: "Look", schedule: { kind: "interval" } }],
            },
          ],
        }),
      },
      { name: "agents/scout/skills/find-things/SKILL.md", data: "---\nname: find-things\n---\nFind." },
    ]);
    const { instance, preview, state } = await chooseOf(bytes);
    expect(preview).toMatchObject({ source: "agent-export", sourceApp: "Some Bot", hasSettings: false });
    expect(preview?.agents[0]).toMatchObject({
      name: "Scout",
      skillNames: ["find-things"],
      memoryCount: 1,
      routineNames: [],
    });
    expect(preview?.warnings.join(" ")).toMatch(/routines from another program are not imported/);
    expect(preview?.warnings.join(" ")).toMatch(/memory\(ies\) were left out/);
    if (!preview) return;
    const result = await instance.apply({ token: preview.token, keys: ["scout"], includeSettings: true });
    expect(result.agents).toHaveLength(1);
    expect(state.pausedRoutines).toEqual([]);
    expect(result.settingsApplied).toBe(false);
  });

  it("refuses a file without a manifest, with a damaged one, of a newer version, or of another kind", async () => {
    await expect(chooseOf(fileWith([{ name: "readme.txt", data: "hi" }]))).rejects.toThrow(/no manifest/);
    await expect(chooseOf(fileWith([{ name: TRANSFER_MANIFEST, data: "{not json" }]))).rejects.toThrow(/not valid/);
    await expect(
      chooseOf(
        fileWith([
          {
            name: TRANSFER_MANIFEST,
            data: JSON.stringify({ format: "cosgral-instance-transfer", version: 2, agents: [] }),
          },
        ]),
      ),
    ).rejects.toThrow(/newer version/);
    await expect(
      chooseOf(
        fileWith([
          { name: TRANSFER_MANIFEST, data: JSON.stringify({ format: "something-else", version: 1, agents: [{}] }) },
        ]),
      ),
    ).rejects.toThrow(/not an agent export/);
    await expect(
      chooseOf(
        fileWith([
          {
            name: TRANSFER_MANIFEST,
            data: JSON.stringify({ format: "cosgral-instance-transfer", version: 1, agents: [] }),
          },
        ]),
      ),
    ).rejects.toThrow(/no agents/);
    await expect(chooseOf(Buffer.from("not a zip"))).rejects.toThrow(/not a ZIP/);
  });

  it("refuses bad agents (a key that could be a path, no name, two with one key, too many) and too-long fields", async () => {
    const make = (agents: unknown[]) =>
      fileWith([
        { name: TRANSFER_MANIFEST, data: JSON.stringify({ format: "cosgral-instance-transfer", version: 1, agents }) },
      ]);
    await expect(chooseOf(make([{ key: "../x", name: "A" }]))).rejects.toThrow(/no valid key/);
    await expect(chooseOf(make([{ key: "a", name: " " }]))).rejects.toThrow(/no valid name/);
    await expect(
      chooseOf(
        make([
          { key: "a", name: "A" },
          { key: "a", name: "B" },
        ]),
      ),
    ).rejects.toThrow(/same key/);
    await expect(
      chooseOf(
        make(
          Array.from({ length: INSTANCE_TRANSFER_LIMITS.agents + 1 }, (_, index) => ({
            key: `k${index}`,
            name: `N${index}`,
          })),
        ),
      ),
    ).rejects.toThrow(/too many agents/);
    await expect(
      chooseOf(make([{ key: "a", name: "A", description: "x".repeat(INSTANCE_TRANSFER_LIMITS.text + 1) }])),
    ).rejects.toThrow(/too long/);
  });

  it("a skill that points outside its agent's folder or has no SKILL.md is left out with a warning; bad routines too", async () => {
    const bytes = fileWith([
      {
        name: TRANSFER_MANIFEST,
        data: JSON.stringify({
          format: "cosgral-instance-transfer",
          version: 1,
          agents: [
            {
              key: "a",
              name: "A",
              skills: [
                { name: "escape", dir: "agents/other/skills/escape" },
                { name: "empty", dir: "agents/a/skills/empty" },
                { name: "dots", dir: "agents/a/../x" },
              ],
              routines: [
                { name: "no schedule", prompt: "p" },
                { name: "bad time", prompt: "p", schedule: { type: "daily", time: "8am" } },
                { name: "good", prompt: "p", schedule: { type: "interval", everyMinutes: 30 } },
              ],
            },
          ],
        }),
      },
      { name: "agents/other/skills/escape/SKILL.md", data: "x" },
    ]);
    const { preview } = await chooseOf(bytes);
    expect(preview?.agents[0]?.skillNames).toEqual([]);
    expect(preview?.agents[0]?.routineNames).toEqual(["good"]);
    const warnings = preview?.warnings.join(" | ") ?? "";
    expect(warnings).toMatch(/place in the file is not valid/);
    expect(warnings).toMatch(/no SKILL.md/);
    expect(warnings).toMatch(/routine was left out/);
  });

  it("import sources: a zip and another computer work, Hermes says why not", () => {
    const { instance } = service(world());
    expect(instance.importSources().map((source) => [source.id, source.available])).toEqual([
      ["agent-zip", true],
      ["hermes", false],
      ["other-computer", true],
    ]);
  });

  it("copy names are numbered and never collide, whatever the case", () => {
    expect(copyName("Chief", new Set())).toBe("Chief");
    expect(copyName("Chief", new Set(["chief"]))).toBe("Chief (imported 2)");
    expect(copyName("Chief", new Set(["chief", "chief (imported 2)"]))).toBe("Chief (imported 3)");
  });
});
