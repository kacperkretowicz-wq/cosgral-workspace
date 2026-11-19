import type { LocalSkill, SkillContent, SkillInstall, SkillVersion } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { SkillsPanel } from "./SkillsPanel";
import { Button } from "./ui";
export function SkillsSettings(props: { botId?: string }) {
  function skillsApi() {
    const api = window.openbot.skills;
    if (!api) throw new Error(t("Skills are unavailable in this build."));
    return api;
  }
  function agentBotId(): string {
    const botId = props.botId;
    if (!botId) throw new Error(t("No agent selected."));
    return botId;
  }
  const [skills, setSkills] = createSignal<LocalSkill[]>([]);
  const [installs, setInstalls] = createSignal<SkillInstall[]>([]);
  const [content, setContent] = createSignal<SkillContent>();
  const [versions, setVersions] = createSignal<SkillVersion[]>([]);
  const [error, setError] = createSignal("");
  let serial = 0;
  async function refresh() {
    const api = window.openbot.skills;
    if (!api) {
      setError(t("Skills are unavailable in this build."));
      return;
    }
    const n = ++serial;
    try {
      const [list, installed] = await Promise.all([
        api.list(),
        props.botId ? api.listInstalls({ botId: props.botId }) : Promise.resolve([]),
      ]);
      if (n === serial) {
        setSkills(list);
        setInstalls(installed);
        setError("");
      }
    } catch (e) {
      if (n === serial) setError(String(e));
    }
  }
  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Skill action failed."));
    }
  }
  async function inspect(skillId: string, version?: number) {
    const api = window.openbot.skills;
    if (!api) return;
    try {
      const [value, history] = await Promise.all([api.read({ skillId, version }), api.listVersions({ skillId })]);
      setContent(value);
      setVersions(history);
    } catch (e) {
      setError(String(e));
    }
  }
  onSettled(() => {
    void refresh();
    if (!window.openbot.skills) return;
    const off = window.openbot.agent.onEvent((event) => {
      if (event.type === "skills-changed" || event.type === "skill-installs-changed") void refresh();
    });
    return () => {
      serial++;
      off();
    };
  });
  return (
    <>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show
        when={props.botId}
        fallback={
          <section class="w2-panel">
            <h2>{t("Skill library")}</h2>
            <For each={skills()}>
              {(skill) => (
                <article class="w2-item">
                  <strong>
                    {skill.name} · v{skill.version}
                  </strong>
                  <p>{skill.description}</p>
                  <Button unstyled type="button" onClick={() => void inspect(skill.id)}>
                    {t("View versions")}
                  </Button>
                  <Button
                    unstyled
                    type="button"
                    onClick={() => {
                      if (window.confirm(t("Delete this skill and uninstall it from all agents?"))) {
                        const force = window.confirm(
                          t("Also remove installed copies with local changes? Choose Cancel to preserve them."),
                        );
                        void run(() => skillsApi().delete({ skillId: skill.id, force }));
                      }
                    }}
                  >
                    {t("Delete")}
                  </Button>
                </article>
              )}
            </For>
          </section>
        }
      >
        <SkillsPanel
          skills={skills()}
          installs={installs()}
          onInspect={(id) => void inspect(id)}
          onInstall={(skillId) => void run(() => skillsApi().install({ skillId, botId: agentBotId() }))}
          onUpdate={(skillId, overwriteLocalChanges) =>
            void run(() => skillsApi().update({ skillId, botId: agentBotId(), overwriteLocalChanges }))
          }
          onUninstall={(skillId) => void run(() => skillsApi().uninstall({ skillId, botId: agentBotId() }))}
        />
      </Show>
      <Show when={content()}>
        {(item) => (
          <section class="w2-panel" aria-label={t("Skill details")}>
            <h3>
              {item().skill.name} · v{item().version}
            </h3>
            <pre class="channel-prewrap">{item().skillMd}</pre>
            <h4>{t("Versions")}</h4>
            <For each={versions()}>
              {(version) => (
                <div>
                  {t("Version {n}", { n: version.version })}{" "}
                  <Button unstyled type="button" onClick={() => void inspect(item().skill.id, version.version)}>
                    {t("Show")}
                  </Button>{" "}
                  <Button
                    unstyled
                    type="button"
                    onClick={() => {
                      if (window.confirm(t("Restore version {n} as a new library version?", { n: version.version })))
                        void run(() =>
                          skillsApi().restoreVersion({ skillId: item().skill.id, version: version.version }),
                        );
                    }}
                  >
                    {t("Restore")}
                  </Button>
                </div>
              )}
            </For>
            <Button unstyled type="button" onClick={() => setContent(undefined)}>
              {t("Close")}
            </Button>
          </section>
        )}
      </Show>
    </>
  );
}
