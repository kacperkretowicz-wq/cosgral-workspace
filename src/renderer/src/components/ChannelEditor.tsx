import type { CreateWorkspaceChannelInput, WorkspaceChannel } from "@openbot/contracts/ipc";
import { createSignal, For, Show, untrack } from "solid-js";
import type { BotProfile } from "../data";
import { t } from "../i18n";
import { AgentAvatar } from "./AgentAvatar";
import { Button, Dialog, Input, NativeSelect, Textarea } from "./ui";
import { Check, Hash } from "./ui/icons";

type ChannelBot = { id: string; name: string } & Partial<Pick<BotProfile, "avatarSeed" | "avatarHue" | "avatarUrl">>;

const MAX_MEMBERS = 20;

/**
 * New / Edit channel. The team is a list of agents with their creatures (pick by clicking the row), the lead is
 * marked on that list, and the top shows the channel as it will look on the sidebar (stack of creatures, title,
 * `#name`). The field names ("Project name", "Display title", "Lead agent", "Create project", "Save changes") are
 * used by tests and the acceptance scripts.
 */
export function ChannelEditor(props: {
  bots: ChannelBot[];
  channel?: WorkspaceChannel;
  onClose: () => void;
  onSave: (input: CreateWorkspaceChannelInput) => Promise<void>;
}) {
  // The channel being edited gives the fields their first values; later changes to the prop do not overwrite typing.
  const initial = untrack(() => props.channel);
  const [name, setName] = createSignal(initial?.name ?? "");
  const [title, setTitle] = createSignal(initial?.title ?? "");
  const [instructions, setInstructions] = createSignal(initial?.instructions ?? "");
  const [members, setMembers] = createSignal(initial?.memberBotIds ?? []);
  const [lead, setLead] = createSignal(initial?.leadBotId ?? "");
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const memberBots = () =>
    members()
      .map((id) => props.bots.find((bot) => bot.id === id))
      .filter((bot): bot is ChannelBot => !!bot);
  /** Lead first, then the other members, as on the sidebar row. */
  const stack = () => {
    const all = memberBots();
    const leader = all.find((bot) => bot.id === lead());
    return (leader ? [leader, ...all.filter((bot) => bot !== leader)] : all).slice(0, 3);
  };
  const toggle = (id: string) => {
    const next = members().includes(id) ? members().filter((member) => member !== id) : [...members(), id];
    setMembers(next);
    // The lead is a member: dropping it clears the lead; the first member picked leads until another is chosen.
    if (!next.includes(lead())) setLead(next[0] ?? "");
  };
  async function save() {
    if (busy()) return;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name().trim())) {
      setError(t("Use lowercase letters, digits and dashes for the project name."));
      return;
    }
    if (!lead() || !members().includes(lead())) {
      setError(t("Choose a lead from the project members."));
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
      setError(cause instanceof Error ? cause.message : t("Could not save the project. Try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog.Root open onOpenChange={(open) => !open && !busy() && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay class="remote-dialog-backdrop">
          <Dialog.Content class="remote-dialog channel-editor">
            <header class="channel-editor-header">
              <span class="channel-editor-stack" data-count={Math.max(1, stack().length)} aria-hidden="true">
                <Show
                  when={stack().length}
                  fallback={
                    <span class="channel-editor-stack-empty">
                      <Hash size={18} stroke-width={1.75} />
                    </span>
                  }
                >
                  <For each={stack()}>
                    {(bot, index) => (
                      <AgentAvatar
                        seed={bot.avatarSeed ?? bot.id}
                        hue={bot.avatarHue ?? null}
                        url={bot.avatarUrl ?? null}
                        class="channel-editor-stack-member"
                        style={{ "--stack-index": String(index()) }}
                      />
                    )}
                  </For>
                </Show>
              </span>
              <div class="channel-editor-heading">
                <Dialog.Title>{props.channel ? t("Edit project") : t("New project")}</Dialog.Title>
                <Dialog.Description>
                  {t("Choose the team and shared instructions for this project.")}
                </Dialog.Description>
              </div>
            </header>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <fieldset disabled={busy()} class="channel-editor-fields">
                <div class="channel-editor-names">
                  <div class="channel-editor-field">
                    <label class="remote-field">
                      {t("Project name")}
                      <span class="channel-editor-name-input">
                        <Hash size={14} stroke-width={1.75} aria-hidden="true" />
                        <Input
                          value={name()}
                          maxlength={40}
                          placeholder="launch-team"
                          disabled={!!props.channel}
                          onInput={(e) => setName(e.currentTarget.value)}
                        />
                      </span>
                    </label>
                    <small class="channel-editor-hint">
                      {props.channel
                        ? t("The short name cannot be changed. You can change the display title.")
                        : t("Lowercase letters, digits and dashes.")}
                    </small>
                  </div>
                  <label class="remote-field">
                    {t("Display title")}
                    <Input
                      value={title()}
                      maxlength={120}
                      placeholder={t("Launch team")}
                      onInput={(e) => setTitle(e.currentTarget.value)}
                    />
                  </label>
                </div>
                <fieldset class="channel-editor-members">
                  <legend>
                    <span>{t("Members")}</span>
                    <small>
                      {t("{count} of {max} selected", { count: String(members().length), max: String(MAX_MEMBERS) })}
                    </small>
                  </legend>
                  <ul class="channel-member-list">
                    <For each={props.bots}>
                      {(bot) => {
                        const picked = () => members().includes(bot.id);
                        const leads = () => picked() && lead() === bot.id;
                        return (
                          <li class="channel-member-row" data-picked={picked() ? "" : undefined}>
                            <Button
                              unstyled
                              type="button"
                              class="channel-member-toggle"
                              aria-pressed={picked() ? "true" : "false"}
                              aria-label={bot.name}
                              disabled={!picked() && members().length >= MAX_MEMBERS}
                              onClick={() => toggle(bot.id)}
                            >
                              <span class="channel-member-check" aria-hidden="true">
                                <Show when={picked()}>
                                  <Check size={12} stroke-width={2.5} />
                                </Show>
                              </span>
                              <AgentAvatar
                                seed={bot.avatarSeed ?? bot.id}
                                hue={bot.avatarHue ?? null}
                                url={bot.avatarUrl ?? null}
                                class="channel-member-avatar"
                              />
                              <span class="channel-member-name">{bot.name}</span>
                            </Button>
                            <Show
                              when={leads()}
                              fallback={
                                <Show when={picked()}>
                                  <Button
                                    unstyled
                                    type="button"
                                    class="channel-member-make-lead"
                                    aria-label={t("Make {name} the lead", { name: bot.name })}
                                    onClick={() => setLead(bot.id)}
                                  >
                                    {t("Make lead")}
                                  </Button>
                                </Show>
                              }
                            >
                              <span class="channel-member-lead">{t("Lead")}</span>
                            </Show>
                          </li>
                        );
                      }}
                    </For>
                  </ul>
                </fieldset>
                <div class="channel-editor-field">
                  <label class="remote-field channel-editor-lead">
                    {t("Lead agent")}
                    <NativeSelect value={lead()} onChange={(e) => setLead(e.currentTarget.value)}>
                      <option value="">{t("Choose a member")}</option>
                      <For each={memberBots()}>{(bot) => <option value={bot.id}>{bot.name}</option>}</For>
                    </NativeSelect>
                  </label>
                  <small class="channel-editor-hint">
                    {t("The lead reads your messages and hands tasks to the members.")}
                  </small>
                </div>
                <label class="remote-field">
                  {t("Project instructions")}
                  <Textarea
                    rows={4}
                    maxlength={2000}
                    value={instructions()}
                    placeholder={t("What the team works on and how it should answer.")}
                    onInput={(e) => setInstructions(e.currentTarget.value)}
                  />
                </label>
              </fieldset>
              <Show when={error()}>
                <p role="alert" class="channel-editor-error">
                  {error()}
                </p>
              </Show>
              <footer class="channel-editor-footer">
                <Button type="button" disabled={busy()} onClick={props.onClose}>
                  {t("Cancel")}
                </Button>
                <Button type="submit" variant="primary" loading={busy()} loadingLabel={t("Saving…")}>
                  {props.channel ? t("Save changes") : t("Create project")}
                </Button>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
