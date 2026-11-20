import type { ChannelHistoryWindow, ChannelMessage, ChannelTask, WorkspaceChannel } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show } from "solid-js";
import type { BotProfile } from "../data";
import { t } from "../i18n";
import { ChannelEditor } from "./ChannelEditor";
import { ChannelView } from "./ChannelView";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Button } from "./ui";
import { Plus, Settings } from "./ui/icons";

export function ChannelWorkspace(props: {
  bots: ({ id: string; name: string } & Partial<Pick<BotProfile, "avatarSeed" | "avatarHue" | "avatarUrl">>)[];
  createRequested?: boolean;
  onCreateHandled?: () => void;
  /** Opens this channel as soon as the workspace shows (from the Tasks page). */
  openChannelId?: string | null;
  /** The message to scroll to after the channel is shown (the message of a task). */
  openAnchorMessageId?: string | null;
  onOpenHandled?: () => void;
  /** The channel was opened from the sidebar list, which already lists the channels: no second list here. */
  hideList?: boolean;
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
  createEffect(
    () => props.openChannelId,
    (id) => {
      if (id) {
        const anchor = props.openAnchorMessageId;
        void choose(id).then(() => {
          if (anchor)
            setTimeout(
              () => document.getElementById(`channel-message-${anchor}`)?.scrollIntoView?.({ block: "center" }),
              60,
            );
        });
        props.onOpenHandled?.();
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
      setError(t("Channel history is unavailable in this build."));
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
      if (current === generation) setError(e instanceof Error ? e.message : t("Could not load channel."));
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
      setError(t("Channels are unavailable in this build."));
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
      if (event.type === "channel-history-cleared" && event.channelId === selected()) {
        setMessages([]);
        setTasks([]);
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
    if (!api?.sendMessage) throw new Error(t("Sending is unavailable in this build."));
    const supportsReplies = "supportsMessageReplies" in api && api.supportsMessageReplies === true;
    if (replyToMessageId && !supportsReplies) throw new Error(t("Replies are not available in this build."));
    const input = { channelId: selected(), text, ...(replyToMessageId ? { replyToMessageId } : {}) };
    const result = await api.sendMessage(input);
    if (result.message.channelId === selected()) {
      applyMessage(result.message);
      applyTask(result.task);
    }
  }
  async function clearHistory() {
    const api = window.openbot.channels;
    if (!api?.clearHistory) throw new Error(t("Clearing the history is unavailable in this build."));
    const channelId = selected();
    const result = await api.clearHistory({ channelId });
    if (channelId === selected()) {
      setMessages([]);
      setTasks([]);
    }
    return result;
  }
  async function changeHistoryWindow(historyWindow: ChannelHistoryWindow) {
    const api = window.openbot.channels;
    if (!api?.update) throw new Error(t("Saving the history window is unavailable in this build."));
    rememberChannel(await api.update({ channelId: selected(), historyWindow }));
  }
  async function action(taskId: string, ownerBotId?: string) {
    try {
      const api = window.openbot.channels;
      if (!api) throw new Error(t("Channels unavailable"));
      const task = ownerBotId
        ? await api.reassignTask({ taskId, ownerBotId })
        : await api.actOnTask({ taskId, action: "resume" });
      if (task.channelId === selected()) applyTask(task);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Task action failed"));
    }
  }
  return (
    <div class="channel-workspace" data-list={props.hideList && channel() ? "hidden" : undefined}>
      <aside aria-label={t("Channels")} hidden={props.hideList && !!channel()}>
        <h2>{t("Channels")}</h2>
        <Button class="channel-workspace-new" onClick={() => setEditor("new")}>
          <Plus size={15} stroke-width={1.75} aria-hidden="true" />
          {t("New channel")}
        </Button>
        <Show when={channels().length} fallback={<p>{t("No channels yet.")}</p>}>
          <For each={channels().filter((item) => !item.archived)}>
            {(item) => (
              <Button
                type="button"
                class="channel-workspace-item"
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
        <Show when={error()}>
          <p role="alert">{error()}</p>
        </Show>
        <Show when={loading()}>
          <CosgralLoadingSkeleton label={t("Loading channel…")} />
        </Show>
        {/* Keyed by the id: saving a setting of the channel replaces its object, and the open sections and their notes must stay. */}
        <Show when={channel()?.id} fallback={<p>{t("Select a channel.")}</p>} keyed>
          {(_id) => (
            <Show when={channel()}>
              {(item) => (
                <ChannelView
                  channel={item()}
                  bots={props.bots}
                  messages={messages()}
                  tasks={tasks()}
                  supportsReplies={
                    !!window.openbot.channels &&
                    "supportsMessageReplies" in window.openbot.channels &&
                    window.openbot.channels.supportsMessageReplies === true
                  }
                  onSend={send}
                  onClearHistory={window.openbot.channels?.clearHistory ? clearHistory : undefined}
                  onChangeHistoryWindow={window.openbot.channels?.update ? changeHistoryWindow : undefined}
                  actions={
                    <Button type="button" variant="ghost" class="channel-edit" onClick={() => setEditor(channel())}>
                      <Settings size={15} stroke-width={1.5} aria-hidden="true" />
                      {t("Edit channel")}
                    </Button>
                  }
                  onResume={(id) => void action(id)}
                  onReassign={(id, botId) => void action(id, botId)}
                />
              )}
            </Show>
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
              if (!api) throw new Error(t("Channels are unavailable."));
              let saved: WorkspaceChannel;
              if (editing === "new") saved = await api.create(input);
              else {
                const current = (await api.list()).find((item) => item.id === editing.id);
                if (!current) throw new Error(t("This channel no longer exists."));
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
