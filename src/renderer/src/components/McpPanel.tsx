import type { AddMcpServerInput, AgentMcpServerSetting, McpServer } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
export function McpPanel(props: {
  servers: McpServer[];
  settings: AgentMcpServerSetting[];
  agent?: boolean;
  onAdd: (input: AddMcpServerInput) => void;
  onRemove: (id: string) => void;
  onReconnect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const [name, setName] = createSignal("");
  const [transport, setTransport] = createSignal<"stdio" | "http">("stdio");
  const [command, setCommand] = createSignal("");
  const [args, setArgs] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [secretName, setSecretName] = createSignal("");
  const [secretValue, setSecretValue] = createSignal("");
  const [secrets, setSecrets] = createSignal<Record<string, string>>({});
  return (
    <section class="w2-panel" aria-label={props.agent ? "Agent MCP servers" : "MCP servers"}>
      <h3>{props.agent ? "Agent MCP servers" : "MCP servers"}</h3>
      <For each={props.servers}>
        {(server) => (
          <article class="w2-item">
            <strong>{server.name}</strong>
            <p>
              {server.status}
              {server.errorMessage ? ` · ${server.errorMessage}` : ""}
            </p>
            <p>{server.tools.map((tool) => tool.name).join(", ") || "No tools"}</p>
            <Show when={server.secretNames.length}>
              <small>Secret names: {server.secretNames.join(", ")}</small>
            </Show>
            <Show
              when={props.agent}
              fallback={
                <div>
                  <button type="button" onClick={() => props.onReconnect(server.id)}>
                    Reconnect
                  </button>{" "}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remove ${server.name} for all agents?`)) props.onRemove(server.id);
                    }}
                  >
                    Remove
                  </button>
                </div>
              }
            >
              <label>
                <input
                  type="checkbox"
                  checked={props.settings.find((setting) => setting.serverId === server.id)?.enabled ?? true}
                  onChange={(e) => props.onToggle(server.id, e.currentTarget.checked)}
                />{" "}
                Enabled for this agent
              </label>
            </Show>
          </article>
        )}
      </For>
      <Show when={!props.agent}>
        <h4>Add server</h4>
        <label>
          Server name
          <input aria-label="Server name" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label>
          Transport
          <select
            aria-label="Transport"
            value={transport()}
            onChange={(e) => setTransport(e.currentTarget.value as "stdio" | "http")}
          >
            <option value="stdio">stdio</option>
            <option value="http">HTTP</option>
          </select>
        </label>
        <Show
          when={transport() === "stdio"}
          fallback={
            <label>
              URL
              <input aria-label="URL" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} />
            </label>
          }
        >
          <label>
            Command
            <input value={command()} onInput={(e) => setCommand(e.currentTarget.value)} />
          </label>
          <label>
            Arguments (one per line)
            <textarea value={args()} onInput={(e) => setArgs(e.currentTarget.value)} />
          </label>
        </Show>
        <label>
          Secret name
          <input aria-label="Secret name" value={secretName()} onInput={(e) => setSecretName(e.currentTarget.value)} />
        </label>
        <label>
          Secret value
          <input
            aria-label="Secret value"
            type="password"
            value={secretValue()}
            onInput={(e) => setSecretValue(e.currentTarget.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            if (!secretName().trim()) return;
            setSecrets((old) => ({ ...old, [secretName().trim()]: secretValue() }));
            setSecretName("");
            setSecretValue("");
          }}
        >
          Add secret field
        </button>
        <Show when={Object.keys(secrets()).length}>
          <p>Ready: {Object.keys(secrets()).join(", ")}</p>
        </Show>
        <button
          type="button"
          onClick={() => {
            const values = { ...secrets(), ...(secretName().trim() ? { [secretName().trim()]: secretValue() } : {}) };
            props.onAdd({
              name: name().trim(),
              transport: transport(),
              ...(transport() === "stdio"
                ? { command: command().trim(), args: args().split("\n").filter(Boolean) }
                : { url: url().trim() }),
              secrets: Object.keys(values).length ? values : undefined,
            });
            setSecretValue("");
            setSecretName("");
            setSecrets({});
          }}
        >
          Add server
        </button>
      </Show>
    </section>
  );
}
