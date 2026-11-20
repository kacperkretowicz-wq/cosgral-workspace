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
import { t, tData } from "../i18n";
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
    return action && !action.enabled && action.reason ? tData(action.reason) : null;
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
    if (!api) return t("Message actions are unavailable on this computer.");
    const fromMenu = menuProblem(action);
    if (fromMenu) return fromMenu;
    const fromContract =
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
        : threadBusyProblem({ turnRunning: props.turnRunning, busyMessages: props.busyMessages }));
    return fromContract ? tData(fromContract) : null;
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
      if (serial === generation) setError(e instanceof Error ? e.message : t("Could not change this message."));
    } finally {
      if (serial === generation) setBusy(false);
    }
  }
  const label = (action: MessageAction) =>
    action === "retry"
      ? t("Retry")
      : action === "edit"
        ? t("Edit message")
        : action === "delete"
          ? t("Delete message")
          : (menuAction("pin")?.active ?? pinned())
            ? t("Unpin message")
            : t("Pin message");
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
        <DropdownMenu.Trigger class="message-action-button" aria-label={t("More message actions")}>
          <MoreIcon />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content class="message-more-menu">
          <Show when={props.onCopy}>
            <DropdownMenu.Item onSelect={() => props.onCopy?.()}>
              {props.copied ? t("Copied") : t("Copy")}
            </DropdownMenu.Item>
          </Show>
          <Show when={props.onBranch}>
            <DropdownMenu.Item disabled={Boolean(menuProblem("branch"))} onSelect={() => props.onBranch?.()}>
              {t("Branch from here")}
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
            <Dialog.Title>{dialog() === "edit" ? t("Edit message") : t("Delete message?")}</Dialog.Title>
            <Dialog.Description>
              {dialog() === "delete"
                ? t("Delete only this message from the conversation? This cannot be undone.")
                : editNeedsConfirmation(props.laterMessages)
                  ? t("Editing will remove {count} later messages and send your revised text to the agent.", {
                      count: props.laterMessages,
                    })
                  : t("Send your revised text to the agent.")}
            </Dialog.Description>
            <Show when={dialog() === "edit"}>
              <Field label={t("Message text")}>
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
                {dialog() === "delete" ? t("Delete message") : t("Replace and send")}
              </Button>
              <Button variant="secondary" disabled={busy()} onClick={() => setDialog(null)}>
                {t("Cancel")}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
