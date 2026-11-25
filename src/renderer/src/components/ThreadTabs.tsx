import {
  type AgentEvent,
  NEW_THREAD_TITLE,
  type ThreadList,
  type ThreadSummary,
  type ThreadTabCloseMode,
} from "@openbot/contracts/ipc";
import { createEffect, createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { engineRunTitle } from "./conversation/engine-run";
import { Button, ContextMenu, DropdownMenu } from "./ui";
import { ChevronDown, MessageSquarePlus, Plus, X } from "./ui/icons";

interface ThreadTabsProps {
  botId: string;
  /** Called after the visible thread list changed, so the rest of the window follows (same as ThreadPanel). */
  onChanged?: (list: ThreadList) => void;
  /**
   * Told whether the agent has a single thread. Then the strip draws nothing (one tab says nothing the header does
   * not) and the window shows `NewThreadButton` in the header instead.
   */
  onSingleThreadChange?: (single: boolean) => void;
}

/** "New thread" as a header icon, for an agent with one thread (no tab strip). */
export function NewThreadButton(props: { botId: string; onChanged?: (list: ThreadList) => void }) {
  const threadsApi = untrack(() => window.openbot?.threads);
  const [busy, setBusy] = createSignal(false);
  async function create() {
    if (!threadsApi || busy()) return;
    setBusy(true);
    try {
      const next = await threadsApi.create({ botId: props.botId });
      if (next.botId === props.botId) props.onChanged?.(next);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Show when={threadsApi}>
      <Button
        type="button"
        unstyled
        class="header-panel-toggle new-thread-button"
        aria-label={t("New thread")}
        title={t("New thread")}
        disabled={busy()}
        onClick={() => void create()}
      >
        <MessageSquarePlus size={16} stroke-width={1.5} aria-hidden="true" />
      </Button>
    </Show>
  );
}

/**
 * The strip of open threads above an agent's chat. A tab is only "shown in the strip": closing one never archives or
 * deletes the thread (it stays in the list below the chevron and can be opened again). Needs window.openbot.threads
 * and window.openbot.threadTabs; without the latter nothing is drawn.
 */
export function ThreadTabs(props: ThreadTabsProps) {
  const threadsApi = untrack(() => window.openbot?.threads);
  const tabsApi = untrack(() => window.openbot?.threadTabs);
  const [list, setList] = createSignal<ThreadList>();
  const [open, setOpen] = createSignal<string[]>([]);
  const [error, setError] = createSignal("");
  let generation = 0;

  const activeThreads = createMemo(() => (list()?.threads ?? []).filter((thread) => thread.state !== "archived"));
  const byId = createMemo(() => new Map(activeThreads().map((thread) => [thread.id, thread])));
  const tabs = createMemo(() =>
    open().flatMap((id) => {
      const thread = byId().get(id);
      return thread ? [thread] : [];
    }),
  );
  const closedThreads = createMemo(() => activeThreads().filter((thread) => !open().includes(thread.id)));
  const activeId = () => list()?.activeThreadId ?? null;
  /** Known only once the list arrived; until then the strip stays hidden and the header keeps its usual buttons. */
  const single = createMemo(() => (list() ? activeThreads().length <= 1 : null));
  // The compute is wrapped: a bare signal or memo getter passed here was not tracked (seen with the language signal).
  createEffect(
    () => single(),
    (value) => {
      if (value !== null) props.onSingleThreadChange?.(value);
    },
  );

  async function guarded<T>(work: () => Promise<T>): Promise<T | undefined> {
    setError("");
    try {
      return await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change the thread tabs."));
      return undefined;
    }
  }

  async function load() {
    const serial = ++generation;
    const botId = props.botId;
    if (!threadsApi || !tabsApi) return;
    await guarded(async () => {
      const [threads, tabState] = await Promise.all([threadsApi.list({ botId }), tabsApi.get({ botId })]);
      if (serial !== generation || botId !== props.botId) return;
      setList(threads);
      setOpen(tabState.open);
      props.onChanged?.(threads);
    });
  }

  createEffect(
    () => props.botId,
    () => {
      setList(undefined);
      setOpen([]);
      setError("");
      void load();
    },
  );

  // The shown thread is always a tab: open it when the strip does not hold it yet.
  createEffect(
    () => ({ id: activeId(), open: open(), botId: props.botId, ready: Boolean(list()) }),
    ({ id, open: current, botId, ready }) => {
      if (!ready || !id || current.includes(id) || !tabsApi) return;
      void guarded(async () => {
        const next = await tabsApi.open({ botId, threadId: id });
        if (next.botId === props.botId) setOpen(next.open);
      });
    },
  );

  onSettled(() => {
    const listen = window.openbot?.agent?.onEvent;
    if (!listen) return;
    return listen((event: AgentEvent) => {
      if (event.type === "threads-changed" && event.botId === props.botId) {
        generation++;
        setList(event);
        props.onChanged?.(event);
      }
      if (event.type === "thread-tabs-changed" && event.botId === props.botId) setOpen(event.open);
    });
  });

  async function select(thread: ThreadSummary) {
    if (!threadsApi || thread.id === activeId()) return;
    const next = await guarded(() => threadsApi.select({ botId: props.botId, threadId: thread.id }));
    if (next && next.botId === props.botId) {
      setList(next);
      props.onChanged?.(next);
    }
  }

  async function openFromList(thread: ThreadSummary) {
    if (!tabsApi) return;
    const next = await guarded(() => tabsApi.open({ botId: props.botId, threadId: thread.id }));
    if (next) setOpen(next.open);
    await select(thread);
  }

  async function create() {
    if (!threadsApi) return;
    const next = await guarded(() => threadsApi.create({ botId: props.botId }));
    if (next && next.botId === props.botId) {
      setList(next);
      props.onChanged?.(next);
    }
  }

  async function close(thread: ThreadSummary, mode: ThreadTabCloseMode) {
    if (!tabsApi) return;
    const before = open();
    const next = await guarded(() => tabsApi.close({ botId: props.botId, threadId: thread.id, mode }));
    if (!next) return;
    setOpen(next.open);
    // The shown thread lost its tab: show the neighbour that is still open (the thread itself is untouched).
    const shown = activeId();
    if (shown && !next.open.includes(shown)) {
      const index = Math.max(0, before.indexOf(shown) - 1);
      const neighbour = next.open[index] ?? next.open[0];
      const target = neighbour ? byId().get(neighbour) : undefined;
      if (target) await select(target);
    }
  }

  function onTabKeyDown(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const target = tabs()[index + step];
    if (!target) return;
    event.preventDefault();
    void select(target);
  }

  return (
    <Show when={tabsApi && threadsApi && tabs().length > 0 && single() === false}>
      <div class="thread-tabs">
        <nav class="thread-tabs-list" aria-label={t("Threads")}>
          <For each={tabs()}>
            {(thread, index) => (
              <ContextMenu.Root modal={false}>
                <ContextMenu.Trigger
                  as="div"
                  class={["thread-tab", { "thread-tab-active": thread.id === activeId() }]}
                  data-unread={thread.unread > 0 ? "true" : undefined}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    class="thread-tab-label"
                    aria-current={thread.id === activeId() ? "true" : undefined}
                    tabindex={thread.id === activeId() ? 0 : -1}
                    title={threadTitle(thread.title)}
                    onClick={() => void select(thread)}
                    onKeyDown={(event) => onTabKeyDown(event, index())}
                  >
                    {threadTitle(thread.title)}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    class="thread-tab-close"
                    aria-label={`${t("Close tab")}: ${threadTitle(thread.title)}`}
                    onClick={() => void close(thread, "this")}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </ContextMenu.Trigger>
                <ContextMenu.Portal>
                  <ContextMenu.Content class="bot-context-menu" aria-label={t("Tab actions")}>
                    <ContextMenu.Item onSelect={() => void close(thread, "this")}>
                      <span>{t("Close tab")}</span>
                    </ContextMenu.Item>
                    <ContextMenu.Item disabled={tabs().length < 2} onSelect={() => void close(thread, "others")}>
                      <span>{t("Close other tabs")}</span>
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      disabled={index() === tabs().length - 1}
                      onSelect={() => void close(thread, "right")}
                    >
                      <span>{t("Close tabs to the right")}</span>
                    </ContextMenu.Item>
                  </ContextMenu.Content>
                </ContextMenu.Portal>
              </ContextMenu.Root>
            )}
          </For>
        </nav>
        <Button
          type="button"
          variant="ghost"
          class="thread-tabs-button"
          aria-label={t("New thread")}
          onClick={() => void create()}
        >
          <Plus aria-hidden="true" />
        </Button>
        <Show when={closedThreads().length > 0}>
          <DropdownMenu.Root placement="bottom-end" gutter={6} modal={false}>
            <DropdownMenu.Trigger
              as={Button}
              type="button"
              variant="ghost"
              class="thread-tabs-button"
              aria-label={t("All threads")}
            >
              <ChevronDown aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="bot-context-menu thread-tabs-menu" aria-label={t("All threads")}>
                <For each={closedThreads()}>
                  {(thread) => (
                    <DropdownMenu.Item onSelect={() => void openFromList(thread)}>
                      <span>{threadTitle(thread.title)}</span>
                    </DropdownMenu.Item>
                  )}
                </For>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </Show>
      </div>
      <Show when={error()}>
        <p class="thread-tabs-error" role="alert">
          {error()}
        </p>
      </Show>
    </Show>
  );
}

/**
 * The default title from the store ("New thread") is shown in the window language; a title the person gave is not.
 * A thread a routine or a workflow started is titled after the agent's English header line; it shows who started it.
 */
export function threadTitle(title: string): string {
  return title === NEW_THREAD_TITLE ? t(NEW_THREAD_TITLE) : (engineRunTitle(title) ?? title);
}
