import type { LocalSkill, SkillInstall } from "@openbot/contracts/ipc";
import { For, Show } from "solid-js";
import { Button } from "./ui";
export function SkillsPanel(props: {
  skills: LocalSkill[];
  installs: SkillInstall[];
  onInspect: (id: string) => void;
  onInstall: (id: string) => void;
  onUpdate: (id: string, overwrite: boolean) => void;
  onUninstall: (id: string) => void;
}) {
  return (
    <section class="w2-panel" aria-label="Agent skills">
      <h3>Agent skills</h3>
      <Show when={props.skills.length} fallback={<p>No skills in the library.</p>}>
        <For each={props.skills}>
          {(skill) => {
            const install = () => props.installs.find((item) => item.skillId === skill.id);
            return (
              <article class="w2-item">
                <strong>
                  {skill.name} · v{skill.version}
                </strong>
                <p>{skill.description}</p>
                <Button unstyled type="button" onClick={() => props.onInspect(skill.id)}>
                  View skill
                </Button>
                <Show
                  when={install()}
                  fallback={
                    <Button unstyled type="button" onClick={() => props.onInstall(skill.id)}>
                      Install
                    </Button>
                  }
                >
                  {(item) => (
                    <>
                      <small>
                        Installed v{item().installedVersion}
                        {item().modifiedLocally ? " · locally modified" : ""}
                      </small>
                      <Show when={item().updateAvailable}>
                        <Button
                          unstyled
                          type="button"
                          onClick={() => {
                            if (
                              !item().modifiedLocally ||
                              window.confirm("Update will overwrite local changes. Continue?")
                            )
                              props.onUpdate(skill.id, item().modifiedLocally);
                          }}
                        >
                          Update
                        </Button>
                      </Show>
                      <Button
                        unstyled
                        type="button"
                        onClick={() => {
                          if (window.confirm("Uninstall this skill from this agent?")) props.onUninstall(skill.id);
                        }}
                      >
                        Uninstall
                      </Button>
                    </>
                  )}
                </Show>
              </article>
            );
          }}
        </For>
      </Show>
    </section>
  );
}
