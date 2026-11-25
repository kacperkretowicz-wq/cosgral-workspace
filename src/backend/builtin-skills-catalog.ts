// COSGRAL: the built-in skills. The files live in `resources/builtin-skills/<folder>/skills/<name>/` and are copies of
// the public sources (see each folder's SOURCE.md and LICENSE). Raise `bundleVersion` when the copied files change: the
// library then gets a new version of those skills (copies that agents already have keep theirs until they update).

import type { BuiltinSkillPackId } from "@openbot/contracts/ipc";

export interface BuiltinPackSpec {
  id: BuiltinSkillPackId;
  /** Texts are English here; the window shows the Polish ones from its dictionary. */
  title: string;
  summary: string;
  whenToUse: string;
  license: string;
  sourceUrl: string;
  sourceVersion: string;
  bundleVersion: number;
  /** Folder under the built-in skills root. */
  folder: string;
  /** Whether new agents get the pack until the person changes it. */
  defaultForNewAgents: boolean;
  /** A program outside the app that the skill needs. */
  program: { command: string; installCommand: string } | null;
}

export const BUILTIN_PACKS: readonly BuiltinPackSpec[] = [
  {
    id: "superpowers",
    title: "Superpowers",
    summary:
      "A set of working habits for agents: plan first, write the test first, check the result before saying it is done.",
    whenToUse:
      "Works by itself. When you start something new, the agent first asks what you need, then writes a plan, works step by step and checks each step.",
    license: "MIT",
    sourceUrl: "https://github.com/obra/superpowers",
    sourceVersion: "7.0.2",
    bundleVersion: 1,
    folder: "superpowers",
    defaultForNewAgents: true,
    program: null,
  },
  {
    id: "i-have-adhd",
    title: "I have ADHD",
    summary:
      "The agent writes for a person with ADHD: the next step comes first, steps are short and numbered, and times are given in minutes.",
    whenToUse:
      "Write /i-have-adhd in the chat to turn it on. It stays on until you write: stop adhd mode. It does nothing until you turn it on.",
    license: "MIT",
    sourceUrl: "https://github.com/ayghri/i-have-adhd",
    sourceVersion: "0.4.1",
    bundleVersion: 1,
    folder: "i-have-adhd",
    defaultForNewAgents: true,
    program: null,
  },
  {
    id: "graphify",
    title: "Graphify",
    summary:
      "Turns a project folder into a map of how its parts connect, so the agent can ask the map instead of reading every file.",
    whenToUse:
      "Write /graphify in the chat. It needs the graphify program on this computer; install it once with the command below.",
    license: "Apache-2.0",
    sourceUrl: "https://github.com/Graphify-Labs/graphify",
    sourceVersion: "0.9.120",
    bundleVersion: 1,
    folder: "graphify",
    defaultForNewAgents: false,
    program: { command: "graphify", installCommand: "uv tool install graphifyy" },
  },
];
