import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockBuiltinSkills, type MockBuiltinSkills } from "../../stories/mock-builtin-skills";
import { setLanguage } from "../i18n";
import { BuiltinSkillsPanel } from "./BuiltinSkillsPanel";

const BOTS = [
  { id: "chief", name: "Chief" },
  { id: "writer", name: "Writer" },
];
const PROJECTS = [
  { id: "p1", name: "launch", title: "Launch plan", memberBotIds: ["writer"], archived: false },
  { id: "p2", name: "old", title: "Old", memberBotIds: ["chief"], archived: true },
  { id: "p3", name: "empty", title: "Empty", memberBotIds: [], archived: false },
];

let mock: MockBuiltinSkills;
let listeners: Array<(event: AgentEvent) => void> = [];

beforeEach(() => {
  listeners = [];
  setLanguage("en");
  mock = createMockBuiltinSkills(
    (event) => {
      for (const listener of listeners) listener(event);
    },
    { botIds: () => BOTS.map((bot) => bot.id) },
  );
  Object.assign(window, {
    openbot: {
      builtinSkills: mock.api,
      agent: {
        onEvent: (listener: (event: AgentEvent) => void) => {
          listeners.push(listener);
          return () => {
            listeners = listeners.filter((item) => item !== listener);
          };
        },
      },
    },
  });
});
afterEach(cleanup);

const cardOf = (title: string): HTMLElement => {
  const row = screen.getByText(title, { selector: "strong" }).closest("li");
  if (!(row instanceof HTMLElement)) throw new Error("no card");
  return row;
};

