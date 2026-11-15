import type { ChannelMessage, ChannelTask, WorkspaceChannel } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";
import { ChannelEditor } from "./ChannelEditor";
import { ChannelView } from "./ChannelView";
import { Button } from "./ui";

export function ChannelWorkspace(props: {
  bots: { id: string; name: string }[];
  createRequested?: boolean;
  onCreateHandled?: () => void;
}) {
  const [channels, setChannels] = createSignal<WorkspaceChannel[]>([]);
  const [selected, setSelected] = createSignal("");
  const [messages, setMessages] = createSignal<ChannelMessage[]>([]);
  const [tasks, setTasks] = createSignal<ChannelTask[]>([]);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [editor, setEditor] = createSignal<"new" | WorkspaceChannel>();
  createEffect(
    () => props.createRequested,
    (requested) => {
      if (requested) {
        setEditor("new");
        props.onCreateHandled?.();
      }
    },
  );
  let generation = 0;
  let channelRevision = 0;
  let changes: Array<{ type: "message"; item: ChannelMessage } | { type: "task"; item: ChannelTask }> = [];
  const upsert = <T extends { id: string }>(items: T[], item: T) => [
    ...items.filter((old) => old.id !== item.id),
    item,
  ];
  const channel = () => channels().find((item) => item.id === selected());
  function applyMessage(item: ChannelMessage) {
    setMessages((old) => upsert(old, item).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }
  function applyTask(item: ChannelTask) {
    setTasks((old) => upsert(old, item));
  }
  async function choose(id: string) {
    const api = window.openbot.channels;
    if (!api?.listMessages) {
      setError("Channel history is unavailable in this build.");
      return;
    }
    const current = ++generation;
    setSelected(id);
    setMessages([]);
    setTasks([]);
    setError("");
    setLoading(true);
    changes = [];
    try {
      const [history, list] = await Promise.all([api.listMessages({ channelId: id }), api.listTasks(id)]);
      if (current !== generation) return;
      setMessages(history);
      setTasks(list);
      for (const change of changes) {
        if (change.type === "message") applyMessage(change.item);
        else applyTask(change.item);
      }
    } catch (e) {
      if (current === generation) setError(e instanceof Error ? e.message : "Could not load channel.");
    } finally {
      if (current === generation) {
        setLoading(false);
        changes = [];
      }
    }
  }
  onSettled(() => {
    const api = window.openbot.channels;
    if (!api) {
      setError("Channels are unavailable in this build.");
      return;
    }
    const revision = channelRevision;
    void api
      .list()
      .then((list) => {
        if (revision === channelRevision) setChannels(list);
      })
      .catch((e) => setError(String(e)));
    const unsubscribe = window.openbot.agent.onEvent((event) => {
      if (event.type === "channels-changed") {
        channelRevision++;
        setChannels(event.channels);
      }
      if (
        (event.type === "channel-message" || event.type === "channel-message-changed") &&
        event.message.channelId === selected()
      ) {
        if (loading()) changes.push({ type: "message", item: event.message });
        applyMessage(event.message);
      }
      if (event.type === "task-changed" && event.task.channelId === selected()) {
        if (loading()) changes.push({ type: "task", item: event.task });
        applyTask(event.task);
      }
    });
    return () => {
      generation++;
      unsubscribe();
    };
  });
  function rememberChannel(saved: WorkspaceChannel) {
    setChannels((old) => upsert(old, saved));
  }
  async function send(text: string, replyToMessageId?: string) {
    const api = window.openbot.channels;
    if (!api?.sendMessage) throw new Error("Sending is unavailable in this build.");
    const supportsReplies = "supportsMessageReplies" in api && api.supportsMessageReplies === true;
    if (replyToMessageId && !supportsReplies) throw new Error("Replies are not available in this build.");
    const input = { channelId: selected(), text, ...(replyToMessageId ? { replyToMessageId } : {}) };
    const result = await api.sendMessage(input);
    if (result.message.channelId === selected()) {
      applyMessage(result.message);
      applyTask(result.task);
    }
  }
  async function action(taskId: string, ownerBotId?: string) {
    try {
      const api = window.openbot.channels;
      if (!api) throw new Error("Channels unavailable");
      const task = ownerBotId
        ? await api.reassignTask({ taskId, ownerBotId })
        : await api.actOnTask({ taskId, action: "resume" });
      if (task.channelId === selected()) applyTask(task);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Task action failed");
    }
  }
  return (
    <div class="channel-workspace">
      <aside aria-label="Channels">
        <h2>Channels</h2>
        <Button onClick={() => setEditor("new")}>New channel</Button>
        <Show when={channels().length} fallback={<p>No channels yet.</p>}>
          <For each={channels().filter((item) => !item.archived)}>
            {(item) => (
              <Button
                type="button"
                aria-pressed={selected() === item.id ? "true" : "false"}
                onClick={() => void choose(item.id)}
              >
                # {item.title || item.name}
              </Button>
            )}
          </For>
        </Show>
      </aside>
      <div class="channel-workspace-main">
        <Show when={channel()}>
          <Button onClick={() => setEditor(channel())}>Edit channel</Button>
        </Show>
        <Show when={error()}>
          <p role="alert">{error()}</p>
        </Show>
        <Show when={loading()}>
          <p>Loading channel…</p>
        </Show>
        <Show when={channel()} fallback={<p>Select a channel.</p>} keyed>
          {(item) => (
            <ChannelView
              channel={item}
              bots={props.bots}
              messages={messages()}
              tasks={tasks()}
              supportsReplies={
                !!window.openbot.channels &&
                "supportsMessageReplies" in window.openbot.channels &&
                window.openbot.channels.supportsMessageReplies === true
              }
              onSend={send}
              onResume={(id) => void action(id)}
              onReassign={(id, botId) => void action(id, botId)}
            />
          )}
        </Show>
      </div>
      <Show when={editor()} keyed>
        {(editing) => (
          <ChannelEditor
            bots={props.bots}
            channel={editing === "new" ? undefined : editing}
            onClose={() => setEditor(undefined)}
            onSave={async (input) => {
              const api = window.openbot.channels;
              if (!api) throw new Error("Channels are unavailable.");
              let saved: WorkspaceChannel;
              if (editing === "new") saved = await api.create(input);
              else {
                const current = (await api.list()).find((item) => item.id === editing.id);
                if (!current) throw new Error("This channel no longer exists.");
                for (const botId of input.memberBotIds.filter((id) => !current.memberBotIds.includes(id)))
                  await api.addMember({ channelId: current.id, botId });
                await api.setLead({ channelId: current.id, botId: input.leadBotId });
                for (const botId of current.memberBotIds.filter((id) => !input.memberBotIds.includes(id)))
                  await api.removeMember({ channelId: current.id, botId });
                saved = await api.update({
                  channelId: current.id,
                  title: input.title,
                  instructions: input.instructions,
                });
              }
              rememberChannel(saved);
              await choose(saved.id);
            }}
          />
        )}
      </Show>{" "}
    </div>
  );
}
