import type { AgentProviderId, QueueSnapshot, QueueSteerSupport } from "@openbot/contracts/ipc";

// COSGRAL W3: steering puts a queued message into the turn that is running now. It needs a `turn/steer` request:
// the Codex App Server and the Claude Agent SDK client (`claude-client.ts`) answer it; the ACP adapter
// (`acp-client.ts`) has no such request, so a message for an ACP agent waits for the turn to end.

const STEER_UNAVAILABLE_ACP = "This agent's provider (ACP) cannot take new input during a turn. The message goes next.";

export function steerSupport(provider: AgentProviderId): QueueSteerSupport {
  return provider === "acp" ? { available: false, reason: STEER_UNAVAILABLE_ACP } : { available: true, reason: null };
}

export function withSteerSupport(snapshot: QueueSnapshot, provider: AgentProviderId): QueueSnapshot {
  return { ...snapshot, steer: steerSupport(provider) };
}
