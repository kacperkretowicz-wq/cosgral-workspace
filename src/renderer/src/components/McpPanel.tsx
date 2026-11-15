import type { AddMcpServerInput, AgentMcpServerSetting, McpServer } from "@openbot/contracts/ipc";
import { isOneOf } from "@openbot/contracts/runtime-values";
import { createSignal, For, Show } from "solid-js";
import { Button, Input, NativeSelect, Textarea } from "./ui";

const MCP_TRANSPORTS = ["stdio", "http"] as const;

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
                  <Button unstyled type="button" onClick={() => props.onReconnect(server.id)}>
                    Reconnect
                  </Button>{" "}
                  <Button
                    unstyled
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remove ${server.name} for all agents?`)) props.onRemove(server.id);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              }
            >
              <label>
                <Input
                  unstyled
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
          <Input unstyled aria-label="Server name" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label>
          Transport
          <NativeSelect
            unstyled
            aria-label="Transport"
            value={transport()}
            onChange={(e) => {
              const value = e.currentTarget.value;
              if (isOneOf(MCP_TRANSPORTS, value)) setTransport(value);
            }}
          >
            <option value="stdio">stdio</option>
            <option value="http">HTTP</option>
          </NativeSelect>
        </label>
        <Show
          when={transport() === "stdio"}
          fallback={
            <label>
              URL
              <Input unstyled aria-label="URL" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} />
            </label>
          }
        >
          <label>
            Command
            <Input unstyled value={command()} onInput={(e) => setCommand(e.currentTarget.value)} />
          </label>
          <label>
            Arguments (one per line)
            <Textarea unstyled value={args()} onInput={(e) => setArgs(e.currentTarget.value)} />
          </label>
        </Show>
        <label>
          Secret name
          <Input
            unstyled
            aria-label="Secret name"
            value={secretName()}
            onInput={(e) => setSecretName(e.currentTarget.value)}
          />
        </label>
        <label>
          Secret value
          <Input
            unstyled
            aria-label="Secret value"
            type="password"
            value={secretValue()}
            onInput={(e) => setSecretValue(e.currentTarget.value)}
          />
        </label>
        <Button
          unstyled
          type="button"
          onClick={() => {
            if (!secretName().trim()) return;
            setSecrets((old) => ({ ...old, [secretName().trim()]: secretValue() }));
            setSecretName("");
            setSecretValue("");
          }}
        >
          Add secret field
        </Button>
        <Show when={Object.keys(secrets()).length}>
          <p>Ready: {Object.keys(secrets()).join(", ")}</p>
        </Show>
        <Button
          unstyled
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
        </Button>
      </Show>
    </section>
  );
}
