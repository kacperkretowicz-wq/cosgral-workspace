// COSGRAL W12-KK (g2): Transfer/Import of agents and the update preferences for Storybook and the preview. DEMO data only; no file is
// written or read and no dialog opens. The same rules as the program: a chosen file is only STAGED and changes nothing, `apply`
// creates NEW agents only (a taken name gets a numbered copy name), routines come paused, an unselected agent is reported as such,
// a discarded or used token is gone, and "download by itself" needs the automatic checks.

import {
  type AgentEvent,
  type ApplyTransferResult,
  buildUpdatesOverview,
  DEFAULT_UPDATE_PREFERENCES,
  type ExportInstanceResult,
  type ImportSourceInfo,
  type InstanceTransferDesktopApi,
  type InstanceTransferSummary,
  importSourceCards,
  mergeUpdatePreferences,
  parseApplyTransferInput,
  parseDiscardTransferInput,
  parseExportInstanceInput,
  parseSetUpdatePreferencesInput,
  type TransferAgentSummary,
  type TransferPreview,
  type UpdatePreferences,
  type UpdatePreferencesDesktopApi,
  type UpdateStatus,
  type UpdatesOverview,
} from "@openbot/contracts/ipc";

export interface MockInstanceTransfer {
  transfer: Required<InstanceTransferDesktopApi>;
  updates: Required<UpdatePreferencesDesktopApi>;
  simulate: {
    updateStatus: (change: Partial<UpdateStatus>) => void;
    /** The next `choose` answers with this file (default: a demo file with two agents). */
    nextFile: (preview: Omit<TransferPreview, "token"> | null) => void;
    /** The person closes the save dialog of the next export. */
    cancelNextExport: () => void;
    /** The names that exist on this computer (to show "name taken"). */
    existingNames: (names: string[]) => void;
  };
}

const DEMO_AGENTS: TransferAgentSummary[] = [
  {
    id: "demo-chief",
    name: "Chief",
    title: "Coordinator",
    avatarSeed: "chief",
    skillCount: 2,
    routineCount: 1,
    memoryCount: 3,
  },
  {
    id: "demo-writer",
    name: "Writer",
    title: "Drafts and edits",
    avatarSeed: "writer",
    skillCount: 1,
    routineCount: 0,
    memoryCount: 5,
  },
  {
    id: "demo-scout",
    name: "Scout",
    title: "Research",
    avatarSeed: "scout",
    skillCount: 0,
    routineCount: 2,
    memoryCount: 0,
  },
];

const DEMO_FILE: Omit<TransferPreview, "token"> = {
  source: "transfer",
  sourceApp: "COSGRAL Workspace (demo)",
  exportedAt: "2026-11-16T20:00:00.000Z",
  agents: [
    {
      key: "chief",
      name: "Chief",
      title: "Coordinator",
      skillNames: ["Plan a week"],
      memoryCount: 3,
      routineNames: ["Morning summary"],
      nameTaken: false,
    },
    {
      key: "analyst",
      name: "Analyst",
      title: "Numbers",
      skillNames: [],
      memoryCount: 1,
      routineNames: [],
      nameTaken: false,
    },
  ],
  hasSettings: true,
  warnings: ["Files of the Library are not moved by this version."],
};

