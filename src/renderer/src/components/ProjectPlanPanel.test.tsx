import type { ProjectPlan, WorkspaceChannel } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { setLanguage } from "../i18n";
import { ProjectPlanPanel } from "./ProjectPlanPanel";

const channel: WorkspaceChannel = {
  id: "demo-channel",
  name: "sklep",
  title: "Sklep",
  instructions: "Otwieramy sklep ze świecami.",
  leadBotId: "chief",
  memberBotIds: ["chief"],
  isolated: true,
  archived: false,
  createdAt: "",
  updatedAt: "",
};

function setup() {
  const mock = createMockOpenBot();
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
  return mock;
}

/** Spies on the two places a suggestion is turned on (the real mocks stay in place; the tests say what they answer). */
async function spies(mock: ReturnType<typeof setup>) {
  const catalog = mock.api.pluginCatalog;
  const market = mock.api.marketplace;
  if (!catalog || !market) throw new Error("The mock has no Marketplace.");
  const [anyPlugin] = (await catalog.list()).plugins;
  if (!anyPlugin) throw new Error("The mock catalog is empty.");
  return { install: vi.spyOn(catalog, "install"), installSkill: vi.spyOn(market, "installSkill"), anyPlugin };
}

/** The first of several matching elements; the test fails clearly when there is none. */
function first(list: HTMLElement[]): HTMLElement {
  const [item] = list;
  if (!item) throw new Error("Expected at least one element.");
  return item;
}

function Harness() {
  const [plan, setPlan] = createSignal<ProjectPlan | null>(null);
  return (
    <ProjectPlanPanel
      channel={channel}
      plan={plan()}
      onChange={setPlan}
      onRefresh={async () => {
        setPlan((await window.openbot.projectPlans?.get({ channelId: channel.id })) ?? null);
      }}
    />
  );
}

afterEach(() => {
  cleanup();
  setLanguage("en");
  vi.restoreAllMocks();
});

/** The lead's work ends a moment later: press "Check now" until the plan is on the screen. */
async function planArrives(check: string, approve: string) {
  await waitFor(async () => {
    const button = screen.queryByRole("button", { name: check });
    if (button) await fireEvent.click(button);
    expect(screen.getByRole("button", { name: approve })).toBeInTheDocument();
  });
}

async function toAcceptedPlan() {
  await fireEvent.click(screen.getByRole("button", { name: "Ask the lead for a plan" }));
  await screen.findByText(/The lead is making the plan/);
  await planArrives("Check now", "Approve plan");
  await fireEvent.click(screen.getByRole("button", { name: "Approve plan" }));
  await screen.findByText("Plan approved");
}

