import type { BuiltinSkillPack } from "@openbot/contracts/ipc";
import { createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { t, tData } from "../i18n";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";
import { Badge, Button, NativeSelect, Switch } from "./ui";
import "../styles/builtin-skills.css";

type Person = { id: string; name: string; hidden?: boolean };
type Project = { id: string; name: string; title: string; memberBotIds: string[]; archived: boolean };

/**
 * Built-in skills (window.openbot.builtinSkills): three sets that ship with the app (superpowers, i-have-adhd,
 * graphify). They are always in the library and cannot be deleted. Here the person chooses which agents use each set,
 * whether new agents get it, and sees where it comes from (source and license). Every click answers with a sentence.
 */
export function BuiltinSkillsPanel(props: { bots?: Person[]; projects?: Project[] }) {
  const api = untrack(() => window.openbot?.builtinSkills);
  const [packs, setPacks] = createSignal<BuiltinSkillPack[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [error, setError] = createSignal("");
  const packIds = createMemo(() => packs().map((pack) => pack.id));
  const bots = () => (props.bots ?? []).filter((bot) => !bot.hidden);
  const projects = createMemo(() =>
    (props.projects ?? []).filter((project) => !project.archived && project.memberBotIds.length > 0),
  );

  // An answer that was asked for before a newer one is dropped.
  let serial = 0;
  async function load() {
    if (!api) return;
    const mine = ++serial;
    try {
      const list = await api.list();
      if (mine !== serial) return;
      setPacks(list);
      setError("");
    } catch (cause) {
      if (mine === serial) setError(cause instanceof Error ? cause.message : t("Could not load the built-in skills."));
    } finally {
      setLoaded(true);
    }
  }
  function accept(list: BuiltinSkillPack[]) {
    serial += 1;
    setPacks(list);
    setError("");
  }

  onSettled(() => {
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "skills-changed" || event.type === "skill-installs-changed" || event.type === "bots-changed")
        void load();
    });
    return () => {
      serial += 1;
      off?.();
    };
  });

  return (
    <Show
      when={api}
      fallback={<p class="vault-connectors-note">{t("Built-in skills are unavailable in this build.")}</p>}
    >
      <section class="vault-connectors builtin-skills" aria-label={t("Built-in skills")}>
        <p class="vault-connectors-note">
          {t(
            "These skills come with the app and cannot be deleted. A skill is a ready set of instructions an agent works by. The files are copies of public projects and keep their licenses.",
          )}
        </p>
        <Show when={error()}>
          <p class="vault-connectors-error" role="alert">
            {error()}
            <Button type="button" variant="ghost" onClick={() => void load()}>
              {t("Retry")}
            </Button>
          </p>
        </Show>
        <Show when={loaded()} fallback={<CosgralLoadingSkeleton label={t("Loading…")} />}>
          <ul class="vault-connector-list builtin-skill-list">
            {/* The cards are kept by set id, so the answer to a click is shown on the same card after the list reloads. */}
            <For each={packIds()}>
              {(id) => (
                <Show when={packs().find((pack) => pack.id === id)}>
                  {(pack) => (
                    <PackCard
                      pack={pack()}
                      bots={bots()}
                      projects={projects()}
                      onChange={accept}
                      onRefresh={() => void load()}
                      onError={setError}
                    />
                  )}
                </Show>
              )}
            </For>
          </ul>
        </Show>
      </section>
    </Show>
  );
}

