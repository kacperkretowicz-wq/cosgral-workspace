import type { AgentMemory, AgentMemorySettings, ChannelMemory } from "@openbot/contracts/ipc";
import { createSignal, onSettled, Show } from "solid-js";
import { MemoryPanel } from "./MemoryPanel";

export function AgentMemorySettingsView(props: { botId: string }) {
  const [items, setItems] = createSignal<AgentMemory[]>([]);
  const [settings, setSettings] = createSignal<AgentMemorySettings>();
  const [query, setQuery] = createSignal("");
  const [error, setError] = createSignal("");
  let request = 0;
  async function refresh() {
    const api = window.openbot.memory;
    if (!api) {
      setError("Memory is unavailable in this build.");
      return;
    }
    const serial = ++request;
    try {
      const [list, next] = await Promise.all([
        query().trim()
          ? api.searchAgentMemories({ botId: props.botId, query: query() })
          : api.listAgentMemories({ botId: props.botId }),
        api.getAgentSettings(props.botId),
      ]);
      if (serial === request) {
        setItems(list);
        setSettings(next);
        setError("");
      }
    } catch (e) {
      if (serial === request) setError(e instanceof Error ? e.message : "Could not load memory.");
    }
  }
  onSettled(() => {
    void refresh();
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "agent-memory-changed" && event.botId === props.botId) void refresh();
    });
    return () => {
      request++;
      off();
    };
  });
  return (
    <>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <MemoryPanel
        entries={items()}
        settings={settings()}
        onSearch={(value) => {
          setQuery(value);
          void refresh();
        }}
        onSave={async (text, inclusion, memoryId) => {
          const api = window.openbot.memory;
          if (!api) throw new Error("Memory unavailable");
          await api.saveAgentMemory({ botId: props.botId, text, inclusion, memoryId });
          await refresh();
        }}
        onDelete={async (memoryId) => {
          const api = window.openbot.memory;
          if (!api) throw new Error("Memory unavailable");
          await api.deleteAgentMemory({ botId: props.botId, memoryId });
          await refresh();
        }}
        onLimit={async (maxMemories) => {
          const api = window.openbot.memory;
          if (!api) throw new Error("Memory unavailable");
          await api.setAgentLimit({ botId: props.botId, maxMemories });
          await refresh();
        }}
      />
    </>
  );
}

export function ChannelMemorySettingsView(props: { channelId: string }) {
  const [items, setItems] = createSignal<ChannelMemory[]>([]);
  const [error, setError] = createSignal("");
  let serial = 0;
  async function refresh() {
    const list = window.openbot.channels?.listMemories;
    if (!list) {
      setError("Channel memory is unavailable in this build.");
      return;
    }
    const n = ++serial;
    try {
      const result = await list(props.channelId);
      if (n === serial) {
        setItems(result);
        setError("");
      }
    } catch (e) {
      if (n === serial) setError(e instanceof Error ? e.message : "Could not load channel memory.");
    }
  }
  onSettled(() => {
    void refresh();
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "channel-memory-changed" && event.channelId === props.channelId) void refresh();
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
      <MemoryPanel
        channel
        entries={items()}
        onSave={async (text, _inclusion, memoryId) => {
          const save = window.openbot.channels?.saveMemory;
          if (!save) throw new Error("Channel memory unavailable");
          await save({ channelId: props.channelId, text, memoryId });
          await refresh();
        }}
        onDelete={async (memoryId) => {
          const remove = window.openbot.channels?.deleteMemory;
          if (!remove) throw new Error("Channel memory unavailable");
          await remove({ channelId: props.channelId, memoryId });
          await refresh();
        }}
      />
    </>
  );
}
