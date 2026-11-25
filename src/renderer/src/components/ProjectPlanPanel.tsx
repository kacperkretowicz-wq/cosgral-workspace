import {
  PROJECT_PLAN_LIMITS,
  type ProjectPlan,
  type ProjectPlanAspect,
  type ProjectPlanReviewItem,
  projectDescriptionProblem,
  type WorkspaceChannel,
} from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t, tDataParts } from "../i18n";
import { withoutIpcPrefix } from "./provider-error";
import { Badge, Button, Textarea } from "./ui";
import { Sparkles } from "./ui/icons";

const ASPECT_LABELS: Record<ProjectPlanAspect, string> = {
  goal: "Goal",
  scope: "Scope",
  risks: "Risks",
  steps: "Steps",
  dependencies: "Dependencies",
  quality: "Quality",
  tests: "Tests",
  security: "Security",
  order: "Order of work",
};

/** The program writes its reasons in English; the screen says them in the chosen language (unknown ones stay as they are). */
function problemText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? withoutIpcPrefix(error.message) : "";
  return message ? tDataParts(message) : fallback;
}

/** The pill of the toolbar of a project. It keeps the plan in step with the lead's work and shows what waits for the person. */
export function ProjectPlanPill(props: { channel: WorkspaceChannel; onToggle?: (event: Event) => void }) {
  const [plan, setPlan] = createSignal<ProjectPlan | null>(null);
  const [open, setOpen] = createSignal(false);
  let serial = 0;
  async function refresh() {
    const api = window.openbot.projectPlans;
    if (!api) return;
    const n = ++serial;
    try {
      const next = await api.get({ channelId: props.channel.id });
      if (n === serial) setPlan(next);
    } catch {
      // The pill only shows a hint; the panel shows real problems when an action fails.
    }
  }
  onSettled(() => {
    void refresh();
    const off = window.openbot.agent.onEvent((event) => {
      const channelId =
        event.type === "task-changed"
          ? event.task.channelId
          : event.type === "channel-message" || event.type === "channel-message-changed"
            ? event.message.channelId
            : null;
      if (channelId === props.channel.id && plan()?.phase === "planning") void refresh();
    });
    return () => {
      serial++;
      off();
    };
  });
  const hint = () => {
    const value = plan();
    if (!value) return null;
    if (value.phase === "planning") return t("In progress");
    if (value.phase === "proposed") return t("Waiting for you");
    if (value.phase === "accepted" && (value.skillsConsent === "not-asked" || value.reviewConsent === "not-asked")) {
      return t("Questions for you");
    }
    return null;
  };
  return (
    <details
      onToggle={(event) => {
        props.onToggle?.(event);
        setOpen(event.currentTarget.open);
      }}
    >
      <summary title={t("Project plan")}>
        <Sparkles size={14} stroke-width={1.5} aria-hidden="true" />
        <span class="channel-pill-label">{t("Project plan")}</span>
        <Show when={hint()}>{(text) => <span class="project-plan-hint">{text()}</span>}</Show>
      </summary>
      <div class="channel-view-card" data-wide="">
        <Show when={open()}>
          <ProjectPlanPanel channel={props.channel} plan={plan()} onChange={setPlan} onRefresh={refresh} />
        </Show>
      </div>
    </details>
  );
}

