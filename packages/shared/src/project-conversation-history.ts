/** Classification depends on stored provenance, never on keywords in message text. */
export type ConversationFilter = "all" | "humans" | "coordinator" | "agents" | "tasks" | "errors";
export type ConversationEntryKind = "comment" | "task" | "error" | "approval";
export interface ConversationEntry {
  id: string;
  kind: ConversationEntryKind;
  issueId: string;
  createdAt: string;
  body: string;
  authorType?: string | null;
  authorAgentId?: string | null;
  authorUserId?: string | null;
  recipientAgentId?: string | null;
  messageKind?: "audit";
  category?: Exclude<ConversationFilter, "all">;
}
export function classifyConversationEntry(entry: Pick<ConversationEntry, "kind" | "authorType" | "authorAgentId" | "authorUserId" | "recipientAgentId" | "messageKind">, coordinatorId?: string | null): Exclude<ConversationFilter, "all"> {
  if (entry.kind === "error" || entry.authorType === "system" || entry.messageKind === "audit") return "errors";
  if (entry.kind === "task" || entry.kind === "approval") return "tasks";
  if (entry.authorAgentId) return entry.recipientAgentId || entry.authorAgentId !== coordinatorId ? "agents" : "coordinator";
  return "humans";
}
export interface ConversationHistoryPage { entries: ConversationEntry[]; nextCursor: string | null }
