/** Ephemeral, project-scoped WebSocket protocol; never persisted or replayed. */
export interface ProjectConversationPresence {
  type: "project.conversation.presence";
  companyId: string;
  projectId: string;
  users: Array<{ userId: string; typingUntil: number }>;
}
export interface ProjectConversationTyping {
  type: "typing";
  active: boolean;
}