export function ProjectPlanPanel(props: {
  channel: WorkspaceChannel;
  plan: ProjectPlan | null;
  onChange: (plan: ProjectPlan) => void;
  onRefresh: () => Promise<void>;
}) {
  const api = () => window.openbot.projectPlans;
  const [draft, setDraft] = createSignal<string | undefined>();
  const [feedback, setFeedback] = createSignal("");
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal("");
  const [touched, setTouched] = createSignal(false);
  const description = () => draft() ?? props.plan?.description ?? props.channel.instructions;
  const problem = () => projectDescriptionProblem(description());
  const lead = () => props.channel.leadBotId ?? "";

  /** Runs one action of the plan; the answer is the new plan. Only one action runs at a time. */
  async function run(name: string, work: (plans: NonNullable<ReturnType<typeof api>>) => Promise<ProjectPlan>) {
    const plans = api();
    if (!plans || busy()) return;
    setBusy(name);
    setError("");
    try {
      props.onChange(await work(plans));
    } catch (cause) {
      setError(problemText(cause, t("This did not work. Try again.")));
    } finally {
      setBusy("");
    }
  }
  async function ask(plans: NonNullable<ReturnType<typeof api>>, note?: string) {
    const text = description().trim();
    if (text !== (props.plan?.description ?? ""))
      await plans.saveDescription({ channelId: props.channel.id, description: text });
    const next = await plans.requestPlan({ channelId: props.channel.id, ...(note ? { feedback: note } : {}) });
    setDraft(undefined);
    setFeedback("");
    return next;
  }
  function requestPlan(note?: string) {
    setTouched(true);
    if (problem()) return;
    void run("request", (plans) => ask(plans, note));
  }

  return (
    <section class="w2-panel project-plan" aria-label={t("Project plan")}>
      <h2>{t("Project plan")}</h2>
      <Show when={api()} fallback={<p>{t("The project plan is unavailable in this build.")}</p>}>
        <p>
          {t(
            "Describe what you do. The lead agent plans the whole project, looks at it from every side and shows you the plan. It creates and turns on nothing without your yes.",
          )}
        </p>
        <Show when={error()}>
          <p role="alert" class="project-plan-error">
            {error()}
          </p>
        </Show>

        <Show when={!props.plan || ["described", "failed"].includes(props.plan.phase)}>
          <Show when={props.plan?.phase === "failed"}>
            <p role="alert" class="project-plan-error">
              {t("The lead could not finish the plan. Try again.")}
            </p>
          </Show>
          <label class="project-plan-field">
            {t("What is this project about?")}
            <Textarea
              rows={5}
              maxlength={PROJECT_PLAN_LIMITS.description}
              value={description()}
              placeholder={t(
                "For example: we are opening an online shop with handmade candles and need a launch plan.",
              )}
              onInput={(event) => setDraft(event.currentTarget.value)}
            />
          </label>
          <Show when={touched() && problem()}>
            {(text) => (
              <p role="alert" class="project-plan-error">
                {t(text())}
              </p>
            )}
          </Show>
          <div class="project-plan-actions">
            <Button
              type="button"
              variant="primary"
              loading={busy() === "request"}
              loadingLabel={t("Sending…")}
              disabled={!lead()}
              title={
                lead()
                  ? t("The lead agent writes the plan and shows it to you.")
                  : t("Choose a lead for this project first.")
              }
              onClick={() => requestPlan()}
            >
              {props.plan?.phase === "failed" ? t("Try again") : t("Ask the lead for a plan")}
            </Button>
            <Button
              type="button"
              loading={busy() === "save"}
              loadingLabel={t("Saving…")}
              title={t("Keep the description without asking for a plan yet.")}
              onClick={() => {
                setTouched(true);
                if (problem()) return;
                void run("save", async (plans) => {
                  const saved = await plans.saveDescription({
                    channelId: props.channel.id,
                    description: description().trim(),
                  });
                  setDraft(undefined);
                  return saved;
                });
              }}
            >
              {t("Save description")}
            </Button>
          </div>
        </Show>

        <Show when={props.plan?.phase === "planning"}>
          <div class="project-plan-waiting" role="status">
            <Badge tone="accent" dot>
              {t("In progress")}
            </Badge>
            <p>
              {t("The lead is making the plan. This can take a few minutes. You can follow the work in the Tasks tab.")}
            </p>
            <Button
              type="button"
              size="sm"
              title={t("Check whether the plan is ready.")}
              onClick={() => void props.onRefresh()}
            >
              {t("Check now")}
            </Button>
          </div>
        </Show>

        <Show when={props.plan && ["proposed", "accepted"].includes(props.plan.phase) ? props.plan : undefined}>
          {(plan) => (
            <>
              <Show when={plan().phase === "proposed"}>
                <p class="project-plan-lead-in">{t("The plan is ready. Read it and decide.")}</p>
              </Show>
              <Show when={plan().phase === "accepted"} fallback={<PlanSections plan={plan()} />}>
                <details class="project-plan-accepted">
                  <summary>
                    <Badge tone="success">{t("Plan approved")}</Badge>
                    <span>{t("Show the plan")}</span>
                  </summary>
                  <PlanSections plan={plan()} />
                </details>
              </Show>
              <Show when={plan().phase === "proposed"}>
                <div class="project-plan-actions">
                  <Button
                    type="button"
                    variant="primary"
                    loading={busy() === "accept"}
                    loadingLabel={t("Saving…")}
                    title={t(
                      "Approving saves a short summary in the project memory. It does not create skills or turn on tools.",
                    )}
                    onClick={() => void run("accept", (plans) => plans.accept({ channelId: props.channel.id }))}
                  >
                    {t("Approve plan")}
                  </Button>
                </div>
                <p class="project-plan-note">
                  {t(
                    "Approving saves a short summary in the project memory. It does not create skills or turn on tools.",
                  )}
                </p>
                <label class="project-plan-field">
                  {t("What should change?")}
                  <Textarea
                    rows={2}
                    maxlength={PROJECT_PLAN_LIMITS.feedback}
                    value={feedback()}
                    placeholder={t("For example: describe the risks in more detail.")}
                    onInput={(event) => setFeedback(event.currentTarget.value)}
                  />
                </label>
                <div class="project-plan-actions">
                  <Button
                    type="button"
                    loading={busy() === "request"}
                    loadingLabel={t("Sending…")}
                    title={t("The lead makes the plan again with your note.")}
                    disabled={!feedback().trim()}
                    onClick={() => requestPlan(feedback().trim())}
                  >
                    {t("Ask for a new version")}
                  </Button>
                </div>
              </Show>
              <Show when={plan().phase === "accepted"}>
                <SkillsCard
                  plan={plan()}
                  busy={busy()}
                  onAnswer={(allow) =>
                    void run("skills", (plans) => plans.decideSkills({ channelId: props.channel.id, allow }))
                  }
                />
                <ReviewCard
                  plan={plan()}
                  busy={busy()}
                  channel={props.channel}
                  onAnswer={(allow) =>
                    void run("review", (plans) => plans.decideReview({ channelId: props.channel.id, allow }))
                  }
                  onItem={(item, state) =>
                    run(`item:${item}`, (plans) =>
                      plans.setReviewItem({ channelId: props.channel.id, itemId: item, state }),
                    )
                  }
                  onError={setError}
                />
              </Show>
            </>
          )}
        </Show>
      </Show>
    </section>
  );
}

