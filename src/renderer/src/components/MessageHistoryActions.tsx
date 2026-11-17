import {
  editNeedsConfirmation,
  MESSAGE_ACTION_LIMITS,
  type MessageAction,
  type MessageActionsDesktopApi,
  type MessageMenu,
  type MessageMenuActionId,
  messageActionProblem,
  threadBusyProblem,
} from "@openbot/contracts/ipc";
import { createEffect, createSignal, Show, untrack } from "solid-js";
import type { BotMessage } from "../data";
import { MoreIcon } from "./conversation/ConversationIcons";
import { Button, Dialog, DropdownMenu, Field, Text, Textarea } from "./ui";
import "../styles/thread-work.css";
export interface HistoryActionContext {
  botId: string;
  threadId?: string | null;
  turnRunning: boolean;
  busyMessages: number;
  laterMessages: number;
}
export function MessageHistoryActions(
  props: HistoryActionContext & {
    message: BotMessage;
    api?: MessageActionsDesktopApi;
    onCopy?: () => void;
    onBranch?: () => void;
    copied?: boolean;
    onOpenChange?: (open: boolean) => void;
  },
) {
  const api = untrack(() => props.api ?? window.openbot?.messageActions);
  const [dialog, setDialog] = createSignal<"edit" | "delete" | null>(null);
  const [text, setText] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const [pinned, setPinned] = createSignal(Boolean(untrack(() => props.message.pinned)));
  // The engine's own reading of this message (window.openbot.messageMenu): why an action is not offered right now.
  const [menu, setMenu] = createSignal<MessageMenu | null>(null);
  async function readMenu() {
    const read = window.openbot?.messageMenu;
    if (!read) return;
    const serial = generation;
    try {
      const next = await read.get({ botId: props.botId, threadId: props.threadId, messageId: props.message.id });
      if (serial === generation) setMenu(next);
    } catch {
      if (serial === generation) setMenu(null);
    }
  }
  const menuAction = (id: MessageMenuActionId) => menu()?.actions.find((action) => action.id === id);
  const menuProblem = (id: MessageMenuActionId): string | null => {
    const action = menuAction(id);
    return action && !action.enabled ? action.reason : null;
  };
  let generation = 0;
  createEffect(
    () => props.message.pinned,
    (value) => {
      setPinned(Boolean(value));
    },
  );
  createEffect(
    () => `${props.botId}:${props.threadId}:${props.message.id}`,
    () => {
      generation++;
      setDialog(null);
      setError("");
      setBusy(false);
    },
  );
  function problem(action: MessageAction): string | null {
    if (!api) return "Message actions are unavailable on this computer.";
    return (
      menuProblem(action) ??
      messageActionProblem(
        action,
        props.message.actionSubject ?? {
          author: props.message.author === "you" ? "user" : "assistant",
          itemType: props.message.itemType,
          status: props.message.streaming ? "streaming" : "completed",
        },
      ) ??
      (action === "pin"
        ? null
        : threadBusyProblem({ turnRunning: props.turnRunning, busyMessages: props.busyMessages }))
    );
  }
  function open(kind: "edit" | "delete") {
    if (problem(kind)) return;
    setError("");
    setText(props.message.body);
    setDialog(kind);
  }
  async function run(action: MessageAction) {
    if (!api || busy()) return;
    const refusal = problem(action);
    if (refusal) {
      setError(refusal);
      return;
    }
    const target = { botId: props.botId, threadId: props.threadId, messageId: props.message.id };
    const serial = generation;
    setBusy(true);
    setError("");
    try {
      if (action === "retry") await api.retry(target);
      else if (action === "delete") await api.delete({ ...target, confirm: true });
      else if (action === "edit")
        await api.edit({ ...target, text: text(), confirm: editNeedsConfirmation(props.laterMessages) });
      else {
        const pins = await api.pin({ ...target, pinned: !pinned() });
        if (serial === generation) setPinned(pins.some((pin) => pin.messageId === target.messageId));
      }
      if (serial === generation) setDialog(null);
    } catch (e) {
      if (serial === generation) setError(e instanceof Error ? e.message : "Could not change this message.");
    } finally {
      if (serial === generation) setBusy(false);
    }
  }
  const label = (action: MessageAction) =>
    action === "retry"
      ? "Retry"
      : action === "edit"
        ? "Edit message"
        : action === "delete"
          ? "Delete message"
          : pinned()
            ? "Unpin message"
            : "Pin message";
  return (
    <>
      <DropdownMenu.Root
        placement="top-end"
        gutter={6}
        modal={false}
        onOpenChange={(open) => {
          if (open) void readMenu();
          props.onOpenChange?.(open);
        }}
      >
        <DropdownMenu.Trigger class="message-action-button" aria-label="More message actions">
          <MoreIcon />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content class="message-more-menu">
          <Show when={props.onCopy}>
            <DropdownMenu.Item onSelect={() => props.onCopy?.()}>{props.copied ? "Copied" : "Copy"}</DropdownMenu.Item>
          </Show>
          <Show when={props.onBranch}>
            <DropdownMenu.Item disabled={Boolean(menuProblem("branch"))} onSelect={() => props.onBranch?.()}>
              Branch from here
              <Show when={menuProblem("branch")}>
                <span class="thread-work-action-note">{menuProblem("branch")}</span>
              </Show>
            </DropdownMenu.Item>
          </Show>
          <DropdownMenu.Item disabled={busy() || Boolean(problem("retry"))} onSelect={() => void run("retry")}>
            {label("retry")}
            <Show when={problem("retry")}>
              <span class="thread-work-action-note">{problem("retry")}</span>
            </Show>
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={busy() || Boolean(problem("edit"))} onSelect={() => open("edit")}>
            {label("edit")}
            <Show when={problem("edit")}>
              <span class="thread-work-action-note">{problem("edit")}</span>
            </Show>
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={busy() || Boolean(problem("pin"))} onSelect={() => void run("pin")}>
            {label("pin")}
            <Show when={problem("pin")}>
              <span class="thread-work-action-note">{problem("pin")}</span>
            </Show>
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={busy() || Boolean(problem("delete"))} onSelect={() => open("delete")}>
            {label("delete")}
            <Show when={problem("delete")}>
              <span class="thread-work-action-note">{problem("delete")}</span>
            </Show>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Show when={error() && !dialog()}>
        <Text role="alert" tone="danger">
          {error()}
        </Text>
      </Show>
      <Dialog.Root
        open={dialog() !== null}
        onOpenChange={(value) => {
          if (!value) setDialog(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay class="thread-work-backdrop" />
          <Dialog.Content class="thread-work-dialog">
            <Dialog.Title>{dialog() === "edit" ? "Edit message" : "Delete message?"}</Dialog.Title>
            <Dialog.Description>
              {dialog() === "delete"
                ? "Delete only this message from the conversation? This cannot be undone."
                : editNeedsConfirmation(props.laterMessages)
                  ? `Editing will remove ${props.laterMessages} later message${props.laterMessages === 1 ? "" : "s"} and send your revised text to the agent.`
                  : "Send your revised text to the agent."}
            </Dialog.Description>
            <Show when={dialog() === "edit"}>
              <Field label="Message text">
                <Textarea
                  value={text()}
                  maxlength={MESSAGE_ACTION_LIMITS.editedText}
                  onInput={(e) => setText(e.currentTarget.value)}
                />
              </Field>
            </Show>
            <Show when={error()}>
              <Text role="alert" tone="danger">
                {error()}
              </Text>
            </Show>
            <Show when={dialog() && problem(dialog() ?? "delete")}>
              <Text tone="secondary">{problem(dialog() ?? "delete")}</Text>
            </Show>
            <div class="thread-work-actions">
              <Button
                variant={dialog() === "delete" ? "danger" : "primary"}
                disabled={busy() || Boolean(problem(dialog() ?? "delete")) || (dialog() === "edit" && !text().trim())}
                onClick={() => void run(dialog() ?? "delete")}
              >
                {dialog() === "delete" ? "Delete message" : "Replace and send"}
              </Button>
              <Button variant="secondary" disabled={busy()} onClick={() => setDialog(null)}>
                Cancel
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
