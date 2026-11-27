import type { AgentMcpServerSetting, McpServer } from "@openbot/contracts/ipc";
import { createSignal, onSettled, Show } from "solid-js";
import { errorText } from "../errors";
import { t } from "../i18n";
import { McpPanel } from "./McpPanel";
import { McpSignInPanel } from "./McpSignInPanel";
export function McpSettings(props: { botId?: string }) {
  function mcpApi() {
    const api = window.openbot.mcp;
    if (!api) throw new Error(t("MCP is unavailable in this build."));
    return api;
  }
  function agentBotId(): string {
    const botId = props.botId;
    if (!botId) throw new Error(t("No agent selected."));
    return botId;
  }
  const [servers, setServers] = createSignal<McpServer[]>([]);
  const [settings, setSettings] = createSignal<AgentMcpServerSetting[]>([]);
  const [error, setError] = createSignal("");
  let serial = 0;
  async function refresh() {
    const api = window.openbot.mcp;
    if (!api) {
      setError(t("MCP is unavailable in this build."));
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
      setError(errorText(e, t("MCP action failed.")));
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
        onAdd={(input) => void run(() => mcpApi().add(input))}
        onRemove={(serverId) => void run(() => mcpApi().remove({ serverId }))}
        onReconnect={(serverId) => void run(() => mcpApi().reconnect({ serverId }))}
        onToggle={(serverId, enabled) =>
          void run(() => mcpApi().setAgentEnabled({ botId: agentBotId(), serverId, enabled }))
        }
      />
      {/* Signing in is a property of the server, not of one agent: show it once, in the global list. */}
      <Show when={!props.botId}>
        <McpSignInPanel />
      </Show>
    </>
  );
}