function PlanSections(props: { plan: ProjectPlan }) {
  return (
    <div class="project-plan-sections">
      <For each={props.plan.sections}>
        {(section) => (
          <article class="project-plan-section">
            <h3>{t(ASPECT_LABELS[section.aspect])}</h3>
            <p class="channel-prewrap">{section.text}</p>
          </article>
        )}
      </For>
      <Show when={props.plan.raw}>
        <article class="project-plan-section">
          <h3>{t("The plan as the lead wrote it")}</h3>
          <p class="channel-prewrap">{props.plan.raw}</p>
        </article>
      </Show>
    </div>
  );
}

function SkillsCard(props: { plan: ProjectPlan; busy: string; onAnswer: (allow: boolean) => void }) {
  const consent = () => props.plan.skillsConsent;
  return (
    <section class="project-plan-ask" aria-label={t("Skills for this project")}>
      <h3>{t("Skills for this project")}</h3>
      <p>
        {t(
          "A skill is a short guide an agent reads before it does a certain kind of work. If you agree, the skills below are added to the library and given to the members of this project.",
        )}
      </p>
      <Show when={props.plan.skills.length > 0} fallback={<p>{t("The plan needs no new skills.")}</p>}>
        <ul class="project-plan-list">
          <For each={props.plan.skills}>
            {(skill) => (
              <li>
                <div class="project-plan-list-head">
                  <strong>{skill.name}</strong>
                  <Show when={skill.state === "created"}>
                    <Badge tone="success">{t("Skill created")}</Badge>
                  </Show>
                  <Show when={skill.state === "failed"}>
                    <Badge tone="danger">{t("Not created")}</Badge>
                  </Show>
                </div>
                <p>{skill.description}</p>
                <Show when={skill.problem}>
                  {(text) => (
                    <p role="alert" class="project-plan-error">
                      {tDataParts(text())}
                    </p>
                  )}
                </Show>
                <details>
                  <summary>{t("Show instructions")}</summary>
                  <p class="channel-prewrap">{skill.instructions}</p>
                </details>
              </li>
            )}
          </For>
        </ul>
        <Show when={consent() !== "done"}>
          <div class="project-plan-actions">
            <Button
              type="button"
              variant="primary"
              loading={props.busy === "skills"}
              loadingLabel={t("Creating…")}
              title={t("Adds these skills to the library and gives them to the members of this project.")}
              onClick={() => props.onAnswer(true)}
            >
              {consent() === "allowed"
                ? t("Create again")
                : consent() === "declined"
                  ? t("Change my mind: create the skills")
                  : t("Yes, create the skills")}
            </Button>
            <Show when={consent() === "not-asked" || consent() === "allowed"}>
              <Button
                type="button"
                title={t("Nothing is created. You can change your mind later.")}
                onClick={() => props.onAnswer(false)}
              >
                {t("Not now")}
              </Button>
            </Show>
          </div>
        </Show>
        <Show when={consent() === "declined"}>
          <p class="project-plan-note">{t("You said no. Nothing was created.")}</p>
        </Show>
      </Show>
    </section>
  );
}

