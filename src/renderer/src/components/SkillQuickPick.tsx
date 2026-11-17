import type { SlashCommand } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t } from "../i18n";
import { Button } from "./ui";

interface SkillQuickPickProps {
  botId: string;
  /** The person chose a skill: the caller puts "/name " into the message. */
  onPick: (command: SlashCommand) => void;
}

/** The skills of an agent as a short list (composer contract, U5). Without the contract it says so instead of guessing. */
export function SkillQuickPick(props: SkillQuickPickProps) {
  const api = untrack(() => window.openbot?.composer);
  const [skills, setSkills] = createSignal<SlashCommand[] | null>(null);
  const [failed, setFailed] = createSignal(false);

  onSettled(() => {
    if (!api) return;
    void api
      .listSlashCommands({ botId: props.botId })
      .then((commands) => setSkills(commands.filter((command) => command.kind === "skill")))
      .catch(() => setFailed(true));
  });

  return (
    <section class="skill-quick-pick" aria-label={t("Use a skill")}>
      <Show when={api} fallback={<p>{t("Skills are not available in this version.")}</p>}>
        <Show when={!failed()} fallback={<p role="alert">{t("Could not load skills.")}</p>}>
          <Show when={skills()} fallback={<p role="status">{t("Loading skills…")}</p>}>
            {(list) => (
              <Show when={list().length > 0} fallback={<p>{t("No skills assigned to this agent.")}</p>}>
                <For each={list()}>
                  {(command) => (
                    <Button type="button" variant="ghost" onClick={() => props.onPick(command)}>
                      <strong>/{command.name}</strong>
                      <span class="skill-quick-pick-hint">{command.hint}</span>
                    </Button>
                  )}
                </For>
              </Show>
            )}
          </Show>
        </Show>
      </Show>
    </section>
  );
}
