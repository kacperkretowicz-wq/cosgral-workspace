import type { CreateWorkspaceChannelInput, WorkspaceChannel } from "@openbot/contracts/ipc";
import { createSignal, For, Show } from "solid-js";
import { Button, Dialog, Input, NativeSelect, Textarea } from "./ui";

export function ChannelEditor(props: {
  bots: { id: string; name: string }[];
  channel?: WorkspaceChannel;
  onClose: () => void;
  onSave: (input: CreateWorkspaceChannelInput) => Promise<void>;
}) {
  const [name, setName] = createSignal(props.channel?.name ?? "");
  const [title, setTitle] = createSignal(props.channel?.title ?? "");
  const [instructions, setInstructions] = createSignal(props.channel?.instructions ?? "");
  const [members, setMembers] = createSignal(props.channel?.memberBotIds ?? []);
  const [lead, setLead] = createSignal(props.channel?.leadBotId ?? "");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  async function save() {
    if (busy()) return;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name().trim())) {
      setError("Use lowercase letters, digits and dashes for the channel name.");
      return;
    }
    if (!lead() || !members().includes(lead())) {
      setError("Choose a lead from the channel members.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await props.onSave({
        name: name().trim(),
        title: title().trim(),
        instructions: instructions(),
        memberBotIds: members(),
        leadBotId: lead(),
        isolated: props.channel?.isolated ?? true,
      });
      props.onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the channel. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy() && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay class="remote-dialog-backdrop">
          <Dialog.Content class="remote-dialog">
            <Dialog.Title>{props.channel ? "Edit channel" : "New channel"}</Dialog.Title>
            <Dialog.Description>Choose the team and shared instructions for this channel.</Dialog.Description>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={busy()} class="channel-editor-fields">
                <label class="remote-field">
                  Channel name
                  <Input
                    value={name()}
                    maxlength={40}
                    disabled={!!props.channel}
                    onInput={(e) => setName(e.currentTarget.value)}
                  />
                </label>
                <Show when={props.channel}>
                  <p>The short name cannot be changed. You can change the display title.</p>
                </Show>
                <label class="remote-field">
                  Display title
                  <Input value={title()} maxlength={120} onInput={(e) => setTitle(e.currentTarget.value)} />
                </label>
                <fieldset>
                  <legend>Members (up to 20)</legend>
                  <For each={props.bots}>
                    {(bot) => (
                      <Button
                        type="button"
                        aria-pressed={members().includes(bot.id) ? "true" : "false"}
                        variant={members().includes(bot.id) ? "primary" : "secondary"}
                        disabled={!members().includes(bot.id) && members().length >= 20}
                        onClick={() =>
                          setMembers((old) =>
                            old.includes(bot.id) ? old.filter((id) => id !== bot.id) : [...old, bot.id],
                          )
                        }
                      >
                        {bot.name}
                      </Button>
                    )}
                  </For>
                </fieldset>
                <label class="remote-field">
                  Lead agent
                  <NativeSelect value={lead()} onChange={(e) => setLead(e.currentTarget.value)}>
                    <option value="">Choose a member</option>
                    <For each={props.bots.filter((bot) => members().includes(bot.id))}>
                      {(bot) => <option value={bot.id}>{bot.name}</option>}
                    </For>
                  </NativeSelect>
                </label>
                <label class="remote-field">
                  Channel instructions
                  <Textarea
                    rows={5}
                    maxlength={2000}
                    value={instructions()}
                    onInput={(e) => setInstructions(e.currentTarget.value)}
                  />
                </label>
              </fieldset>
              <Show when={error()}>
                <p role="alert">{error()}</p>
              </Show>
              <footer>
                <Button type="button" disabled={busy()} onClick={props.onClose}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={busy()} loadingLabel="Saving…">
                  {props.channel ? "Save changes" : "Create channel"}
                </Button>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
