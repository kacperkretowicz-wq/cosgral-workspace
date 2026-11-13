import type { ChannelMessage, ChannelTask, WorkspaceChannel } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { ChatTasksSwitch } from "./ChatTasksSwitch";
import { ChannelMemorySettingsView } from "./MemorySettings";

type Person = { id: string; name: string };
export function ChannelView(props: {
  channel: WorkspaceChannel;
  bots: Person[];
  messages: ChannelMessage[];
  tasks: ChannelTask[];
  onSend: (text: string) => Promise<void>;
  onResume: (id: string) => void;
  onReassign: (id: string, botId: string) => void;
}) {
  const [mode, setMode] = createSignal<"chat" | "tasks">("chat");
  const [memoryOpen, setMemoryOpen] = createSignal(false);
  const [text, setText] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal("");
  const name = (id: string | null) => (id === null ? "You" : (props.bots.find((bot) => bot.id === id)?.name ?? id));
  async function send() {
    if (!text().trim() || sending()) return;
    setSending(true);
    setError("");
    try {
      await props.onSend(text().trim());
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send message");
    } finally {
      setSending(false);
    }
  }
  return (
    <main class="channel-view">
      <header class="channel-view-header">
        <h1>{props.channel.title || props.channel.name}</h1>
        <p>
          Lead: {name(props.channel.leadBotId)} · Members: {props.channel.memberBotIds.map(name).join(", ")}
        </p>
        <Show when={props.channel.instructions}>
          <details>
            <summary>Instructions</summary>
            <p class="channel-prewrap">{props.channel.instructions}</p>
          </details>
        </Show>
        <details onToggle={(event) => setMemoryOpen(event.currentTarget.open)}>
          <summary>Channel memory</summary>
          <Show when={memoryOpen()}>
            <ChannelMemorySettingsView channelId={props.channel.id} />
          </Show>
        </details>
        <ChatTasksSwitch mode={mode()} onChange={setMode} channelLabel={`# ${props.channel.name}`} />
      </header>
      <Show
        when={mode() === "chat"}
        fallback={
          <section class="channel-view-content" aria-label="Channel tasks">
            <Show when={props.tasks.some((task) => !task.archivedAt)} fallback={<p>No tasks in this channel.</p>}>
              <For each={props.tasks.filter((task) => !task.archivedAt)}>
                {(task) => (
                  <article class="channel-item">
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
                      <button type="button" onClick={() => props.onResume(task.id)}>
                        Resume
                      </button>
                    </Show>
                    <label>
                      {" "}
                      Reassign{" "}
                      <select
                        aria-label={`Reassign ${task.title}`}
                        value={task.ownerBotId}
                        onChange={(e) => props.onReassign(task.id, e.currentTarget.value)}
                      >
                        <For each={props.channel.memberBotIds}>{(id) => <option value={id}>{name(id)}</option>}</For>
                      </select>
                    </label>
                  </article>
                )}
              </For>
            </Show>
          </section>
        }
      >
        <section class="channel-view-content" aria-label="Channel messages">
          <Show when={props.messages.length} fallback={<p>No messages yet.</p>}>
            <For each={props.messages}>
              {(message) => (
                <article class="channel-item" id={`channel-message-${message.id}`}>
                  <strong>{name(message.authorBotId)}</strong>{" "}
                  <small>
                    {message.kind}
                    {message.resultVersion !== null ? ` · version ${message.resultVersion}` : ""}
                    {message.superseded ? " · Superseded" : ""}
                  </small>
                  <Show when={message.replyToMessageId}>
                    {(id) => (
                      <button
                        type="button"
                        onClick={() =>
                          document.getElementById(`channel-message-${id()}`)?.scrollIntoView({ block: "center" })
                        }
                      >
                        ↳ {props.messages.find((parent) => parent.id === id())?.text.slice(0, 100) ?? "Earlier message"}
                      </button>
                    )}
                  </Show>
                  <p class="channel-prewrap">{message.text}</p>
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
          <label for="channel-message-input">New message to channel lead</label>
          <textarea
            id="channel-message-input"
            maxlength={32000}
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          <Show when={error()}>
            <p role="alert">{error()}</p>
          </Show>
          <button type="submit" disabled={sending() || !text().trim()}>
            Send
          </button>
        </form>
      </Show>
    </main>
  );
}
