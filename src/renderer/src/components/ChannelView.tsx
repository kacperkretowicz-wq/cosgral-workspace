import type {
  ChannelHistoryCleared,
  ChannelHistoryWindow,
  ChannelMessage,
  ChannelTask,
  WorkspaceChannel,
} from "@openbot/contracts/ipc";
import type { JSX } from "@solidjs/web";
import { createSignal, createUniqueId, For, Show } from "solid-js";
import type { AvatarMood } from "../blobatar";
import type { BotProfile } from "../data";
import { appLocale, t } from "../i18n";
import { channelMemberMood, channelMessageMood } from "../row-activity";
import { AgentAvatar } from "./AgentAvatar";
import { ChannelHistoryClear } from "./ChannelHistoryClear";
import { ChannelHistoryWindowSetting } from "./ChannelHistoryWindow";
import { ChannelRoutinesPanel } from "./ChannelRoutinesPanel";
import { ChatTasksSwitch } from "./ChatTasksSwitch";
import { ChannelMemorySettingsView } from "./MemorySettings";
import { Button, NativeSelect, Textarea, ViewTabPanel } from "./ui";
import { ArrowUp, Brain, Clock, CornerUpLeft, FileText, RefreshCw, X } from "./ui/icons";

type Person = { id: string; name: string } & Partial<Pick<BotProfile, "avatarSeed" | "avatarHue" | "avatarUrl">>;

const KIND_LABELS: Record<ChannelMessage["kind"], string> = {
  human: "",
  assignment: "Task",
  question: "Question",
  reply: "Reply",
  result: "Result",
  note: "Note",
  system: "System",
};

const TASK_STATE_LABELS: Record<ChannelTask["state"], string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  paused: "Paused",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

function messageTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString(appLocale(), { hour: "2-digit", minute: "2-digit" });
}