function ReviewCard(props: {
  plan: ProjectPlan;
  channel: WorkspaceChannel;
  busy: string;
  onAnswer: (allow: boolean) => void;
  onItem: (itemId: string, state: "enabled" | "dismissed") => Promise<void>;
  onError: (message: string) => void;
}) {
  const consent = () => props.plan.reviewConsent;
  /** Turns one suggestion on with the same call the Marketplace uses, then writes that down in the plan. */
  async function enable(item: ProjectPlanReviewItem) {
    props.onError("");
    let needsSignIn = false;
    try {
      if (item.kind === "skill") {
        const market = window.openbot.marketplace;
        const botId = props.channel.leadBotId;
        if (!market || !botId) throw new Error(t("The Marketplace is unavailable in this build."));
        await market.installSkill({ itemId: item.id, botId });
      } else {
        const catalog = window.openbot.pluginCatalog;
        if (!catalog) throw new Error(t("The Marketplace is unavailable in this build."));
        const installed = await catalog.install({ slug: item.id });
        needsSignIn = installed.state === "needs-sign-in";
      }
      await props.onItem(item.id, "enabled");
      if (needsSignIn) props.onError(t("Turned on. Finish signing in under Marketplace, Apps."));
    } catch (cause) {
      props.onError(
        problemText(cause, t("Could not turn this on. Open it in the Marketplace and finish the setup there.")),
      );
    }
  }
  return (
    <section class="project-plan-ask" aria-label={t("Plugins and connectors")}>
      <h3>{t("Plugins and connectors")}</h3>
      <p>
        {t(
          "A plugin or connector links the app to a service, for example GitHub or a calendar. If you agree, the agent looks through what is available and shows what fits this project. It turns nothing on by itself.",
        )}
      </p>
      <Show when={props.plan.needs.length > 0}>
        <p class="project-plan-note">{t("The plan mentions: {list}", { list: props.plan.needs.join(", ") })}</p>
      </Show>
      <Show when={consent() !== "done"}>
        <div class="project-plan-actions">
          <Button
            type="button"
            variant="primary"
            loading={props.busy === "review"}
            loadingLabel={t("Looking…")}
            title={t("Makes a list of suggestions. Nothing is turned on.")}
            onClick={() => props.onAnswer(true)}
          >
            {consent() === "declined" ? t("Change my mind: review them") : t("Yes, review them")}
          </Button>
          <Show when={consent() === "not-asked"}>
            <Button
              type="button"
              title={t("Nothing is reviewed. You can change your mind later.")}
              onClick={() => props.onAnswer(false)}
            >
              {t("Not now")}
            </Button>
          </Show>
        </div>
        <Show when={consent() === "declined"}>
          <p class="project-plan-note">{t("You said no. Nothing was reviewed.")}</p>
        </Show>
      </Show>
      <Show when={consent() === "done"}>
        <Show
          when={props.plan.review.length > 0}
          fallback={<p>{t("Nothing fits yet. You can look through the Marketplace yourself.")}</p>}
        >
          <ul class="project-plan-list">
            <For each={props.plan.review}>
              {(item) => (
                <li data-state={item.state}>
                  <div class="project-plan-list-head">
                    <strong>{item.title}</strong>
                    <Badge tone={item.kind === "plugin" ? "accent" : "neutral"}>
                      {item.kind === "plugin" ? t("Plugin") : t("Skill")}
                    </Badge>
                    <Show when={item.state === "enabled"}>
                      <Badge tone="success">{t("Turned on")}</Badge>
                    </Show>
                    <Show when={item.state === "dismissed"}>
                      <Badge>{t("Suggestion skipped")}</Badge>
                    </Show>
                  </div>
                  <p>{tDataParts(item.reason)}</p>
                  <Show when={item.state === "suggested"}>
                    <div class="project-plan-actions">
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        title={t("Turns this on for the project right now.")}
                        loading={props.busy === `item:${item.id}`}
                        loadingLabel={t("Turning on…")}
                        onClick={() => void enable(item)}
                      >
                        {t("Turn on")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        title={t("Hides this suggestion. Nothing is turned on.")}
                        onClick={() => void props.onItem(item.id, "dismissed")}
                      >
                        {t("Skip")}
                      </Button>
                    </div>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </section>
  );
}
