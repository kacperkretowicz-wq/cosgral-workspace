import type { AgentDesktopApi, ConversationReadState } from "@openbot/contracts/ipc";
/** Read a fresh boundary: a background agent may not have its messages loaded in App yet. */
export async function markSidebarConversationRead(
  api: Pick<AgentDesktopApi, "readConversation" | "markConversationRead">,
  botId: string,
  isCurrent: () => boolean = () => true,
): Promise<ConversationReadState> {
  const snapshot = await api.readConversation(botId);
  if (!isCurrent()) throw new Error("The active server changed. Try again.");
  if (snapshot.botId !== botId) throw new Error("The conversation changed. Try again.");
  return api.markConversationRead({ botId, throughMessageId: snapshot.messages.at(-1)?.id ?? null });
}
