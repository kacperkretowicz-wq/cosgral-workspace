import type { ChannelHistoryCleared, ChannelMessage, ChannelTask, WorkspaceChannel } from "@openbot/contracts/ipc";
import { createSignal, createUniqueId, For, Show } from "solid-js";
import { t } from "../i18n";
import { ChannelHistoryClear } from "./ChannelHistoryClear";
import { ChannelRoutinesPanel } from "./ChannelRoutinesPanel";
import { ChatTasksSwitch } from "./ChatTasksSwitch";
import { ChannelMemorySettingsView } from "./MemorySettings";
import { Button, NativeSelect, Textarea, ViewTabPanel } from "./ui";

type Person = { id: string; name: string };
export function ChannelView(props: {
  channel: WorkspaceChannel;
  bots: Person[];
  messages: ChannelMessage[];
  tasks: ChannelTask[];
  onSend: (text: string, replyToMessageId?: string) => Promise<void>;
  supportsReplies?: boolean;
  onResume: (id: string) => void;
  onReassign: (id: string, botId: string) => void;
  /** Clears the messages and tasks of this channel; the button is hidden without it. */
  onClearHistory?: () => Promise<ChannelHistoryCleared>;
}) {
  const tabsId = createUniqueId();
  const [mode, setMode] = createSignal<"chat" | "tasks">("chat");
  const [memoryOpen, setMemoryOpen] = createSignal(false);
  const [routinesOpen, setRoutinesOpen] = createSignal(false);
  const [openedTask, setOpenedTask] = createSignal("");
  // "Open task" in a routine's history: the Tasks tab of this channel, with that task marked and in view.
  function openTask(taskId: string) {
    setOpenedTask(taskId);
    setMode("tasks");
    setTimeout(() => document.getElementById(`channel-task-${taskId}`)?.scrollIntoView?.({ block: "nearest" }), 0);
  }
  const [text, setText] = createSignal("");
  const [reply, setReply] = createSignal<ChannelMessage>();
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal("");
  const name = (id: string | null) => (id === null ? t("You") : (props.bots.find((bot) => bot.id === id)?.name ?? id));
  async function send() {
    if (!text().trim() || sending()) return;
    setSending(true);
    setError("");
    try {
      await props.onSend(text().trim(), reply()?.id);
      setText("");
      setReply(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not send message"));
    } finally {
      setSending(false);
    }
  }
  return (
    <main class="channel-view">
      <header class="channel-view-header">
        <h1>{props.channel.title || props.channel.name}</h1>
        <p>
          {t("Lead: {lead} · Members: {members}", {
            lead: name(props.channel.leadBotId),
            members: props.channel.memberBotIds.map(name).join(", "),
          })}
        </p>
        <Show when={props.channel.instructions}>
          <details>
            <summary>{t("Instructions")}</summary>
            <p class="channel-prewrap">{props.channel.instructions}</p>
          </details>
        </Show>
        <details onToggle={(event) => setMemoryOpen(event.currentTarget.open)}>
          <summary>{t("Channel memory")}</summary>
          <Show when={memoryOpen()}>
            <ChannelMemorySettingsView channelId={props.channel.id} />
          </Show>
        </details>
        <details onToggle={(event) => setRoutinesOpen(event.currentTarget.open)}>
          <summary>{t("Channel routines")}</summary>
          <Show when={routinesOpen()}>
            <ChannelRoutinesPanel channel={props.channel} onOpenTask={openTask} />
          </Show>
        </details>
        <Show when={props.onClearHistory}>
          {(clear) => (
            <details>
              <summary>{t("Channel history")}</summary>
              <ChannelHistoryClear onClear={clear()} />
            </details>
          )}
        </Show>
        <ChatTasksSwitch idPrefix={tabsId} mode={mode()} onChange={setMode} channelLabel={`# ${props.channel.name}`} />
      </header>
      <Show
        when={mode() === "chat"}
        fallback={
          <ViewTabPanel idPrefix={tabsId} value="tasks" class="channel-view-content">
            <Show
              when={props.tasks.some((task) => !task.archivedAt)}
              fallback={<p>{t("No tasks in this channel.")}</p>}
            >
              <For each={props.tasks.filter((task) => !task.archivedAt)}>
                {(task) => (
                  <article
                    class="channel-item"
                    id={`channel-task-${task.id}`}
                    aria-current={openedTask() === task.id ? "true" : undefined}
                  >
                    <strong>{task.title}</strong>
                    <p>
                      {name(task.ownerBotId)} ·{" "}
                      <span>
                        {task.state[0]?.toUpperCase()}
                        {task.state.slice(1)}
                      </span>
                    </p>
                    <Show when={task.pauseReason}>
                      <p>{task.pauseReason}</p>
                    </Show>
                    <Show when={task.state === "paused"}>
                      <Button type="button" onClick={() => props.onResume(task.id)}>
                        {t("Resume")}
                      </Button>
                    </Show>
                    <label>
                      {" "}
                      {t("Reassign")}{" "}
                      <NativeSelect
                        aria-label={`Reassign ${task.title}`}
                        value={task.ownerBotId}
                        onChange={(e) => props.onReassign(task.id, e.currentTarget.value)}
                      >
                        <For each={props.channel.memberBotIds}>{(id) => <option value={id}>{name(id)}</option>}</For>
                      </NativeSelect>
                    </label>
                  </article>
                )}
              </For>
            </Show>
          </ViewTabPanel>
        }
      >
        <ViewTabPanel idPrefix={tabsId} value="chat" class="channel-chat-panel">
          <section class="channel-view-content" aria-label={t("Channel messages")}>
            <Show when={props.messages.length} fallback={<p>{t("No messages yet.")}</p>}>
              <For each={props.messages}>
                {(message) => (
                  <article class="channel-item" id={`channel-message-${message.id}`}>
                    <strong>{name(message.authorBotId)}</strong>{" "}
                    <small>
                      {message.kind}
                      {message.resultVersion !== null
                        ? t(" · version {number}", { number: message.resultVersion })
                        : ""}
                      {message.superseded ? t(" · Superseded") : ""}
                    </small>
                    <Show when={message.replyToMessageId}>
                      {(id) => (
                        <Button
                          type="button"
                          onClick={() =>
                            document.getElementById(`channel-message-${id()}`)?.scrollIntoView({ block: "center" })
                          }
                        >
                          ↳{" "}
                          {props.messages.find((parent) => parent.id === id())?.text.slice(0, 100) ??
                            t("Earlier message")}
                        </Button>
                      )}
                    </Show>
                    <p class="channel-prewrap">{message.text}</p>
                    <Show when={props.supportsReplies}>
                      <Button
                        type="button"
                        aria-label={`Reply to ${message.text.slice(0, 100)}`}
                        onClick={() => setReply(message)}
                      >
                        {t("Reply")}
                      </Button>
                    </Show>
                  </article>
                )}
              </For>
            </Show>
          </section>
          <form
            class="channel-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label for="channel-message-input">{t("New message to channel lead")}</label>
            <Show when={reply()}>
              {(item) => (
                <p>
                  {t("Replying to:")} {item().text.slice(0, 100)}{" "}
                  <Button type="button" onClick={() => setReply(undefined)}>
                    {t("Cancel reply")}
                  </Button>
                </p>
              )}
            </Show>
            <Textarea
              id="channel-message-input"
              maxlength={32000}
              value={text()}
              onInput={(e) => setText(e.currentTarget.value)}
            />
            <Show when={error()}>
              <p role="alert">{error()}</p>
            </Show>
            <Button type="submit" disabled={sending() || !text().trim()}>
              {t("Send")}
            </Button>
          </form>
        </ViewTabPanel>
      </Show>
    </main>
  );
}
