import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import { WorkflowsPage } from "./WorkflowsPage";

const create = vi.fn();

beforeEach(() => {
  create.mockReset();
  Object.assign(window, {
    openbot: {
      agent: {
        listBots: async () => [{ id: "ada", name: "Ada" }],
        onEvent: () => () => undefined,
      },
      channels: { list: async () => [{ id: "general", name: "general", title: "Ogólny", archived: false }] },
      routines: { list: async () => [] },
      workflows: { list: async () => [], listRuns: async () => [], create },
    },
  });
});
afterEach(() => {
  cleanup();
  setLanguage("en");
  flush();
});

const save = () => screen.getByRole("button", { name: /Save workflow|Zapisz przepływ/ });

async function draftWithOutput() {
  render(() => <WorkflowsPage />);
  await screen.findByRole("option", { name: "Ogólny" }).catch(() => undefined);
  await fireEvent.click(await screen.findByRole("button", { name: "Add trigger" }));
  await fireEvent.click(screen.getByRole("button", { name: "Add project output" }));
}

it("does not let a draft with an Output step without a channel be saved, and says what is missing", async () => {
  await draftWithOutput();
  const panel = await screen.findByRole("status");
  expect(panel).toHaveTextContent('Step "Project output" needs a project.');
  expect(panel).toHaveTextContent('Step "Project output" needs a text.');
  expect(save()).toBeDisabled();
});

it("says it in Polish, next to the step too", async () => {
  setLanguage("pl");
  flush();
  render(() => <WorkflowsPage />);
  await fireEvent.click(await screen.findByRole("button", { name: "Dodaj wyzwalacz" }));
  await fireEvent.click(screen.getByRole("button", { name: "Dodaj wiadomość do projektu" }));
  const panel = await screen.findByRole("status");
  expect(panel).toHaveTextContent("wymaga wybrania projektu");
  expect(panel).not.toHaveTextContent("needs a project");
  expect(screen.getAllByText(/wymaga wybrania projektu/).length).toBeGreaterThan(1);
});

it("opens Save once the channel and the text are filled in", async () => {
  await draftWithOutput();
  const channel = await screen.findByRole("combobox", { name: /Project/ });
  await waitFor(() => expect(screen.getByRole("option", { name: "Ogólny" })).toBeInTheDocument());
  await fireEvent.change(channel, { target: { value: "general" } });
  await fireEvent.input(screen.getByRole("textbox", { name: /Text/ }), { target: { value: "Done" } });
  // The output follows the trigger, so nothing is left unreachable.
  const [from, to] = screen.getAllByRole("combobox").filter((item) => item.closest("fieldset"));
  if (!from || !to) throw new Error("no connection fields");
  await fireEvent.change(from, { target: { value: from.querySelectorAll("option")[1]?.getAttribute("value") ?? "" } });
  await fireEvent.change(to, { target: { value: to.querySelectorAll("option")[2]?.getAttribute("value") ?? "" } });
  await fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await waitFor(() => expect(save()).toBeEnabled());
});

it("does not let a condition with an empty Compare with be saved", async () => {
  render(() => <WorkflowsPage />);
  await fireEvent.click(await screen.findByRole("button", { name: "Add trigger" }));
  await fireEvent.click(screen.getByRole("button", { name: "Add condition" }));
  const panel = await screen.findByRole("status");
  expect(panel).toHaveTextContent('Step "Condition" needs a value to compare with.');
  expect(save()).toBeDisabled();
});

it("shows the condition operators in Polish", async () => {
  setLanguage("pl");
  flush();
  render(() => <WorkflowsPage />);
  await fireEvent.click(await screen.findByRole("button", { name: "Dodaj wyzwalacz" }));
  await fireEvent.click(screen.getByRole("button", { name: "Dodaj warunek" }));
  expect(await screen.findByRole("option", { name: "zawiera" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "nie jest pusty" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "contains" })).not.toBeInTheDocument();
});

it("gives a connection from an approval a path the approval can have, not the leftover Next", async () => {
  render(() => <WorkflowsPage />);
  await fireEvent.click(await screen.findByRole("button", { name: "Add trigger" }));
  await fireEvent.click(screen.getByRole("button", { name: "Add approval" }));
  await fireEvent.click(screen.getByRole("button", { name: "Add agent" }));
  const [from, to] = screen.getAllByRole("combobox").filter((item) => item.closest("fieldset"));
  if (!from || !to) throw new Error("no connection fields");
  const optionValue = (select: HTMLElement, title: string) =>
    [...select.querySelectorAll("option")].find((option) => option.textContent === title)?.getAttribute("value") ?? "";
  await fireEvent.change(from, { target: { value: optionValue(from, "Approval") } });
  await fireEvent.change(to, { target: { value: optionValue(to, "Agent") } });
  await fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  const kind = document.querySelector('.workflow-edge-list [data-edge="allow"]');
  expect(kind).not.toBeNull();
  expect(document.querySelector('.workflow-edge-list [data-edge="next"]')).toBeNull();
});
