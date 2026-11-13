import type {
  AgentEvent,
  AgentMemory,
  AgentMemorySettings,
  ChannelMemory,
  LocalSkill,
  SkillInstall,
  McpServer,
  AgentMcpServerSetting,
  MemoryDesktopApi,
  SkillsDesktopApi,
  McpDesktopApi,
} from "@openbot/contracts/ipc";
export function createMockW2(emit: (event: AgentEvent) => void) {
  const now = () => new Date().toISOString();
  let counter = 0;
  let memories: AgentMemory[] = [
    {
      id: "m1",
      botId: "chief",
      text: "Prefers concise updates.",
      inclusion: "essential",
      createdAt: now(),
      updatedAt: now(),
    },
  ];
  let channelMemories: ChannelMemory[] = [
    { id: "cm1", channelId: "demo-channel", authorBotId: null, text: "The team meets on Monday.", createdAt: now() },
  ];
  const limits = new Map<string, number>();
  const settings = (botId: string): AgentMemorySettings => {
    const mine = memories.filter((item) => item.botId === botId);
    const essential = mine.filter((item) => item.inclusion === "essential");
    return {
      botId,
      maxMemories: limits.get(botId) ?? 512,
      customLimit: limits.has(botId),
      essentialCount: essential.length,
      searchableCount: mine.length - essential.length,
      essentialInPrompt: essential.length,
      essentialPromptBytes: new TextEncoder().encode(essential.map((item) => item.text).join("\n")).length,
    };
  };
  const memory: MemoryDesktopApi = {
    listAgentMemories: async ({ botId, inclusion }) =>
      structuredClone(memories.filter((item) => item.botId === botId && (!inclusion || item.inclusion === inclusion))),
    searchAgentMemories: async ({ botId, query }) =>
      structuredClone(
        memories.filter((item) => item.botId === botId && item.text.toLowerCase().includes(query.toLowerCase())),
      ),
    getAgentSettings: async (botId) => settings(botId),
    setAgentLimit: async ({ botId, maxMemories }) => {
      if (maxMemories === null) limits.delete(botId);
      else limits.set(botId, maxMemories);
      return settings(botId);
    },
    saveAgentMemory: async ({ botId, text, inclusion, memoryId }) => {
      const old = memories.find((item) => item.id === memoryId && item.botId === botId);
      if (!old && memories.filter((item) => item.botId === botId).length >= settings(botId).maxMemories)
        throw new Error("Memory limit reached.");
      const item: AgentMemory = {
        id: old?.id ?? `m-${++counter}`,
        botId,
        text,
        inclusion: inclusion ?? old?.inclusion ?? "searchable",
        createdAt: old?.createdAt ?? now(),
        updatedAt: now(),
      };
      memories = [...memories.filter((entry) => entry.id !== item.id), item];
      emit({ type: "agent-memory-changed", botId, action: "saved", memory: item });
      return structuredClone(item);
    },
    deleteAgentMemory: async ({ botId, memoryId }) => {
      const item = memories.find((entry) => entry.id === memoryId && entry.botId === botId);
      if (!item) throw new Error("Memory not found");
      memories = memories.filter((entry) => entry.id !== memoryId);
      emit({ type: "agent-memory-changed", botId, action: "deleted", memory: item });
    },
  };
  const channels = {
    listMemories: async (channelId: string) =>
      structuredClone(channelMemories.filter((item) => item.channelId === channelId)),
    saveMemory: async ({ channelId, text, memoryId }: { channelId: string; text: string; memoryId?: string }) => {
      if (text.length > 500) throw new Error("Memory exceeds 500 characters.");
      const old = channelMemories.find((item) => item.id === memoryId && item.channelId === channelId);
      const item: ChannelMemory = {
        id: old?.id ?? `cm-${++counter}`,
        channelId,
        authorBotId: null,
        text,
        createdAt: old?.createdAt ?? now(),
        updatedAt: now(),
      };
      channelMemories = [...channelMemories.filter((entry) => entry.id !== item.id), item];
      emit({ type: "channel-memory-changed", channelId, action: "saved", memory: item });
      return structuredClone(item);
    },
    deleteMemory: async ({ channelId, memoryId }: { channelId: string; memoryId: string }) => {
      const item = channelMemories.find((entry) => entry.id === memoryId && entry.channelId === channelId);
      if (!item) throw new Error("Memory not found");
      channelMemories = channelMemories.filter((entry) => entry.id !== memoryId);
      emit({ type: "channel-memory-changed", channelId, action: "deleted", memory: item });
    },
  };
  let library: LocalSkill[] = [
    {
      id: "skill-demo",
      name: "weekly-report",
      description: "Prepare a concise weekly report.",
      examplePrompt: null,
      version: 2,
      createdByBotId: null,
      createdAt: now(),
      updatedAt: now(),
      path: "demo/weekly-report",
    },
  ];
  let installs: SkillInstall[] = [
    {
      botId: "chief",
      skillId: "skill-demo",
      name: "weekly-report",
      installedVersion: 1,
      latestVersion: 2,
      updateAvailable: true,
      modifiedLocally: true,
      path: "demo/agent/weekly-report",
      installedAt: now(),
    },
  ];
  const find = (id: string) => {
    const item = library.find((s) => s.id === id);
    if (!item) throw new Error("Skill not found");
    return item;
  };
  const skills: SkillsDesktopApi = {
    list: async () => structuredClone(library),
    read: async ({ skillId, version }) => ({
      skill: structuredClone(find(skillId)),
      version: version ?? find(skillId).version,
      skillMd: "# Weekly report\nSummarise outcomes and next steps.",
      files: [{ path: "SKILL.md", bytes: 48 }],
    }),
    listVersions: async ({ skillId }) =>
      Array.from({ length: find(skillId).version }, (_, i) => ({
        skillId,
        version: i + 1,
        createdAt: now(),
        authorBotId: null,
        note: null,
        restoredFrom: null,
        contentHash: "demo",
        files: 1,
        bytes: 48,
      })),
    restoreVersion: async ({ skillId, version }) => {
      if (version > find(skillId).version) throw new Error("Version not found");
      const item = { ...find(skillId), version: find(skillId).version + 1 };
      library = library.map((s) => (s.id === skillId ? item : s));
      emit({ type: "skills-changed", skills: library });
      return structuredClone(item);
    },
    delete: async ({ skillId, force }) => {
      if (!force && installs.some((item) => item.skillId === skillId && item.modifiedLocally))
        throw new Error("A local copy has changes.");
      library = library.filter((item) => item.id !== skillId);
      installs = installs.filter((item) => item.skillId !== skillId);
      emit({ type: "skills-changed", skills: library });
    },
    listInstalls: async (input) =>
      structuredClone(installs.filter((item) => !input?.botId || item.botId === input.botId)),
    install: async ({ skillId, botId, version }) => {
      const skill = find(skillId);
      const item: SkillInstall = {
        botId,
        skillId,
        name: skill.name,
        installedVersion: version ?? skill.version,
        latestVersion: skill.version,
        updateAvailable: false,
        modifiedLocally: false,
        path: "demo/installed",
        installedAt: now(),
      };
      installs = [...installs.filter((entry) => entry.botId !== botId || entry.skillId !== skillId), item];
      emit({ type: "skill-installs-changed", installs });
      return structuredClone(item);
    },
    update: async ({ skillId, botId, overwriteLocalChanges }) => {
      const item = installs.find((entry) => entry.skillId === skillId && entry.botId === botId);
      if (!item) throw new Error("Installation not found");
      if (item.modifiedLocally && !overwriteLocalChanges) throw new Error("Local changes would be overwritten");
      const next = {
        ...item,
        installedVersion: find(skillId).version,
        latestVersion: find(skillId).version,
        updateAvailable: false,
        modifiedLocally: false,
      };
      installs = installs.map((entry) => (entry === item ? next : entry));
      emit({ type: "skill-installs-changed", installs });
      return structuredClone(next);
    },
    uninstall: async ({ skillId, botId }) => {
      installs = installs.filter((entry) => entry.skillId !== skillId || entry.botId !== botId);
      emit({ type: "skill-installs-changed", installs });
    },
  };
  let servers: McpServer[] = [
    {
      id: "mcp-demo",
      name: "example",
      transport: "stdio",
      command: "example-server",
      args: [],
      cwd: null,
      url: null,
      secretNames: [],
      status: "available",
      errorMessage: null,
      tools: [{ name: "lookup", description: "Find a demo item" }],
      createdAt: now(),
      updatedAt: now(),
    },
  ];
  let agentSettings: AgentMcpServerSetting[] = [];
  const mcp: McpDesktopApi = {
    list: async () => structuredClone(servers),
    add: async (input) => {
      const item: McpServer = {
        id: `mcp-${++counter}`,
        name: input.name,
        transport: input.transport,
        command: input.command ?? null,
        args: input.args ?? [],
        cwd: input.cwd ?? null,
        url: input.url ?? null,
        secretNames: Object.keys(input.secrets ?? {}),
        status: "checking",
        errorMessage: null,
        tools: [],
        createdAt: now(),
        updatedAt: now(),
      };
      servers = [...servers, item];
      emit({ type: "mcp-servers-changed", servers });
      return structuredClone(item);
    },
    update: async ({ serverId, secrets, ...input }) => {
      const old = servers.find((item) => item.id === serverId);
      if (!old) throw new Error("Server not found");
      const item = { ...old, ...input, secretNames: secrets ? Object.keys(secrets) : old.secretNames };
      servers = servers.map((server) => (server.id === serverId ? item : server));
      emit({ type: "mcp-servers-changed", servers });
      return structuredClone(item);
    },
    remove: async ({ serverId }) => {
      servers = servers.filter((item) => item.id !== serverId);
      emit({ type: "mcp-servers-changed", servers });
    },
    reconnect: async ({ serverId }) => {
      const item = servers.find((server) => server.id === serverId);
      if (!item) throw new Error("Server not found");
      return structuredClone(item);
    },
    listAgentSettings: async (botId) =>
      servers.map(
        (server) =>
          agentSettings.find((item) => item.botId === botId && item.serverId === server.id) ?? {
            botId,
            serverId: server.id,
            enabled: true,
          },
      ),
    setAgentEnabled: async (input) => {
      agentSettings = [
        ...agentSettings.filter((item) => item.botId !== input.botId || item.serverId !== input.serverId),
        input,
      ];
      const list = servers.map(
        (server) =>
          agentSettings.find((item) => item.botId === input.botId && item.serverId === server.id) ?? {
            botId: input.botId,
            serverId: server.id,
            enabled: true,
          },
      );
      emit({ type: "agent-mcp-changed", botId: input.botId, settings: list });
      return structuredClone(list);
    },
  };
  return { memory, channels, skills, mcp };
}
