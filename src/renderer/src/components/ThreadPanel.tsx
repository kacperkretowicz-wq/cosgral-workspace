import type { AgentEvent, ThreadList, ThreadSummary, ThreadsDesktopApi } from "@openbot/contracts/ipc";
import { THREAD_LIMITS, threadTitleProblem } from "@openbot/contracts/ipc";
import { createEffect, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { providerError } from "./provider-error";
import { Badge, Button, Field, Heading, Input, Switch, Text } from "./ui";
import "../styles/threads.css";
export function ThreadPanel(props: {
  botId: string;
  api?: ThreadsDesktopApi;
  onEvent?: (listener: (event: AgentEvent) => void) => () => void;
  onChanged?: (list: ThreadList) => void;
}) {
  const api = untrack(() => props.api ?? window.openbot?.threads);
  const [list, setList] = createSignal<ThreadList>();
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [archived, setArchived] = createSignal(false);
  const [rename, setRename] = createSignal<string | null>(null);
  const [title, setTitle] = createSignal("");
  const [deleting, setDeleting] = createSignal<string | null>(null);
  let generation = 0;
  function apply(next: ThreadList) {
    if (next.botId !== props.botId) return;
    setList(next);
    setLoaded(true);
    props.onChanged?.(next);
  }
  async function load() {
    const serial = ++generation;
    try {
      if (!api) return;
      const next = await api.list({ botId: props.botId });
      if (serial === generation) apply(next);
    } catch (e) {
      if (serial === generation) setError(providerError(e, "Could not load threads."));
    }
  }
  createEffect(
    () => props.botId,
    () => {
      setList(undefined);
      setLoaded(false);
      setError("");
      setRename(null);
      setDeleting(null);
      setBusy(false);
      void load();
    },
  );
  onSettled(() => {
    const off = (props.onEvent ?? window.openbot?.agent?.onEvent)?.((event) => {
      if (event.type !== "threads-changed" && event.type !== "thread-activity") return;
      if (event.botId !== props.botId) return;
      if (event.type === "threads-changed") {
        generation++;
        apply(event);
      }
      if (event.type === "thread-activity") {
        generation++;
        const current = list();
        if (!current?.threads.some((t) => t.id === event.threadId)) {
          void load();
          return;
        }
        apply({
          ...current,
          threads: current.threads.map((t) =>
            t.id === event.threadId
              ? {
                  ...t,
                  state: event.state,
                  unread: event.unread,
                  queued: event.queued,
                  needsYou: event.needsYou,
                  updatedAt: event.updatedAt,
                }
              : t,
          ),
        });
      }
    });
    return () => {
      generation++;
      off?.();
    };
  });
  async function run(action: (api: ThreadsDesktopApi, botId: string) => Promise<ThreadList>) {
    if (!api || busy()) return;
    const botId = props.botId;
    setBusy(true);
    setError("");
    try {
      const next = await action(api, botId);
      if (botId === props.botId) {
        apply(next);
        setRename(null);
        setDeleting(null);
      }
    } catch (e) {
      if (botId === props.botId) setError(providerError(e, "The thread action failed."));
    } finally {
      if (botId === props.botId) setBusy(false);
    }
  }
  const active = () => list()?.threads.find((t) => t.id === list()?.activeThreadId);
  const visible = () => list()?.threads.filter((t) => archived() || t.state !== "archived") ?? [];
  const select = (thread: ThreadSummary) =>
    void run((service, botId) => service.select({ botId, threadId: thread.id }));
  return (
    <Show when={api}>
      <details class="thread-panel">
        <summary>Threads: {active()?.title ?? "Loading..."}</summary>
        <div class="thread-panel-body">
          <Heading as="h2" size="sm">
            Agent threads
          </Heading>
          <Text as="p" tone="secondary">
            Running turns finish in their own thread. History, queued messages and Needs you stay with that thread.
            Memory is shared by this agent.
          </Text>
          <Show when={error()}>
            <Text as="p" role="alert" tone="danger">
              {error()}
            </Text>
            <Button disabled={busy()} onClick={() => void load()}>
              Reload threads
            </Button>
          </Show>
          <Button
            disabled={busy() || !loaded() || (list()?.threads.length ?? 0) >= THREAD_LIMITS.threadsPerAgent}
            onClick={() => void run((service, botId) => service.create({ botId }))}
          >
            New thread
          </Button>
          <Switch label="Show archived threads" checked={archived()} onChange={setArchived} />
          <Show when={loaded()} fallback={<Text as="p">Loading threads...</Text>}>
            <ul class="thread-list">
              <For each={visible()}>
                {(thread) => (
                  <li class="thread-list-row">
                    <div>
                      <Heading as="h3" size="sm">
                        {thread.title}
                      </Heading>
                      <Badge tone={thread.state === "waiting" ? "warning" : "neutral"}>
                        {thread.state === "running" && !thread.active ? "Working in background" : thread.state}
                      </Badge>
                      <Show when={thread.active}>
                        <Badge>Current</Badge>
                      </Show>
                      <Text as="p" tone="secondary">
                        {thread.preview || "No messages yet."}
                      </Text>
                      <Text as="p" tone="secondary">
                        {thread.unread} unread; {thread.queued} queued; {thread.needsYou} Needs you. Updated{" "}
                        {new Date(thread.updatedAt).toLocaleString("en-US")}
                      </Text>
                      <Show when={thread.parentThreadId}>
                        <Button
                          variant="link"
                          disabled={
                            busy() ||
                            !list()?.threads.some((t) => t.id === thread.parentThreadId && t.state !== "archived")
                          }
                          onClick={() => {
                            const parent = list()?.threads.find((t) => t.id === thread.parentThreadId);
                            if (parent) select(parent);
                          }}
                        >
                          From thread: {thread.parentTitle ?? thread.parentThreadId}
                        </Button>
                      </Show>
                    </div>
                    <div class="thread-actions">
                      <Show
                        when={thread.state !== "archived"}
                        fallback={
                          <Button
                            disabled={busy()}
                            onClick={() =>
                              void run((service, botId) => service.restore({ botId, threadId: thread.id }))
                            }
                          >
                            Restore {thread.title}
                          </Button>
                        }
                      >
                        <Button disabled={busy() || thread.active} onClick={() => select(thread)}>
                          Open {thread.title}
                        </Button>
                        <Button
                          disabled={busy()}
                          onClick={() => {
                            setRename(thread.id);
                            setTitle(thread.title);
                            setDeleting(null);
                          }}
                        >
                          Rename {thread.title}
                        </Button>
                        <Button
                          disabled={busy()}
                          onClick={() => void run((service, botId) => service.archive({ botId, threadId: thread.id }))}
                        >
                          Archive {thread.title}
                        </Button>
                      </Show>
                      <Button
                        variant="danger"
                        disabled={busy()}
                        onClick={() => {
                          setDeleting(thread.id);
                          setRename(null);
                        }}
                      >
                        Delete {thread.title}
                      </Button>
                    </div>
                    <Show when={rename() === thread.id}>
                      <form
                        aria-label={`Rename ${thread.title}`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const problem = threadTitleProblem(title());
                          if (problem) {
                            setError(problem);
                            return;
                          }
                          void run((service, botId) => service.rename({ botId, threadId: thread.id, title: title() }));
                        }}
                      >
                        <Field label="Thread title">
                          <Input
                            value={title()}
                            maxlength={THREAD_LIMITS.title}
                            disabled={busy()}
                            onInput={(event) => setTitle(event.currentTarget.value)}
                          />
                        </Field>
                        <Text as="p" tone="secondary">
                          Leave empty to use the automatic title.
                        </Text>
                        <Button type="submit" disabled={busy()}>
                          Save title
                        </Button>
                        <Button type="button" disabled={busy()} onClick={() => setRename(null)}>
                          Cancel rename
                        </Button>
                      </form>
                    </Show>
                    <Show when={deleting() === thread.id}>
                      <fieldset aria-label={`Confirm deleting ${thread.title}`}>
                        <Text as="p">
                          Permanently delete {thread.title}, its history, queued messages and Needs you cards? This
                          cannot be undone.
                        </Text>
                        <Button
                          variant="danger"
                          disabled={busy()}
                          onClick={() =>
                            void run((service, botId) => service.delete({ botId, threadId: thread.id, confirm: true }))
                          }
                        >
                          Delete permanently
                        </Button>
                        <Button disabled={busy()} onClick={() => setDeleting(null)}>
                          Keep thread
                        </Button>
                      </fieldset>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={list()?.threads.some((thread) => thread.needsYou > 0)}>
            <section aria-label="Needs you by thread">
              <Heading as="h3" size="sm">
                Needs you by thread
              </Heading>
              <For each={list()?.threads.filter((thread) => thread.needsYou > 0) ?? []}>
                {(thread) => (
                  <Button disabled={busy() || thread.state === "archived"} onClick={() => select(thread)}>
                    {thread.title}: {thread.needsYou} Needs you
                  </Button>
                )}
              </For>
            </section>
          </Show>
        </div>
      </details>
    </Show>
  );
}
