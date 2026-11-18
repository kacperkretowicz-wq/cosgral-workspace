import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { setLanguage } from "../i18n";
import { ChannelRoutinesPanel, describeSchedule } from "./ChannelRoutinesPanel";

const channel = { id: "demo-channel", archived: false, leadBotId: "chief" };

function setup() {
  const mock = createMockOpenBot();
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
  return mock;
}

async function fill(name: string, prompt: string) {
  const form = within(screen.getByRole("region", { name: "New channel routine" }));
  await fireEvent.input(form.getByLabelText("Routine name"), { target: { value: name } });
  await fireEvent.input(form.getByLabelText("What the lead does on each run"), { target: { value: prompt } });
  return form;
}

afterEach(() => setLanguage("en"));

describe("ChannelRoutinesPanel", () => {
  it("creates a daily routine, runs it now and shows the history with the task state", async () => {
    const mock = setup();
    const view = render(() => <ChannelRoutinesPanel channel={channel} />);
    await screen.findByText("No routines in this channel yet.");
    const form = await fill("Morning brief", "Summarize the night");
    await fireEvent.input(form.getByLabelText("Time"), { target: { value: "08:30" } });
    await fireEvent.click(form.getByRole("button", { name: "Create routine" }));
    await screen.findByText("Morning brief");
    expect(screen.getByText(/Daily at 08:30/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await fireEvent.click(screen.getByRole("button", { name: "History" }));
    await screen.findByText(/Task queued/);
    expect(await mock.api.channelRoutines?.list({ channelId: "demo-channel" })).toHaveLength(1);
    view.unmount();
    mock.dispose();
  });

  it("shows the contract reason and does not create when the form is wrong", async () => {
    const mock = setup();
    const api = mock.api.channelRoutines;
    if (!api) throw new Error("mock without channel routines");
    const create = vi.spyOn(api, "create");
    const view = render(() => <ChannelRoutinesPanel channel={channel} />);
    await screen.findByText("No routines in this channel yet.");
    const form = within(screen.getByRole("region", { name: "New channel routine" }));
    await fireEvent.click(form.getByRole("button", { name: "Create routine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Give the routine a name.");
    expect(create).not.toHaveBeenCalled();
    view.unmount();
    mock.dispose();
  });

  it("pauses and deletes a routine, and follows the changes sent by the program", async () => {
    const mock = setup();
    const view = render(() => <ChannelRoutinesPanel channel={channel} />);
    await screen.findByText("No routines in this channel yet.");
    const form = await fill("Weekly", "Report");
    await fireEvent.click(form.getByRole("button", { name: "Create routine" }));
    await screen.findByText("Weekly");
    await fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await screen.findByRole("button", { name: "Resume" });
    expect(screen.getByText("No scheduled run")).toBeInTheDocument();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Weekly")).not.toBeInTheDocument());
    view.unmount();
    mock.dispose();
  });

  it("speaks Polish and describes every schedule kind", async () => {
    const mock = setup();
    setLanguage("pl");
    const view = render(() => <ChannelRoutinesPanel channel={channel} />);
    await screen.findByText("W tym kanale nie ma jeszcze rutyn.");
    expect(screen.getByRole("button", { name: "Utwórz rutynę" })).toBeInTheDocument();
    expect(describeSchedule({ type: "interval", everyMinutes: 15 })).toBe("Co 15 min");
    expect(describeSchedule({ type: "daily", time: "09:00" })).toBe("Codziennie o 09:00");
    expect(describeSchedule({ type: "cron", expression: "0 9 * * 1" })).toBe("Cron 0 9 * * 1");
    view.unmount();
    mock.dispose();
  });
});