/** A creature for an agent; a plain initial tile for the person (and for an agent that is gone). */
function Author(props: { person: Person | undefined; human: boolean; mood?: AvatarMood }) {
  return (
    <Show
      when={!props.human && props.person?.avatarSeed ? props.person : undefined}
      fallback={
        <span class="channel-author-initial" data-human={props.human ? "true" : undefined} aria-hidden="true">
          {(props.human ? t("You") : (props.person?.name ?? "?")).slice(0, 1).toUpperCase()}
        </span>
      }
    >
      {(bot) => (
        <AgentAvatar
          class="channel-author-avatar"
          mood={props.mood}
          bot={{
            avatarSeed: bot().avatarSeed ?? bot().id,
            avatarHue: bot().avatarHue ?? null,
            avatarUrl: bot().avatarUrl ?? null,
          }}
        />
      )}
    </Show>
  );
}
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
  /** Saves how many of the last messages an agent gets with a task; the list is hidden without it. */
  onChangeHistoryWindow?: (value: ChannelHistoryWindow) => Promise<void>;
  /** Buttons at the right end of the channel header (e.g. Edit channel). */
  actions?: JSX.Element;
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
  const person = (id: string | null) => (id === null ? undefined : props.bots.find((bot) => bot.id === id));
  const members = () =>
    [
      ...(props.channel.leadBotId ? [props.channel.leadBotId] : []),
      ...props.channel.memberBotIds.filter((id) => id !== props.channel.leadBotId),
    ].flatMap((id) => {
      const bot = person(id);
      return bot ? [bot] : [];
    });
  let settings: HTMLDivElement | undefined;
  // One settings card at a time: opening one closes the others.
  const onlyOne = (event: Event) => {
    const opened = event.currentTarget;
    if (!(opened instanceof HTMLDetailsElement) || !opened.open) return;
    for (const other of Array.from(settings?.querySelectorAll("details[open]") ?? []))
      if (other !== opened && other instanceof HTMLDetailsElement) other.open = false;
  };
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
        <div class="channel-view-title">
          <span class="channel-view-stack" data-count={Math.min(3, members().length)} aria-hidden="true">
            <For each={members().slice(0, 3)}>
              {(bot) => (
                <AgentAvatar
                  class="channel-view-member"
                  mood={channelMemberMood(props.tasks, bot.id)}
                  bot={{
                    avatarSeed: bot.avatarSeed ?? bot.id,
                    avatarHue: bot.avatarHue ?? null,
                    avatarUrl: bot.avatarUrl ?? null,
                  }}
                />
              )}
            </For>
          </span>
          <div class="channel-view-heading">
            <h1>{props.channel.title || props.channel.name}</h1>
            <p>
              {t("Lead: {lead} · Members: {members}", {
                lead: name(props.channel.leadBotId),
                members: props.channel.memberBotIds.map(name).join(", "),
              })}
            </p>
          </div>
          <Show when={props.actions}>
            <div class="channel-view-actions">{props.actions}</div>
          </Show>
        </div>
        <div class="channel-view-toolbar">
          <ChatTasksSwitch
            idPrefix={tabsId}
            mode={mode()}
            onChange={setMode}
            channelLabel={`# ${props.channel.name}`}
          />
          <div class="channel-view-settings" ref={(element) => (settings = element)}>
            <Show when={props.channel.instructions}>
              <details onToggle={onlyOne}>
                <summary title={t("Instructions")}>
                  <FileText size={14} stroke-width={1.5} aria-hidden="true" />
                  <span class="channel-pill-label">{t("Instructions")}</span>
                </summary>
                <div class="channel-view-card">
                  <p class="channel-prewrap">{props.channel.instructions}</p>
                </div>
              </details>
            </Show>
            <details
              onToggle={(event) => {
                onlyOne(event);
                setMemoryOpen(event.currentTarget.open);
              }}
            >
              <summary title={t("Channel memory")}>
                <Brain size={14} stroke-width={1.5} aria-hidden="true" />
                <span class="channel-pill-label">{t("Channel memory")}</span>
              </summary>
              <div class="channel-view-card">
                <Show when={memoryOpen()}>
                  <ChannelMemorySettingsView channelId={props.channel.id} />
                </Show>
              </div>
            </details>
            <details
              onToggle={(event) => {
                onlyOne(event);
                setRoutinesOpen(event.currentTarget.open);
              }}
            >
              <summary title={t("Channel routines")}>
                <RefreshCw size={14} stroke-width={1.5} aria-hidden="true" />
                <span class="channel-pill-label">{t("Channel routines")}</span>
              </summary>
              <div class="channel-view-card">
                <Show when={routinesOpen()}>
                  <ChannelRoutinesPanel channel={props.channel} onOpenTask={openTask} />
                </Show>
              </div>
            </details>
            <Show when={props.onClearHistory || props.onChangeHistoryWindow}>
              <details onToggle={onlyOne}>
                <summary title={t("Channel history")}>
                  <Clock size={14} stroke-width={1.5} aria-hidden="true" />
                  <span class="channel-pill-label">{t("Channel history")}</span>
                </summary>
                <div class="channel-view-card">
                  <Show when={props.onChangeHistoryWindow}>
                    {(change) => (
                      <ChannelHistoryWindowSetting value={props.channel.historyWindow} onChange={change()} />
                    )}
                  </Show>
                  <Show when={props.onClearHistory}>{(clear) => <ChannelHistoryClear onClear={clear()} />}</Show>
                </div>
              </details>
            </Show>
          </div>
        </div>
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
                    class="channel-item channel-task"
                    id={`channel-task-${task.id}`}
                    data-state={task.state}
                    aria-current={openedTask() === task.id ? "true" : undefined}
                  >
                    <Author
                      person={person(task.ownerBotId)}
                      human={false}
                      mood={channelMemberMood([task], task.ownerBotId)}
                    />
                    <strong>{task.title}</strong>
                    <p>
                      {name(task.ownerBotId)} ·{" "}
                      <span class="channel-task-state" data-state={task.state}>
                        {t(TASK_STATE_LABELS[task.state])}
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
                        aria-label={t("Reassign {title}", { title: task.title })}
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
            <Show
              when={props.messages.length}
              fallback={
                <div class="channel-empty">
                  <strong>{t("No messages yet.")}</strong>
                  <p>{t("Write to the lead below; the lead hands tasks to the members.")}</p>
                </div>
              }
            >
              <For each={props.messages}>
                {(message) => (
                  <article
                    class="channel-item channel-message"
                    id={`channel-message-${message.id}`}
                    data-kind={message.kind}
                    data-human={message.authorBotId === null ? "true" : undefined}
                  >
                    <Author
                      person={person(message.authorBotId)}
                      human={message.authorBotId === null}
                      mood={channelMessageMood(message.kind)}
                    />
                    <div class="channel-message-body">
                      <div class="channel-message-meta">
                        <strong>{name(message.authorBotId)}</strong>{" "}
                        <small>
                          <Show when={KIND_LABELS[message.kind]}>
                            <span class="channel-kind" data-kind={message.kind}>
                              {t(KIND_LABELS[message.kind])}
                            </span>{" "}
                          </Show>
                          <time datetime={message.createdAt}>{messageTime(message.createdAt)}</time>
                          {message.resultVersion !== null
                            ? t(" · version {number}", { number: message.resultVersion })
                            : ""}
                          {message.superseded ? t(" · Superseded") : ""}
                        </small>
                      </div>
                      <Show when={message.replyToMessageId}>
                        {(id) => (
                          <Button
                            type="button"
                            unstyled
                            class="channel-reply-quote"
                            onClick={() =>
                              document.getElementById(`channel-message-${id()}`)?.scrollIntoView({ block: "center" })
                            }
                          >
                            {`↳ ${
                              props.messages.find((parent) => parent.id === id())?.text.slice(0, 100) ??
                              t("Earlier message")
                            }`}
                          </Button>
                        )}
                      </Show>
                      <p class="channel-prewrap">{message.text}</p>
                    </div>
                    <Show when={props.supportsReplies}>
                      <Button
                        type="button"
                        unstyled
                        class="channel-reply-button"
                        aria-label={t("Reply to {text}", { text: message.text.slice(0, 100) })}
                        title={t("Reply")}
                        onClick={() => {
                          setReply(message);
                          document.getElementById("channel-message-input")?.focus();
                        }}
                      >
                        <CornerUpLeft size={15} stroke-width={1.5} aria-hidden="true" />
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
            <label for="channel-message-input" class="sr-only">
              {t("New message to channel lead")}
            </label>
            <Show when={reply()}>
              {(item) => (
                <p class="channel-composer-reply">
                  <CornerUpLeft size={13} stroke-width={1.75} aria-hidden="true" />
                  <span>
                    {t("Replying to:")} {item().text.slice(0, 100)}
                  </span>
                  <Button type="button" unstyled aria-label={t("Cancel reply")} onClick={() => setReply(undefined)}>
                    <X size={14} stroke-width={1.75} aria-hidden="true" />
                  </Button>
                </p>
              )}
            </Show>
            <div class="channel-composer-field">
              <Textarea
                id="channel-message-input"
                maxlength={32000}
                rows={1}
                placeholder={t("Message {lead}, the channel lead", { lead: name(props.channel.leadBotId) })}
                value={text()}
                onInput={(e) => setText(e.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                    event.preventDefault();
                    void send();
                  }
                }}
              />
              <Button
                type="submit"
                unstyled
                class="channel-send"
                aria-label={t("Send")}
                title={t("Send")}
                disabled={sending() || !text().trim()}
              >
                <ArrowUp size={16} stroke-width={2} aria-hidden="true" />
              </Button>
            </div>
            <Show when={error()}>
              <p role="alert">{error()}</p>
            </Show>
          </form>
        </ViewTabPanel>
      </Show>
    </main>
  );
}