function PackCard(props: {
  pack: BuiltinSkillPack;
  bots: Person[];
  projects: Project[];
  onChange: (packs: BuiltinSkillPack[]) => void;
  onRefresh: () => void;
  onError: (message: string) => void;
}) {
  const api = untrack(() => window.openbot?.builtinSkills);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [projectId, setProjectId] = createSignal("");
  const [copied, setCopied] = createSignal<"" | "yes" | "no">("");
  const title = () => tData(props.pack.title);
  const total = () => props.bots.length;
  const have = () => props.bots.filter((bot) => props.pack.installedBotIds.includes(bot.id)).length;
  const usable = () => props.pack.skills.some((skill) => skill.state === "ready");
  const taken = () => props.pack.skills.filter((skill) => skill.state === "name-taken");

  async function run(work: () => Promise<BuiltinSkillPack[]> | undefined, done: string) {
    if (busy() || !api) return;
    setBusy(true);
    setNotice("");
    props.onError("");
    try {
      const next = await work();
      if (next) props.onChange(next);
      setNotice(done);
    } catch (cause) {
      props.onError(
        t("Could not change the skills: {reason}", { reason: cause instanceof Error ? cause.message : String(cause) }),
      );
    } finally {
      setBusy(false);
    }
  }

  function apply(botIds: string[], enabled: boolean) {
    const count = botIds.length;
    if (count === 0) {
      setNotice(t("There are no agents to change."));
      return;
    }
    void run(
      () => api?.apply({ packId: props.pack.id, botIds, enabled }),
      enabled
        ? t("{title} is on. Agents changed: {count}.", { title: title(), count })
        : t("{title} is off. Agents changed: {count}.", { title: title(), count }),
    );
  }

  function projectAgents(): string[] {
    const project = props.projects.find((candidate) => candidate.id === projectId());
    const known = new Set(props.bots.map((bot) => bot.id));
    return project ? project.memberBotIds.filter((id) => known.has(id)) : [];
  }

  async function copyCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  }

  return (
    <li class="vault-connector-card builtin-skill-card" data-state={have() > 0 ? "connected" : "off"}>
      <header>
        <strong>{title()}</strong>
        <Badge tone={have() > 0 ? "success" : "neutral"} dot>
          {t("Agents with this set: {count} of {total}", { count: have(), total: total() })}
        </Badge>
      </header>
      <p class="builtin-skill-summary">{tData(props.pack.summary)}</p>
      <p class="vault-connectors-note">{tData(props.pack.whenToUse)}</p>

      <Show when={props.pack.program}>
        {(program) => (
          <div class="builtin-skill-program" data-found={program().found ? "yes" : "no"}>
            <p role="status">
              {program().found
                ? t("The program “{command}” is on this computer.", { command: program().command })
                : t("The program “{command}” was not found. Without it the skill cannot work.", {
                    command: program().command,
                  })}
            </p>
            <Show when={!program().found}>
              <p class="vault-connectors-note">{t("Install it once by typing this in a terminal:")}</p>
              <div class="vault-connector-actions">
                <code class="builtin-skill-command">{program().installCommand}</code>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  title={t("Copies the command so you can paste it in a terminal.")}
                  onClick={() => void copyCommand(program().installCommand)}
                >
                  {copied() === "yes" ? t("Copied") : t("Copy the command")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title={t("Looks for the program again, for example after you installed it.")}
                  onClick={props.onRefresh}
                >
                  {t("Check again")}
                </Button>
              </div>
              <Show when={copied() === "no"}>
                <p class="vault-connectors-note" role="status">
                  {t("Could not copy. Select the command and copy it by hand.")}
                </p>
              </Show>
            </Show>
          </div>
        )}
      </Show>

      <Show when={taken().length > 0}>
        <p class="vault-connectors-note" role="status">
          {t("You already have your own skill named “{name}”. It stays as it is.", { name: taken()[0]?.name ?? "" })}
        </p>
      </Show>

      <Switch
        size="sm"
        label={t("Give to new agents")}
        description={t("Every new agent gets this set at once. You can change it any time.")}
        checked={props.pack.defaultForNewAgents}
        disabled={busy() || !usable()}
        onChange={(next) =>
          void run(
            () => api?.setDefault({ packId: props.pack.id, enabled: next }),
            next
              ? t("New agents will get {title}.", { title: title() })
              : t("New agents will not get {title}.", { title: title() }),
          )
        }
      />

      <div class="vault-connector-actions">
        <Button
          type="button"
          size="sm"
          disabled={busy() || !usable()}
          title={t("Gives every agent all skills of this set.")}
          onClick={() =>
            apply(
              props.bots.map((bot) => bot.id),
              true,
            )
          }
        >
          {busy() ? t("Saving…") : t("Turn on for all agents")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy() || !usable()}
          title={t("Takes the whole set away from every agent. The skills stay in the library.")}
          onClick={() => {
            const holders = props.pack.installedBotIds.concat(props.pack.partialBotIds);
            if (holders.length === 0) setNotice(t("No agent has {title} turned on.", { title: title() }));
            else apply(holders, false);
          }}
        >
          {t("Turn off for all agents")}
        </Button>
      </div>

      <Show when={props.projects.length > 0}>
        <div class="vault-connector-actions builtin-skill-project">
          <NativeSelect
            aria-label={t("Project")}
            value={projectId()}
            disabled={busy()}
            onChange={(event) => setProjectId(event.currentTarget.value)}
          >
            <option value="">{t("Choose a project")}</option>
            <For each={props.projects}>
              {(project) => <option value={project.id}>{project.title || project.name}</option>}
            </For>
          </NativeSelect>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy() || !usable()}
            title={t("Gives the set to the agents that work in the chosen project.")}
            onClick={() => {
              if (projectId() === "") setNotice(t("Choose a project first."));
              else apply(projectAgents(), true);
            }}
          >
            {t("Turn on for the project’s agents")}
          </Button>
        </div>
      </Show>

      <details class="messenger-steps">
        <summary title={t("Switch the set on or off for one agent.")}>{t("Choose agents")}</summary>
        <Show when={props.bots.length > 0} fallback={<p>{t("There are no agents yet. Create an agent first.")}</p>}>
          <ul class="builtin-skill-agents">
            <For each={props.bots}>
              {(bot) => (
                <li>
                  <Switch
                    size="sm"
                    label={bot.name}
                    description={
                      props.pack.partialBotIds.includes(bot.id) ? t("Only some skills of the set") : undefined
                    }
                    checked={props.pack.installedBotIds.includes(bot.id)}
                    disabled={busy() || !usable()}
                    onChange={(next) => apply([bot.id], next)}
                  />
                </li>
              )}
            </For>
          </ul>
        </Show>
      </details>

      <details class="messenger-steps">
        <summary title={t("The skills that belong to this set.")}>
          {t("Skills in this set ({count})", { count: props.pack.skills.length })}
        </summary>
        <ul class="builtin-skill-names">
          <For each={props.pack.skills}>
            {(skill) => (
              <li>
                <strong>{skill.name}</strong>
                <small>{skill.description}</small>
              </li>
            )}
          </For>
        </ul>
      </details>

      <p class="builtin-skill-source">
        {t("License: {license}. Source version {version}.", {
          license: props.pack.license,
          version: props.pack.sourceVersion,
        })}{" "}
        <code>{props.pack.sourceUrl}</code>
      </p>
      <Show when={notice()}>
        <p class="builtin-skill-notice" role="status">
          {notice()}
        </p>
      </Show>
    </li>
  );
}
