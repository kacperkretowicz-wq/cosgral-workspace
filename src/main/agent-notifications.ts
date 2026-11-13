import {
  type AgentEvent,
  type BotSummary,
  defaultNotificationPreferences,
  type NotificationEvent,
  type NotificationPreferences,
} from "@openbot/contracts/ipc";

export interface AgentNotificationContent {
  title: string;
  body: string;
  /** COSGRAL W3: false plays the system sound (the "sound" column of the matrix). */
  silent: boolean;
}

const BODIES: Record<NotificationEvent, string> = {
  finished: "Finished working.",
  failed: "Stopped with an error.",
  "needs-input": "Needs your input.",
  "needs-approval": "Needs your approval.",
  takeover: "Asks you to take over the browser.",
  "channel-result": "Returned a result in a channel.",
};

/** COSGRAL W3: which matrix row an agent event belongs to, and which agent it is about. */
function classify(event: AgentEvent): { kind: NotificationEvent; botId: string } | null {
  switch (event.type) {
    case "turn-completed":
      if (event.status === "completed") return { kind: "finished", botId: event.botId };
      if (event.status === "failed") return { kind: "failed", botId: event.botId };
      return null;
    case "prompt":
      return { kind: "needs-input", botId: event.botId };
    case "vault-request":
      return { kind: "needs-input", botId: event.request.botId };
    case "approval":
      return { kind: "needs-approval", botId: event.approval.botId };
    case "draft-preview":
      return { kind: "needs-approval", botId: event.card.botId };
    case "browser-takeover":
      return { kind: "takeover", botId: event.request.botId };
    case "channel-message":
      return event.message.kind === "result" && event.message.authorBotId
        ? { kind: "channel-result", botId: event.message.authorBotId }
        : null;
    default:
      return null;
  }
}

export function notificationForAgentEvent(
  event: AgentEvent,
  bots: BotSummary[],
  preferences: NotificationPreferences = defaultNotificationPreferences(),
): AgentNotificationContent | null {
  const found = classify(event);
  if (!found) return null;
  const bot = bots.find((candidate) => candidate.id === found.botId);
  if (!bot?.notifications) return null;
  const row = preferences.matrix[found.kind];
  if (!row.desktop) return null;
  return { title: bot.name, body: BODIES[found.kind], silent: !row.sound };
}
