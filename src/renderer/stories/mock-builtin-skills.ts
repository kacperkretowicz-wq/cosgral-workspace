// COSGRAL: demo of the built-in skills for Storybook and the dev app (three sets, in memory, no files, no program check).

import type { AgentEvent, BuiltinSkillPack, BuiltinSkillPackId, BuiltinSkillsDesktopApi } from "@openbot/contracts/ipc";

interface Seed {
  pack: Omit<BuiltinSkillPack, "installedBotIds" | "partialBotIds">;
  installed: string[];
}

export interface MockBuiltinSkills {
  api: BuiltinSkillsDesktopApi;
  /** Plays "the program was installed" for graphify. */
  simulate: { programFound: (found: boolean) => void };
}

function skills(names: Array<[string, string]>): BuiltinSkillPack["skills"] {
  return names.map(([name, description]) => ({ name, description, skillId: `skill-${name}`, state: "ready" }));
}

export function createMockBuiltinSkills(
  emit: (event: AgentEvent) => void,
  deps: { botIds: () => string[] },
): MockBuiltinSkills {
  let programFound = false;
  const seeds: Seed[] = [
    {
      installed: [],
      pack: {
        id: "superpowers",
        title: "Superpowers",
        summary:
          "A set of working habits for agents: plan first, write the test first, check the result before saying it is done.",
        whenToUse:
          "Works by itself. When you start something new, the agent first asks what you need, then writes a plan, works step by step and checks each step.",
        license: "MIT",
        sourceUrl: "https://github.com/obra/superpowers",
        sourceVersion: "7.0.2",
        skills: skills([
          ["brainstorming", "Use this before any creative work."],
          ["writing-plans", "Use when you have a spec for a multi-step task."],
          ["systematic-debugging", "Use when you meet any bug or failing test."],
        ]),
        defaultForNewAgents: true,
        program: null,
      },
    },
    {
      installed: [],
      pack: {
        id: "i-have-adhd",
        title: "I have ADHD",
        summary:
          "The agent writes for a person with ADHD: the next step comes first, steps are short and numbered, and times are given in minutes.",
        whenToUse:
          "Write /i-have-adhd in the chat to turn it on. It stays on until you write: stop adhd mode. It does nothing until you turn it on.",
        license: "MIT",
        sourceUrl: "https://github.com/ayghri/i-have-adhd",
        sourceVersion: "0.4.1",
        skills: skills([["i-have-adhd", "Shape output for a reader with ADHD."]]),
        defaultForNewAgents: true,
        program: null,
      },
    },
    {
      installed: [],
      pack: {
        id: "graphify",
        title: "Graphify",
        summary:
          "Turns a project folder into a map of how its parts connect, so the agent can ask the map instead of reading every file.",
        whenToUse:
          "Write /graphify in the chat. It needs the graphify program on this computer; install it once with the command below.",
        license: "Apache-2.0",
        sourceUrl: "https://github.com/Graphify-Labs/graphify",
        sourceVersion: "0.9.120",
        skills: skills([["graphify", "Turn any folder of files into a knowledge graph."]]),
        defaultForNewAgents: false,
        program: { command: "graphify", installCommand: "uv tool install graphifyy", found: false },
      },
    },
  ];
  const view = (): BuiltinSkillPack[] =>
    seeds.map((seed) => {
      const known = new Set(deps.botIds());
      return {
        ...structuredClone(seed.pack),
        installedBotIds: seed.installed.filter((id) => known.has(id)),
        partialBotIds: [],
        program: seed.pack.program ? { ...seed.pack.program, found: programFound } : null,
      };
    });
  const seedOf = (id: BuiltinSkillPackId): Seed => {
    const seed = seeds.find((item) => item.pack.id === id);
    if (!seed) throw new Error("Unknown built-in skill pack.");
    return seed;
  };
  return {
    api: {
      list: async () => view(),
      apply: async ({ packId, botIds, enabled }) => {
        const seed = seedOf(packId);
        const changing = new Set(botIds);
        seed.installed = enabled
          ? [...new Set([...seed.installed, ...botIds])]
          : seed.installed.filter((id) => !changing.has(id));
        emit({ type: "skill-installs-changed", installs: [] });
        return view();
      },
      setDefault: async ({ packId, enabled }) => {
        seedOf(packId).pack.defaultForNewAgents = enabled;
        return view();
      },
    },
    simulate: {
      programFound: (found) => {
        programFound = found;
      },
    },
  };
}
