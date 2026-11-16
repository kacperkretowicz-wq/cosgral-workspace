import type { SpaceDescription, SpaceList, SpaceSummary, SpacesDesktopApi } from "@openbot/contracts/ipc";
import { spaceNameProblem } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { AlertDialog, Badge, Button, Dialog, Field, Heading, Input, Text } from "./ui";

export function SpacesManager(props: { api: SpacesDesktopApi; list: SpaceList; onChange: (list: SpaceList) => void }) {
  const [name, setName] = createSignal("");
  const [editing, setEditing] = createSignal<SpaceSummary>();
  const [confirmation, setConfirmation] = createSignal<{ space: SpaceSummary; action: "switch" | "delete" }>();
  const [description, setDescription] = createSignal<SpaceDescription>();
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  async function run(action: () => Promise<SpaceList>) {
    setBusy(true);
    setError("");
    try {
      props.onChange(await action());
      setEditing(undefined);
      setName("");
      setConfirmation(undefined);
      setDescription(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update spaces. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const nameProblem = () =>
    spaceNameProblem(
      name(),
      props.list.spaces.filter((s) => s.id !== editing()?.id).map((s) => s.name),
    );
  return (
    <div class="providers-form">
      <Text as="p">
        Each space keeps its own agents, conversations, files, Vault, browser, MCP servers and memory. Switching
        restarts the app and stops running turns.
      </Text>
      <Show when={props.list.problem}>
        <Text role="alert" tone="warning">
          {props.list.problem}
        </Text>
      </Show>
      <Show when={error()}>
        <Text role="alert" tone="danger">
          {error()}
        </Text>
      </Show>
      <Show when={props.list.selectedId !== props.list.runningId}>
        <Text role="status">A different space is selected. Waiting for the app to restart.</Text>
      </Show>
      <ul class="providers-list" aria-label="Client spaces">
        <For each={props.list.spaces}>
          {(space) => (
            <li class="providers-form">
              <div class="providers-heading spaces-actions">
                <Heading as="h3" size="sm">
                  {space.name}
                </Heading>
                <Show when={space.running}>
                  <Badge tone="success">Running</Badge>
                </Show>
                <Show when={space.archivedAt}>
                  <Badge>Archived</Badge>
                </Show>
              </div>
              <div class="providers-heading spaces-actions">
                <Button
                  disabled={busy()}
                  onClick={async () => {
                    setError("");
                    try {
                      setDescription(await props.api.describe({ id: space.id }));
                    } catch {
                      setError("Could not load space details.");
                    }
                  }}
                >
                  Details for {space.name}
                </Button>
                <Show when={!space.running && !space.archivedAt}>
                  <Button disabled={busy()} onClick={() => setConfirmation({ space, action: "switch" })}>
                    Switch to {space.name}
                  </Button>
                </Show>
                <Show when={!space.main}>
                  <Button
                    disabled={busy()}
                    onClick={() => {
                      setEditing(space);
                      setName(space.name);
                    }}
                  >
                    Rename {space.name}
                  </Button>
                  <Show when={!space.running}>
                    <Button
                      disabled={busy()}
                      onClick={() =>
                        void run(() =>
                          space.archivedAt ? props.api.restore({ id: space.id }) : props.api.archive({ id: space.id }),
                        )
                      }
                    >
                      {space.archivedAt ? "Restore" : "Archive"} {space.name}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busy()}
                      onClick={() => setConfirmation({ space, action: "delete" })}
                    >
                      Delete {space.name}
                    </Button>
                  </Show>
                </Show>
              </div>
            </li>
          )}
        </For>
      </ul>
      <Show when={description()}>
        {(detail) => (
          <section aria-label="Space details">
            <Heading as="h3" size="sm">
              {detail().name}
            </Heading>
            <Text as="p">
              {detail().separateFolder ? "Separate data folder" : "Original main data folder"}.{" "}
              {detail().hasData ? "Contains saved data." : "Not started yet."}
            </Text>
            <Text as="p">
              Separate: {detail().isolated.join(", ")}. Size:{" "}
              {detail().sizeBytes === null ? "not measured" : `${detail().sizeBytes} bytes`}.
            </Text>
          </section>
        )}
      </Show>
      <form
        class="providers-form"
        aria-label={editing() ? "Rename space" : "Create space"}
        onSubmit={(event) => {
          event.preventDefault();
          if (nameProblem()) {
            setError(nameProblem() ?? "");
            return;
          }
          const current = editing();
          void run(() =>
            current ? props.api.rename({ id: current.id, name: name() }) : props.api.create({ name: name() }),
          );
        }}
      >
        <Field
          label={editing() ? "New space name" : "Space name"}
          description="“Main” is reserved. Names must be unique."
          error={name() ? (nameProblem() ?? undefined) : undefined}
        >
          <Input value={name()} maxlength={60} required onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Button type="submit" disabled={busy() || !!nameProblem()}>
          {editing() ? "Save name" : "Create space"}
        </Button>
        <Show when={editing()}>
          <Button
            onClick={() => {
              setEditing(undefined);
              setName("");
            }}
          >
            Cancel rename
          </Button>
        </Show>
      </form>
      <Show when={confirmation()}>
        {(pending) => (
          <AlertDialog.Root
            open
            onOpenChange={(open) => {
              if (!open && !busy()) setConfirmation(undefined);
            }}
          >
            <AlertDialog.Portal>
              <AlertDialog.Overlay class="bot-delete-backdrop">
                <AlertDialog.Content class="bot-delete-dialog">
                  <AlertDialog.Title>
                    {pending().action === "switch" ? "Restart and switch" : "Delete space"}: {pending().space.name}?
                  </AlertDialog.Title>
                  <AlertDialog.Description>
                    {pending().action === "switch"
                      ? "The app will restart. Running turns in this space will stop. Your saved work stays here."
                      : "All data in this client space will be permanently deleted. This cannot be undone."}
                  </AlertDialog.Description>
                  <Show when={error()}>
                    <Text role="alert" tone="danger">
                      {error()}
                    </Text>
                  </Show>
                  <div class="bot-delete-actions">
                    <Button disabled={busy()} onClick={() => setConfirmation(undefined)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={busy()}
                      variant={pending().action === "delete" ? "danger-solid" : "primary"}
                      onClick={() => {
                        const value = pending();
                        void run(() => props.api[value.action]({ id: value.space.id, confirm: true }));
                      }}
                    >
                      {pending().action === "switch" ? "Restart and switch" : "Delete permanently"}
                    </Button>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Overlay>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        )}
      </Show>
    </div>
  );
}
export function SpacesRail(props: { compact?: boolean } = {}) {
  const [list, setList] = createSignal<SpaceList>();
  const [open, setOpen] = createSignal(false);
  onSettled(() => {
    if (!window.openbot?.spaces) return;
    void window.openbot.spaces
      ?.list()
      .then(setList)
      .catch(() => undefined);
    return window.openbot.agent.onEvent((event) => {
      if (event.type === "spaces-changed") setList(event);
    });
  });
  return (
    <Show when={list()}>
      {(current) => (
        <Dialog.Root open={open()} onOpenChange={setOpen}>
          <Button
            class="no-drag spaces-rail"
            title={`Client space: ${current().spaces.find((s) => s.running)?.name ?? "Main"}`}
            aria-label={`Client space: ${current().spaces.find((s) => s.running)?.name ?? "Main"}. Manage spaces`}
            onClick={() => setOpen(true)}
          >
            {props.compact ? "S" : `Space: ${current().spaces.find((s) => s.running)?.name ?? "Main"}`}
          </Button>
          <Dialog.Portal>
            <Dialog.Overlay class="bot-delete-backdrop">
              <Dialog.Content class="bot-delete-dialog spaces-dialog">
                <Dialog.Title>Client spaces</Dialog.Title>
                <Dialog.Description>Manage separate workspaces on this computer.</Dialog.Description>
                <Show when={window.openbot.spaces}>
                  {(api) => <SpacesManager api={api()} list={current()} onChange={setList} />}
                </Show>
                <Button onClick={() => setOpen(false)}>Close spaces</Button>
              </Dialog.Content>
            </Dialog.Overlay>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </Show>
  );
}
