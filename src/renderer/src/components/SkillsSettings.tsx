import type { LocalSkill, SkillContent, SkillInstall, SkillVersion } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { SkillsPanel } from "./SkillsPanel";
export function SkillsSettings(props: { botId?: string }) {
  const [skills, setSkills] = createSignal<LocalSkill[]>([]);
  const [installs, setInstalls] = createSignal<SkillInstall[]>([]);
  const [content, setContent] = createSignal<SkillContent>();
  const [versions, setVersions] = createSignal<SkillVersion[]>([]);
  const [error, setError] = createSignal("");
  let serial = 0;
  async function refresh() {
    const api = window.openbot.skills;
    if (!api) {
      setError("Skills are unavailable in this build.");
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
      setError(e instanceof Error ? e.message : "Skill action failed.");
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
            <h2>Skill library</h2>
            <For each={skills()}>
              {(skill) => (
                <article class="w2-item">
                  <strong>
                    {skill.name} · v{skill.version}
                  </strong>
                  <p>{skill.description}</p>
                  <button type="button" onClick={() => void inspect(skill.id)}>
                    View versions
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Delete this skill and uninstall it from all agents?"))
                        void run(() => window.openbot.skills!.delete({ skillId: skill.id }));
                    }}
                  >
                    Delete
                  </button>
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
          onInstall={(skillId) => void run(() => window.openbot.skills!.install({ skillId, botId: props.botId! }))}
          onUpdate={(skillId, overwriteLocalChanges) =>
            void run(() => window.openbot.skills!.update({ skillId, botId: props.botId!, overwriteLocalChanges }))
          }
          onUninstall={(skillId) => void run(() => window.openbot.skills!.uninstall({ skillId, botId: props.botId! }))}
        />
      </Show>
      <Show when={content()}>
        {(item) => (
          <section class="w2-panel" aria-label="Skill details">
            <h3>
              {item().skill.name} · v{item().version}
            </h3>
            <pre class="channel-prewrap">{item().skillMd}</pre>
            <h4>Versions</h4>
            <For each={versions()}>
              {(version) => (
                <div>
                  Version {version.version}{" "}
                  <button type="button" onClick={() => void inspect(item().skill.id, version.version)}>
                    View
                  </button>{" "}
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Restore version ${version.version} as a new library version?`))
                        void run(() =>
                          window.openbot.skills!.restoreVersion({ skillId: item().skill.id, version: version.version }),
                        );
                    }}
                  >
                    Restore
                  </button>
                </div>
              )}
            </For>
            <button type="button" onClick={() => setContent(undefined)}>
              Close
            </button>
          </section>
        )}
      </Show>
    </>
  );
}
