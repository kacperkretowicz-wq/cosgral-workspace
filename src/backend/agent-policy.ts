// COSGRAL W12 (BE-E): where the server settings and the per-agent choices reach the agents.
//   * `policyInstructions`: lines added to the instructions the agent gets when its thread starts or resumes (memory review, skill
//     learning, plan before long tasks, commit co-author, new chats, learning from browsing). Only lines that apply are added.
//   * `turnLimitReached`: the "threads at the same time" limit of the server (null = no limit).
// Pure functions: agent-service.ts only asks them (a port), it does not know the settings.

import type { AgentPreferences, ServerSettings } from "@openbot/contracts/ipc";

export function policyInstructions(server: ServerSettings, agent: AgentPreferences): string {
  const { general, agents } = server;
  const lines: string[] = [];
  if (general.memoryReviewEvery > 0) {
    lines.push(
      `Memory review: about every ${general.memoryReviewEvery} turns, quietly save the lasting facts of this conversation with your memory tool.`,
    );
  }
  if (general.skillLearning === "auto") {
    lines.push("When you work out a reusable procedure, save it as a skill with your skills tool.");
  } else if (general.skillLearning === "ask") {
    lines.push("When you work out a reusable procedure, ask the person before you save it as a skill.");
  } else {
    lines.push("Do not create skills on your own.");
  }
  if (general.learnFromBrowsing) {
    lines.push(
      "While the person drives your browser you may learn how the sites and buttons work, never the text they type.",
    );
  }
  if (agents.showPlanBeforeLongTasks) lines.push("Before a long task, show your plan first and then start.");
  if (agents.mentionInCommits) {
    lines.push(
      "When you make a git commit, name COSGRAL Workspace as co-author in the message; the person stays the author.",
    );
  }
  if (agent.agentStartsNewChats || agents.agentStartsNewChats) {
    lines.push(
      "When this chat gets very long you may suggest a new chat. Save your notes to memory first and tell the person.",
    );
  }
  return lines.join("\n");
}

export function turnLimitReached(running: number, max: number | null): boolean {
  return max !== null && running >= max;
}

/** What the program asks of the settings (see `useAgentPolicy` in agent-service.ts). */
export interface AgentPolicyPort {
  /** Most turns that run at the same time on this computer; null = no limit. */
  maxTurns: () => number | null;
  /** Extra lines for the instructions of an agent (see `policyInstructions`); "" = none. */
  instructions: (botId: string) => string;
  /** A short "got it" is shown at once when a message arrives while the agent works. */
  quickAcknowledgement: (botId: string) => boolean;
}