it("shows the three sets with their license and source", async () => {
  render(() => <BuiltinSkillsPanel bots={BOTS} projects={PROJECTS} />);
  expect(await screen.findByText("Superpowers", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByText("I have ADHD", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByText("Graphify", { selector: "strong" })).toBeInTheDocument();
  expect(within(cardOf("Graphify")).getByText(/License: Apache-2\.0/)).toBeInTheDocument();
  expect(within(cardOf("Superpowers")).getByText("https://github.com/obra/superpowers")).toBeInTheDocument();
  expect(within(cardOf("Superpowers")).getByText("Agents with this set: 0 of 2")).toBeInTheDocument();
});

it("turns a set on for all agents, answers with a sentence and then offers to turn it off", async () => {
  render(() => <BuiltinSkillsPanel bots={BOTS} projects={PROJECTS} />);
  await screen.findByText("Superpowers", { selector: "strong" });
  const card = within(cardOf("Superpowers"));
  await fireEvent.click(card.getByRole("button", { name: "Turn off for all agents" }));
  expect(await card.findByText("No agent has Superpowers turned on.")).toBeInTheDocument();
  await fireEvent.click(card.getByRole("button", { name: "Turn on for all agents" }));
  expect(await card.findByText("Superpowers is on. Agents changed: 2.")).toBeInTheDocument();
  expect(card.getByText("Agents with this set: 2 of 2")).toBeInTheDocument();
  await waitFor(() => expect(card.getByRole("button", { name: "Turn off for all agents" })).toBeEnabled());
  await fireEvent.click(card.getByRole("button", { name: "Turn off for all agents" }));
  expect(await card.findByText("Superpowers is off. Agents changed: 2.")).toBeInTheDocument();
  expect(card.getByText("Agents with this set: 0 of 2")).toBeInTheDocument();
});

it("turns a set on for the agents of one project only; empty and archived projects are not offered", async () => {
  render(() => <BuiltinSkillsPanel bots={BOTS} projects={PROJECTS} />);
  await screen.findByText("Superpowers", { selector: "strong" });
  const card = within(cardOf("Superpowers"));
  const options = card.getAllByRole("option").map((option) => option.textContent);
  expect(options).toEqual(["Choose a project", "Launch plan"]);
  const button = card.getByRole("button", { name: "Turn on for the project’s agents" });
  await fireEvent.click(button);
  expect(await card.findByText("Choose a project first.")).toBeInTheDocument();
  await fireEvent.change(card.getByLabelText("Project"), { target: { value: "p1" } });
  await fireEvent.click(button);
  expect(await card.findByText("Agents with this set: 1 of 2")).toBeInTheDocument();
});

it("switches one agent on and off from the list of agents", async () => {
  render(() => <BuiltinSkillsPanel bots={BOTS} projects={[]} />);
  await screen.findByText("Superpowers", { selector: "strong" });
  const card = within(cardOf("Superpowers"));
  const chief = card.getByRole("switch", { name: "Chief" });
  expect(chief).not.toBeChecked();
  await fireEvent.click(chief);
  expect(await card.findByText("Agents with this set: 1 of 2")).toBeInTheDocument();
  expect(card.getByText("Superpowers is on. Agents changed: 1.")).toBeInTheDocument();
  await waitFor(() => expect(card.getByRole("switch", { name: "Chief" })).toBeChecked());
  expect(card.getByRole("switch", { name: "Writer" })).not.toBeChecked();
});

it("switches the new-agent default and says what will happen", async () => {
  render(() => <BuiltinSkillsPanel bots={BOTS} projects={[]} />);
  await screen.findByText("Graphify", { selector: "strong" });
  const card = within(cardOf("Graphify"));
  const toggle = card.getByRole("switch", { name: "Give to new agents" });
  expect(toggle).not.toBeChecked();
  await fireEvent.click(toggle);
  expect(await card.findByText("New agents will get Graphify.")).toBeInTheDocument();
  expect(card.queryByRole("option")).toBeNull();
});

it("explains the missing graphify program, copies the command and checks again", async () => {
  const writeText = vi.fn(async () => undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(() => <BuiltinSkillsPanel bots={BOTS} projects={[]} />);
  await screen.findByText("Graphify", { selector: "strong" });
  const card = within(cardOf("Graphify"));
  expect(card.getByText("The program “graphify” was not found. Without it the skill cannot work.")).toBeInTheDocument();
  expect(card.getByText("uv tool install graphifyy")).toBeInTheDocument();
  await fireEvent.click(card.getByRole("button", { name: "Copy the command" }));
  expect(writeText).toHaveBeenCalledWith("uv tool install graphifyy");
  expect(await card.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  mock.simulate.programFound(true);
  await fireEvent.click(card.getByRole("button", { name: "Check again" }));
  expect(await card.findByText("The program “graphify” is on this computer.")).toBeInTheDocument();
});

it("says so when the build has no built-in skills, and when there are no agents", async () => {
  Object.assign(window, { openbot: { agent: { onEvent: () => () => undefined } } });
  render(() => <BuiltinSkillsPanel bots={BOTS} />);
  expect(screen.getByText("Built-in skills are unavailable in this build.")).toBeInTheDocument();
  cleanup();
  Object.assign(window, {
    openbot: { builtinSkills: mock.api, agent: { onEvent: () => () => undefined } },
  });
  render(() => <BuiltinSkillsPanel bots={[]} />);
  await screen.findByText("Superpowers", { selector: "strong" });
  const card = within(cardOf("Superpowers"));
  await fireEvent.click(card.getByRole("button", { name: "Turn on for all agents" }));
  expect(await card.findByText("There are no agents to change.")).toBeInTheDocument();
});

it("shows the Polish texts in Polish", async () => {
  setLanguage("pl");
  render(() => <BuiltinSkillsPanel bots={BOTS} projects={PROJECTS} />);
  await screen.findByText("Superpowers", { selector: "strong" });
  const card = within(cardOf("Superpowers"));
  expect(card.getByText("Agenci z tym zestawem: 0 z 2")).toBeInTheDocument();
  expect(card.getByRole("button", { name: "Włącz u wszystkich agentów" })).toBeInTheDocument();
  expect(card.getByText(/Zestaw nawyków pracy agenta/)).toBeInTheDocument();
  expect(within(cardOf("Graphify")).getByText(/Nie znaleziono programu „graphify”/)).toBeInTheDocument();
});
