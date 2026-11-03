import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectConversationPresence } from "@paperclipai/shared";
import { buildSameOriginWebSocketUrl } from "../lib/websocket-url";
import { tryCreateWebSocket } from "../lib/websocket";

type PresentUser = ProjectConversationPresence["users"][number];

/** Dedicated project subscription on the existing authenticated live-events endpoint. */
export function useProjectConversationPresence(companyId: string, projectId: string, enabled: boolean) {
  const [users, setUsers] = useState<PresentUser[]>([]);
  const [connected, setConnected] = useState(false);
  const socket = useRef<WebSocket | null>(null);
  const lastTyping = useRef(-Infinity);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopTyping = useCallback(() => {
    clearTimeout(stopTimer.current);
    if (socket.current?.readyState === 1) socket.current.send(JSON.stringify({ type: "typing", active: false }));
    lastTyping.current = -Infinity;
  }, []);
  const typing = useCallback((active: boolean) => {
    if (!active) { stopTyping(); return; }
    const ws = socket.current;
    if (ws?.readyState !== 1) return;
    if (Date.now() - lastTyping.current >= 1500) {
      ws.send(JSON.stringify({ type: "typing", active: true }));
      lastTyping.current = Date.now();
    }
    clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(stopTyping, 4500);
  }, [stopTyping]);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    let backoff = 1000;
    const connect = () => {
      const url = new URL(buildSameOriginWebSocketUrl(`/api/companies/${encodeURIComponent(companyId)}/events/ws`));
      url.searchParams.set("projectConversation", projectId);
      const ws = tryCreateWebSocket(url.toString());
      socket.current = ws;
      if (!ws) { retry = setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 15000); return; }
      ws.onmessage = event => {
        if (disposed) return;
        try {
          const frame = JSON.parse(event.data);
          if (frame.type !== "project.conversation.presence" || frame.companyId !== companyId || frame.projectId !== projectId || !Array.isArray(frame.users)) return;
          if (!frame.users.every((user: PresentUser) => typeof user.userId === "string" && Number.isFinite(user.typingUntil))) return;
          setUsers(frame.users); setConnected(true); backoff = 1000;
        } catch { /* Ignore malformed frames. */ }
      };
      ws.onerror = () => ws.close();
      ws.onclose = event => {
        if (disposed) return;
        socket.current = null; setUsers([]); setConnected(false);
        clearTimeout(stopTimer.current); lastTyping.current = -Infinity;
        if (event.code !== 1008) { retry = setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 15000); }
      };
    };
    connect();
    return () => { disposed = true; clearTimeout(retry); clearTimeout(stopTimer.current); socket.current?.close(); socket.current = null; setUsers([]); setConnected(false); };
  }, [companyId, projectId, enabled]);
  useEffect(() => {
    const next = Math.min(...users.map(user => user.typingUntil).filter(time => time > Date.now()));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => setUsers(current => current.map(user => ({ ...user, typingUntil: user.typingUntil <= Date.now() ? 0 : user.typingUntil }))), next - Date.now() + 1);
    return () => clearTimeout(timer);
  }, [users]);
  return { users, connected, typing, stopTyping };
}