describe("ProjectPlanPanel", () => {
  it("starts from the instructions of the project and refuses an empty description", async () => {
    setup();
    render(() => <Harness />);
    const field = screen.getByLabelText("What is this project about?");
    expect(field).toHaveValue("Otwieramy sklep ze świecami.");
    await fireEvent.input(field, { target: { value: "  " } });
    await fireEvent.click(screen.getByRole("button", { name: "Ask the lead for a plan" }));
    expect(await screen.findByText("Describe the project in a few sentences first.")).toBeInTheDocument();
    expect(screen.queryByText(/The lead is making the plan/)).toBeNull();
  });

  it("shows the plan from every side and waits for the person to approve it", async () => {
    setup();
    render(() => <Harness />);
    await fireEvent.click(screen.getByRole("button", { name: "Ask the lead for a plan" }));
    await planArrives("Check now", "Approve plan");
    expect(screen.getByText("The plan is ready. Read it and decide.")).toBeInTheDocument();
    for (const label of [
      "Goal",
      "Scope",
      "Risks",
      "Steps",
      "Dependencies",
      "Quality",
      "Tests",
      "Security",
      "Order of work",
    ]) {
      expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
    }
    // Nothing about skills or plugins is asked before the plan is approved.
    expect(screen.queryByText("Skills for this project")).toBeNull();
    expect(screen.queryByText("Plugins and connectors")).toBeNull();
  });

  it("asks for skills and for the review separately, and creates nothing without a yes", async () => {
    const mock = setup();
    const api = mock.api.projectPlans;
    if (!api) throw new Error("The mock has no project plans.");
    const skills = vi.spyOn(api, "decideSkills");
    const review = vi.spyOn(api, "decideReview");
    render(() => <Harness />);
    await toAcceptedPlan();
    expect(screen.getByText("Skills for this project")).toBeInTheDocument();
    expect(screen.getByText("Plugins and connectors")).toBeInTheDocument();
    expect(screen.getByText("opis-produktu")).toBeInTheDocument();
    expect(screen.getByText("The plan mentions: GitHub, Kalendarz")).toBeInTheDocument();
    expect(skills).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();

    await fireEvent.click(first(screen.getAllByRole("button", { name: "Not now" })));
    await screen.findByText("You said no. Nothing was created.");
    expect(skills).toHaveBeenCalledWith({ channelId: "demo-channel", allow: false });
    expect(review).not.toHaveBeenCalled();
    expect(screen.queryByText("Skill created")).toBeNull();
  });

  it("creates the skills after a yes and turns a suggestion on only when the person presses the button", async () => {
    const mock = setup();
    const { install, installSkill, anyPlugin } = await spies(mock);
    install.mockResolvedValue({ ...anyPlugin, state: "installed" });
    render(() => <Harness />);
    await toAcceptedPlan();

    await fireEvent.click(screen.getByRole("button", { name: "Yes, create the skills" }));
    await waitFor(() => expect(screen.getAllByText("Skill created")).toHaveLength(1));

    await fireEvent.click(screen.getByRole("button", { name: "Yes, review them" }));
    await screen.findByText("GitHub");
    expect(install).not.toHaveBeenCalled();
    expect(installSkill).not.toHaveBeenCalled();
    expect((await mock.api.projectPlans?.get({ channelId: "demo-channel" }))?.review.map((item) => item.state)).toEqual(
      ["suggested", "suggested"],
    );

    const turnOn = screen.getAllByRole("button", { name: "Turn on" });
    await fireEvent.click(first(turnOn));
    await waitFor(() => expect(install).toHaveBeenCalledWith({ slug: "github" }));
    await screen.findByText("Turned on");
    expect(installSkill).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    await screen.findByText("Suggestion skipped");
  });

  it("shows the problem and keeps the suggestion when turning it on fails", async () => {
    const { install } = await spies(setup());
    install.mockRejectedValue(new Error("Error invoking remote method 'plugin-catalog:install': Error: Nope"));
    render(() => <Harness />);
    await toAcceptedPlan();
    await fireEvent.click(screen.getByRole("button", { name: "Yes, review them" }));
    await screen.findByText("GitHub");
    await fireEvent.click(first(screen.getAllByRole("button", { name: "Turn on" })));
    expect(await screen.findByRole("alert")).toHaveTextContent("Nope");
    expect(screen.queryByText("Turned on")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Turn on" })).toHaveLength(2);
  });

  it("speaks simple Polish without double dashes", async () => {
    setup();
    setLanguage("pl");
    const view = render(() => <Harness />);
    expect(await screen.findByRole("heading", { name: "Plan projektu" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poproś agenta o plan" })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Poproś agenta o plan" }));
    await screen.findByText(/Agent układa plan/);
    await planArrives("Sprawdź teraz", "Zatwierdź plan");
    await fireEvent.click(screen.getByRole("button", { name: "Zatwierdź plan" }));
    await screen.findByText("Plan zatwierdzony");
    expect(screen.getByRole("button", { name: "Tak, utwórz skille" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tak, przejrzyj" })).toBeInTheDocument();
    expect(view.container.textContent).not.toMatch(/--|—/);
  });
});
