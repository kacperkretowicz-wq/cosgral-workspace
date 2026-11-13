import type { AgentMcpServerSetting, McpServer } from "@openbot/contracts/ipc";
import { createSignal, onSettled, Show } from "solid-js";
import { McpPanel } from "./McpPanel";
export function McpSettings(props: { botId?: string }) {
  const [servers, setServers] = createSignal<McpServer[]>([]);
  const [settings, setSettings] = createSignal<AgentMcpServerSetting[]>([]);
  const [error, setError] = createSignal("");
  let serial = 0;
  async function refresh() {
    const api = window.openbot.mcp;
    if (!api) {
      setError("MCP is unavailable in this build.");
      return;
    }
    const n = ++serial;
    try {
      const [list, agents] = await Promise.all([
        api.list(),
        props.botId ? api.listAgentSettings(props.botId) : Promise.resolve([]),
      ]);
      if (n === serial) {
        setServers(list);
        setSettings(agents);
        setError("");
      }
    } catch (e) {
      if (n === serial) setError(String(e));
    }
  }
  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "MCP action failed.");
    }
  }
  onSettled(() => {
    void refresh();
    if (!window.openbot.mcp) return;
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "mcp-servers-changed" || (event.type === "agent-mcp-changed" && event.botId === props.botId))
        void refresh();
    });
    return () => {
      serial++;
      off();
    };
  });
  return (
    <>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <McpPanel
        servers={servers()}
        settings={settings()}
        agent={!!props.botId}
        onAdd={(input) => void run(() => window.openbot.mcp!.add(input))}
        onRemove={(serverId) => void run(() => window.openbot.mcp!.remove({ serverId }))}
        onReconnect={(serverId) => void run(() => window.openbot.mcp!.reconnect({ serverId }))}
        onToggle={(serverId, enabled) =>
          void run(() => window.openbot.mcp!.setAgentEnabled({ botId: props.botId!, serverId, enabled }))
        }
      />
    </>
  );
}
