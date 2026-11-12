// COSGRAL W1: folder rows and their dialogs for the sidebar. `Sidebar` owns the state and the list.

import type { SidebarLayout } from "@openbot/contracts/ipc";
import { SIDEBAR_LIMITS } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { canCreateSubfolder, type MoveTarget, type SidebarFolderRow } from "../sidebar-tree";
import { AlertDialog, Button, ContextMenu, Dialog, Input } from "./ui";

/** What the sidebar can ask for. Each call rejects with a readable message when the backend refuses. */
export interface SidebarFolderActions {
  createFolder: (name: string, parentId: string | null) => Promise<void>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  setFolderCollapsed: (folderId: string, collapsed: boolean) => Promise<void>;
  duplicateFolder: (folderId: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveFolder: (folderId: string, parentId: string | null) => Promise<void>;
  moveAgent: (botId: string, folderId: string | null) => Promise<void>;
}

/** Pixels each folder level moves its rows to the right. */
export const FOLDER_INDENT_PX = 14;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function FolderPlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" class="size-[18px] fill-none stroke-current">
      <path
        d="M3.5 6.2c0-.9.7-1.6 1.6-1.6h2.9l1.5 1.7h5.4c.9 0 1.6.7 1.6 1.6v6.1c0 .9-.7 1.6-1.6 1.6H5.1c-.9 0-1.6-.7-1.6-1.6V6.2Z"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
      <path d="M10 9.4v3.6M8.2 11.2h3.6" stroke-width="1.4" stroke-linecap="round" />
    </svg>
  );
}

export function FolderMoveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" class="bot-context-icon size-4 fill-none stroke-current">
      <path
        d="M3.5 6.2c0-.9.7-1.6 1.6-1.6h2.9l1.5 1.7h5.4c.9 0 1.6.7 1.6 1.6v6.1c0 .9-.7 1.6-1.6 1.6H5.1c-.9 0-1.6-.7-1.6-1.6V6.2Z"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
      <path
        d="M8 10.6h4.2M10.6 8.8l1.8 1.8-1.8 1.8"
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" class="folder-row-glyph">
      <path
        d="M3.5 6.2c0-.9.7-1.6 1.6-1.6h2.9l1.5 1.7h5.4c.9 0 1.6.7 1.6 1.6v6.1c0 .9-.7 1.6-1.6 1.6H5.1c-.9 0-1.6-.7-1.6-1.6V6.2Z"
        stroke-width="1.4"
        stroke-linejoin="round"
      />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12" class="folder-row-chevron">
      <path d="m4.5 2.8 3.2 3.2-3.2 3.2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

export function FolderRow(props: {
  row: SidebarFolderRow;
  layout: SidebarLayout;
  /** Without actions the row only opens and closes nothing: it is a plain label. */
  editable: boolean;
  onToggle: () => void;
  onNewSubfolder: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const label = () => {
    const count = props.row.agentCount;
    return `${props.row.folder.name}, folder, ${count} ${count === 1 ? "agent" : "agents"}`;
  };
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger
        as={Button}
        type="button"
        class={["folder-row", { "folder-row-open": props.row.expanded }]}
        style={{ "--folder-level": String(props.row.depth - 1) }}
        aria-expanded={props.row.expanded ? "true" : "false"}
        aria-label={label()}
        onClick={props.onToggle}
      >
        <ChevronGlyph />
        <FolderGlyph />
        <span class="folder-row-name">{props.row.folder.name}</span>
        <Show when={props.row.agentCount > 0}>
          <span class="folder-row-count" aria-hidden="true">
            {props.row.agentCount}
          </span>
        </Show>
      </ContextMenu.Trigger>
      <Show when={props.editable}>
        <ContextMenu.Portal>
          <ContextMenu.Content class="bot-context-menu" aria-label="Folder actions">
            <ContextMenu.Item
              disabled={!canCreateSubfolder(props.layout, props.row.folder.id)}
              onSelect={props.onNewSubfolder}
            >
              <span>New subfolder</span>
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={props.onRename}>
              <span>Rename</span>
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={props.onDuplicate}>
              <span>Duplicate</span>
            </ContextMenu.Item>
            <ContextMenu.Item onSelect={props.onMove}>
              <span>Move to…</span>
            </ContextMenu.Item>
            <ContextMenu.Separator class="bot-context-separator" />
            <ContextMenu.Item class="bot-context-danger" onSelect={props.onDelete}>
              <span>Delete folder</span>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </Show>
    </ContextMenu.Root>
  );
}

