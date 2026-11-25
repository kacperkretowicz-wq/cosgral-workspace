import type { AddMcpServerInput, AgentMcpServerSetting, McpServer } from "@openbot/contracts/ipc";
import { isOneOf } from "@openbot/contracts/runtime-values";
import { createSignal, For, Show } from "solid-js";
import { t } from "../i18n";
import { PanelHeading } from "./PanelHeading";
import { Button, Input, NativeSelect, Textarea } from "./ui";
import { Plug, Server } from "./ui/icons";

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
    <section class="w2-panel" aria-label={props.agent ? t("Agent MCP servers") : t("MCP servers")}>
      <PanelHeading level="h3" icon={Plug} tint="pink">
        {props.agent ? t("Agent MCP servers") : t("MCP servers")}
      </PanelHeading>
      <For each={props.servers}>
        {(server) => (
          <article class="w2-item">
            <span class="w2-item-icon" data-status={server.status} aria-hidden="true">
              <Server size={18} stroke-width={1.5} />
            </span>
            <strong>{server.name}</strong>
            <p>
              {server.status}
              {server.errorMessage ? ` · ${server.errorMessage}` : ""}
            </p>
            <p>{server.tools.map((tool) => tool.name).join(", ") || t("No tools")}</p>
            <Show when={server.secretNames.length}>
              <small>{t("Secret names: {names}", { names: server.secretNames.join(", ") })}</small>
            </Show>
            <Show
              when={props.agent}
              fallback={
                <div class="w2-item-actions">
                  <Button unstyled type="button" onClick={() => props.onReconnect(server.id)}>
                    {t("Reconnect")}
                  </Button>{" "}
                  <Button
                    unstyled
                    type="button"
                    onClick={() => {
                      if (window.confirm(t("Remove {name} for all agents?", { name: server.name })))
                        props.onRemove(server.id);
                    }}
                  >
                    {t("Remove")}
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
                {t("Enabled for this agent")}
              </label>
            </Show>
          </article>
        )}
      </For>
      <Show when={!props.agent}>
        <h4>{t("Add server")}</h4>
        <label>
          {t("Server name")}
          <Input
            unstyled
            aria-label={t("Server name")}
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </label>
        <label>
          {t("Transport")}
          <NativeSelect
            unstyled
            aria-label={t("Transport")}
            value={transport()}
            onChange={(e) => {
              const value = e.currentTarget.value;
              if (isOneOf(MCP_TRANSPORTS, value)) setTransport(value);
            }}
          >
            <option value="stdio">{t("Local program (stdio)")}</option>
            <option value="http">{t("Server on the internet (HTTP)")}</option>
          </NativeSelect>
        </label>
        <p class="mcp-hint">
          {transport() === "stdio"
            ? t(
                "The app starts this program on your computer. Type the command, for example npx, and its arguments below.",
              )
            : t("The server already runs somewhere else. Type its address.")}
        </p>
        <Show
          when={transport() === "stdio"}
          fallback={
            <label>
              {t("URL")}
              <Input unstyled aria-label={t("URL")} value={url()} onInput={(e) => setUrl(e.currentTarget.value)} />
            </label>
          }
        >
          <label>
            {t("Command")}
            <Input unstyled value={command()} onInput={(e) => setCommand(e.currentTarget.value)} />
          </label>
          <label>
            {t("Arguments (one per line)")}
            <Textarea unstyled value={args()} onInput={(e) => setArgs(e.currentTarget.value)} />
          </label>
        </Show>
        <label>
          {t("Secret name")}
          <Input
            unstyled
            aria-label={t("Secret name")}
            value={secretName()}
            onInput={(e) => setSecretName(e.currentTarget.value)}
          />
        </label>
        <label>
          {t("Secret value")}
          <Input
            unstyled
            aria-label={t("Secret value")}
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
          {t("Add secret field")}
        </Button>
        <Show when={Object.keys(secrets()).length}>
          <p>{t("Ready: {list}", { list: Object.keys(secrets()).join(", ") })}</p>
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
          {t("Add server")}
        </Button>
      </Show>
    </section>
  );
}
