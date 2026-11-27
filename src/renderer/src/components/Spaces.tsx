import type { SpaceDescription, SpaceList, SpaceSummary, SpacesDesktopApi } from "@openbot/contracts/ipc";
import { MAIN_SPACE_NAME, spaceNameProblem } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { errorText } from "../errors";
import { t } from "../i18n";
import { AlertDialog, Badge, Button, Dialog, Field, Heading, Input, Text } from "./ui";

/** The first space keeps the stored name "Main"; the window shows it in the language of the person (a renamed space shows as it is). */
function spaceLabel(name: string | undefined): string {
  return name === undefined || name === MAIN_SPACE_NAME ? t("Main") : name;
}

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
      setError(errorText(e, t("Could not update spaces. Try again.")));
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
        {t(
          "Each space keeps its own agents, conversations, files, Vault, browser, MCP servers and memory. Switching restarts the app and stops running turns.",
        )}
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
        <Text role="status">{t("A different space is selected. Waiting for the app to restart.")}</Text>
      </Show>
      <ul class="providers-list" aria-label={t("Client spaces")}>
        <For each={props.list.spaces}>
          {(space) => (
            <li class="providers-form">
              <div class="providers-heading spaces-actions">
                <Heading as="h3" size="sm">
                  {spaceLabel(space.name)}
                </Heading>
                <Show when={space.running}>
                  <Badge tone="success">{t("Running")}</Badge>
                </Show>
                <Show when={space.archivedAt}>
                  <Badge>{t("Archived")}</Badge>
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
                      setError(t("Could not load space details."));
                    }
                  }}
                >
                  {t("Details for {name}", { name: spaceLabel(space.name) })}
                </Button>
                <Show when={!space.running && !space.archivedAt}>
                  <Button disabled={busy()} onClick={() => setConfirmation({ space, action: "switch" })}>
                    {t("Switch to {name}", { name: spaceLabel(space.name) })}
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
                    {t("Rename {name}", { name: spaceLabel(space.name) })}
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
                      {space.archivedAt
                        ? t("Restore {name}", { name: spaceLabel(space.name) })
                        : t("Archive {name}", { name: spaceLabel(space.name) })}
                    </Button>
                    <Button
                      variant="danger"
                      disabled={busy()}
                      onClick={() => setConfirmation({ space, action: "delete" })}
                    >
                      {t("Delete {name}", { name: spaceLabel(space.name) })}
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
          <section aria-label={t("Space details")}>
            <Heading as="h3" size="sm">
              {spaceLabel(detail().name)}
            </Heading>
            <Text as="p">
              {detail().separateFolder ? t("Separate data folder") : t("Original main data folder")}.{" "}
              {detail().hasData ? t("Contains saved data.") : t("Not started yet.")}
            </Text>
            <Text as="p">
              {t("Separate: {list}. Size: {size}.", {
                list: detail().isolated.join(", "),
                size: detail().sizeBytes === null ? t("not measured") : t("{n} bytes", { n: detail().sizeBytes ?? 0 }),
              })}
            </Text>
          </section>
        )}
      </Show>
      <form
        class="providers-form"
        aria-label={editing() ? t("Rename space") : t("Create space")}
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
          label={editing() ? t("New space name") : t("Space name")}
          description={t("“Main” is reserved. Names must be unique.")}
          error={name() ? (nameProblem() ?? undefined) : undefined}
        >
          <Input value={name()} maxlength={60} required onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Button type="submit" disabled={busy() || !!nameProblem()}>
          {editing() ? t("Save name") : t("Create space")}
        </Button>
        <Show when={editing()}>
          <Button
            onClick={() => {
              setEditing(undefined);
              setName("");
            }}
          >
            {t("Cancel rename")}
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
                    {pending().action === "switch"
                      ? t("Restart and switch: {name}?", { name: spaceLabel(pending().space.name) })
                      : t("Delete space: {name}?", { name: spaceLabel(pending().space.name) })}
                  </AlertDialog.Title>
                  <AlertDialog.Description>
                    {pending().action === "switch"
                      ? t("The app will restart. Running turns in this space will stop. Your saved work stays here.")
                      : t("All data in this client space will be permanently deleted. This cannot be undone.")}
                  </AlertDialog.Description>
                  <Show when={error()}>
                    <Text role="alert" tone="danger">
                      {error()}
                    </Text>
                  </Show>
                  <div class="bot-delete-actions">
                    <Button disabled={busy()} onClick={() => setConfirmation(undefined)}>
                      {t("Cancel")}
                    </Button>
                    <Button
                      disabled={busy()}
                      variant={pending().action === "delete" ? "danger-solid" : "primary"}
                      onClick={() => {
                        const value = pending();
                        void run(() => props.api[value.action]({ id: value.space.id, confirm: true }));
                      }}
                    >
                      {pending().action === "switch" ? t("Restart and switch") : t("Delete permanently")}
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
            title={t("Client space: {name}", {
              name: spaceLabel(current().spaces.find((s) => s.running)?.name),
            })}
            aria-label={t("Client space: {name}. Manage spaces", {
              name: spaceLabel(current().spaces.find((s) => s.running)?.name),
            })}
            onClick={() => setOpen(true)}
          >
            {props.compact
              ? "S"
              : t("Space: {name}", { name: spaceLabel(current().spaces.find((s) => s.running)?.name) })}
          </Button>
          <Dialog.Portal>
            <Dialog.Overlay class="bot-delete-backdrop">
              <Dialog.Content class="bot-delete-dialog spaces-dialog">
                <Dialog.Title>{t("Client spaces")}</Dialog.Title>
                <Dialog.Description>{t("Manage separate workspaces on this computer.")}</Dialog.Description>
                <Show when={window.openbot.spaces}>
                  {(api) => <SpacesManager api={api()} list={current()} onChange={setList} />}
                </Show>
                <Button onClick={() => setOpen(false)}>{t("Close spaces")}</Button>
              </Dialog.Content>
            </Dialog.Overlay>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </Show>
  );
}