export function createMockInstanceTransfer(emit: (event: AgentEvent) => void): MockInstanceTransfer {
  let existing = new Set(DEMO_AGENTS.map((agent) => agent.name));
  let nextFile: Omit<TransferPreview, "token"> | null = structuredClone(DEMO_FILE);
  let cancelExport = false;
  let counter = 0;
  let restartPending = false;
  let updateStatus: UpdateStatus = {
    phase: "up-to-date",
    currentVersion: "0.0.0-demo",
    availableVersion: null,
    progress: null,
    checkedAt: "2026-11-17T08:00:00.000Z",
    message: null,
  };
  let preferences: UpdatePreferences = { ...DEFAULT_UPDATE_PREFERENCES };
  const staged = new Map<string, Omit<TransferPreview, "token">>();

  const copyName = (name: string): string => {
    if (!existing.has(name)) return name;
    for (let number = 2; ; number += 1) {
      const candidate = `${name} (imported ${number})`;
      if (!existing.has(candidate)) return candidate;
    }
  };

  const transfer: Required<InstanceTransferDesktopApi> = {
    summary: async (): Promise<InstanceTransferSummary> => ({
      agents: structuredClone(DEMO_AGENTS),
      capabilities: { settings: true, files: false, history: false },
    }),
    exportAgents: async (input): Promise<ExportInstanceResult> => {
      const request = parseExportInstanceInput(input);
      if (cancelExport) {
        cancelExport = false;
        return { status: "cancelled" };
      }
      for (const id of request.agentIds) {
        if (!DEMO_AGENTS.some((agent) => agent.id === id)) throw new Error("One of the agents does not exist.");
      }
      return {
        status: "saved",
        fileName: "cosgral-transfer-demo.zip",
        bytes: 1024 * (request.agentIds.length + 1),
        agents: request.agentIds.length,
        warnings: [],
      };
    },
    choose: async () => {
      const file = nextFile;
      nextFile = structuredClone(DEMO_FILE);
      if (file === null) return null;
      counter += 1;
      const token = `staged-${counter}`;
      const preview = structuredClone(file);
      preview.agents = preview.agents.map((agent) => ({ ...agent, nameTaken: existing.has(agent.name) }));
      staged.set(token, preview);
      return { token, ...structuredClone(preview) };
    },
    apply: async (input): Promise<ApplyTransferResult> => {
      const request = parseApplyTransferInput(input);
      const file = staged.get(request.token);
      if (!file) throw new Error("That file is no longer staged. Choose it again.");
      staged.delete(request.token);
      const agents: ApplyTransferResult["agents"] = [];
      const skipped: ApplyTransferResult["skipped"] = [];
      const warnings: string[] = [];
      for (const agent of file.agents) {
        if (!request.keys.includes(agent.key)) {
          skipped.push({ key: agent.key, reason: "unselected" });
          continue;
        }
        const name = copyName(agent.name);
        existing.add(name);
        agents.push({ key: agent.key, id: `imported-${agent.key}`, name });
        if (agent.routineNames.length > 0)
          warnings.push(`${agent.name}: ${agent.routineNames.length} routine(s) were created paused.`);
      }
      return { agents, skipped, warnings, settingsApplied: request.includeSettings && file.hasSettings };
    },
    discard: async (input) => {
      staged.delete(parseDiscardTransferInput(input).token);
    },
    importSources: async (): Promise<ImportSourceInfo[]> => importSourceCards(),
  };

  const overview = (): UpdatesOverview =>
    buildUpdatesOverview({ preferences, status: { ...updateStatus }, restartPending });
  const updates: Required<UpdatePreferencesDesktopApi> = {
    getOverview: async () => overview(),
    restartWhenIdle: async () => {
      if (updateStatus.phase !== "ready") throw new Error("No update has been downloaded yet.");
      restartPending = true;
      emit({ type: "update-preferences-changed", preferences: { ...preferences } });
      return overview();
    },
    cancelRestartWhenIdle: async () => {
      restartPending = false;
      emit({ type: "update-preferences-changed", preferences: { ...preferences } });
      return overview();
    },
    get: async () => ({ ...preferences }),
    set: async (input) => {
      preferences = mergeUpdatePreferences(preferences, parseSetUpdatePreferencesInput(input));
      emit({ type: "update-preferences-changed", preferences: { ...preferences } });
      return { ...preferences };
    },
  };

  return {
    transfer,
    updates,
    simulate: {
      /** The update status the page shows (phase, versions); a change clears a pending restart when the update is no longer ready. */
      updateStatus: (change) => {
        updateStatus = { ...updateStatus, ...change };
        if (updateStatus.phase !== "ready") restartPending = false;
        emit({ type: "update-preferences-changed", preferences: { ...preferences } });
      },
      nextFile: (preview) => {
        nextFile = preview === null ? null : structuredClone(preview);
      },
      cancelNextExport: () => {
        cancelExport = true;
      },
      existingNames: (names) => {
        existing = new Set(names);
      },
    },
  };
}