/** Create a folder, or rename one. A fresh dialog is mounted each time, so the name starts clean. */
export function FolderNameDialog(props: {
  mode: "create" | "rename";
  initialName: string;
  /** Name of the folder a new one goes into, or null for the top level. */
  parentName: string | null;
  onSubmit: (name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = createSignal(props.initialName);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function submit(): Promise<void> {
    const value = name().trim();
    if (!value || busy()) return;
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(value);
      props.onClose();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy()) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="bot-delete-backdrop">
          <Dialog.Content class="bot-delete-dialog folder-dialog">
            <Dialog.Title>{props.mode === "create" ? "New folder" : "Rename folder"}</Dialog.Title>
            <Dialog.Description>
              {props.mode === "create"
                ? props.parentName
                  ? `Inside ${props.parentName}.`
                  : "At the top of the agent list."
                : "Agents inside keep their place."}
            </Dialog.Description>
            <form
              class="folder-dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <Input
                type="text"
                value={name()}
                onInput={(event) => setName(event.currentTarget.value)}
                aria-label="Folder name"
                placeholder="Folder name"
                maxlength={SIDEBAR_LIMITS.folderName}
                autofocus
              />
              <Show when={error()}>
                {(message) => (
                  <p class="bot-delete-error" role="alert">
                    {message()}
                  </p>
                )}
              </Show>
              <div class="bot-delete-actions">
                <Button type="button" disabled={busy()} onClick={props.onClose}>
                  Cancel
                </Button>
                <Button type="submit" class="folder-dialog-primary" disabled={busy() || name().trim().length === 0}>
                  {busy() ? "Saving…" : props.mode === "create" ? "Create" : "Save"}
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Pick where an agent or a folder goes. This is how things move without dragging. */
export function MoveToDialog(props: {
  title: string;
  targets: MoveTarget[];
  onMove: (folderId: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function move(folderId: string | null): Promise<void> {
    if (busy()) return;
    setBusy(true);
    setError(null);
    try {
      await props.onMove(folderId);
      props.onClose();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy()) props.onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay class="bot-delete-backdrop">
          <Dialog.Content class="bot-delete-dialog folder-dialog">
            <Dialog.Title>{props.title}</Dialog.Title>
            <Dialog.Description class="sr-only">Pick a place.</Dialog.Description>
            <fieldset class="folder-targets">
              <legend class="sr-only">Places</legend>
              <For each={props.targets}>
                {(target) => (
                  <Button
                    type="button"
                    class="folder-target"
                    style={{ "--folder-level": String(target.depth) }}
                    data-top={target.folderId === null ? "true" : undefined}
                    disabled={busy() || target.current || target.disabled}
                    onClick={() => void move(target.folderId)}
                  >
                    <span class="folder-target-name">{target.label}</span>
                    <Show when={target.current}>
                      <span class="folder-target-note">Current</span>
                    </Show>
                    <Show when={target.disabled && !target.current}>
                      <span class="folder-target-note">Too deep</span>
                    </Show>
                  </Button>
                )}
              </For>
            </fieldset>
            <Show when={error()}>
              {(message) => (
                <p class="bot-delete-error" role="alert">
                  {message()}
                </p>
              )}
            </Show>
            <div class="bot-delete-actions folder-dialog-single">
              <Button type="button" disabled={busy()} onClick={props.onClose}>
                Cancel
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function FolderDeleteDialog(props: { name: string; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  async function confirm(): Promise<void> {
    if (busy()) return;
    setBusy(true);
    setError(null);
    try {
      await props.onConfirm();
      props.onClose();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy()) props.onClose();
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay class="bot-delete-backdrop">
          <AlertDialog.Content class="bot-delete-dialog folder-dialog">
            <AlertDialog.Title>Delete {props.name}?</AlertDialog.Title>
            <AlertDialog.Description>
              Only the folder is removed. Its agents and subfolders move up one level.
            </AlertDialog.Description>
            <Show when={error()}>
              {(message) => (
                <p class="bot-delete-error" role="alert">
                  {message()}
                </p>
              )}
            </Show>
            <div class="bot-delete-actions">
              <Button type="button" disabled={busy()} onClick={props.onClose}>
                Cancel
              </Button>
              <Button type="button" class="bot-delete-confirm" disabled={busy()} onClick={() => void confirm()}>
                {busy() ? "Deleting…" : "Delete folder"}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
