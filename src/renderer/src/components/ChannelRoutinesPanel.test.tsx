import type { AgentEvent, WorkspaceChannel } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockChannelRoutines, type MockChannelRoutines } from "../../stories/mock-channel-routines";
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

// KK-Y: the cases of the earlier KK panel, moved onto this panel and run against the mock of the routines of a channel.
describe("ChannelRoutinesPanel on the mock of the routines of a channel (KK-Y)", () => {
  const fullChannel = (patch: Partial<WorkspaceChannel> = {}): WorkspaceChannel => ({
    id: "c1",
    name: "project",
    title: "Project",
    instructions: "",
    leadBotId: "chief",
    memberBotIds: ["chief"],
    isolated: false,
    archived: false,
    createdAt: "2026-11-18T09:00:00.000Z",
    updatedAt: "2026-11-18T09:00:00.000Z",
    ...patch,
  });
  const panelChannel = { id: "c1", archived: false, leadBotId: "chief" };
  const base = {
    channelId: "c1",
    name: "Review",
    prompt: "Summarise.",
    schedule: { type: "interval", everyMinutes: 30 },
  } as const;

  let mock: MockChannelRoutines;
  let listeners: Array<(event: AgentEvent) => void> = [];

  function install(withApi = true) {
    Object.defineProperty(window, "openbot", {
      configurable: true,
      value: {
        channelRoutines: withApi ? mock : undefined,
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
  }

  async function fillForm(name: string, prompt: string) {
    const form = within(await screen.findByRole("region", { name: "New channel routine" }));
    await fireEvent.input(form.getByLabelText("Routine name"), { target: { value: name } });
    await fireEvent.input(form.getByLabelText("What the lead does on each run"), { target: { value: prompt } });
    return form;
  }

  beforeEach(() => {
    listeners = [];
    mock = createMockChannelRoutines({
      channels: () => [fullChannel()],
      emit: (event) => {
        for (const listener of listeners) listener(event);
      },
    });
    install();
  });
  afterEach(cleanup);

  it("says so when this build has no routines of a channel", async () => {
    install(false);
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    expect(await screen.findByText("Channel routines are unavailable in this build.")).toBeInTheDocument();
  });

  it("shows an empty channel, makes an interval routine and lists it with its schedule", async () => {
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    await screen.findByText("No routines in this channel yet.");
    const form = await fillForm("Weekly review", "Summarise the week.");
    await fireEvent.change(form.getByLabelText("Repeats"), { target: { value: "interval" } });
    await fireEvent.input(await screen.findByLabelText("Minutes"), { target: { value: "30" } });
    await fireEvent.click(form.getByRole("button", { name: "Create routine" }));
    await waitFor(() => expect(screen.getByText("Weekly review")).toBeInTheDocument());
    expect(screen.getByText(/Every 30 min/)).toBeInTheDocument();
    expect(screen.getByText(/Active/)).toBeInTheDocument();
  });

  it("shows the sentence of the rules for a wrong interval and sends nothing", async () => {
    const create = vi.spyOn(mock, "create");
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    const form = await fillForm("Review", "Summarise.");
    await fireEvent.change(form.getByLabelText("Repeats"), { target: { value: "interval" } });
    await fireEvent.input(await screen.findByLabelText("Minutes"), { target: { value: "0" } });
    await fireEvent.click(form.getByRole("button", { name: "Create routine" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The interval is from"));
    expect(create).not.toHaveBeenCalled();
    expect(await mock.list()).toEqual([]);
  });

  it("refuses a channel without a lead with the sentence of the rules", async () => {
    render(() => <ChannelRoutinesPanel channel={{ id: "c1", archived: false, leadBotId: null }} />);
    const form = await fillForm("Review", "Summarise.");
    await fireEvent.click(form.getByRole("button", { name: "Create routine" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("has no lead"));
  });

  it("pauses and resumes a routine", async () => {
    await mock.create(base);
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    await fireEvent.click(await screen.findByRole("button", { name: "Pause" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument());
    expect(screen.getByText("No scheduled run")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    expect((await mock.list({ channelId: "c1" }))[0]).toMatchObject({ paused: false });
  });

  it("runs now, sends the message to the channel and shows the history with the state of the task", async () => {
    await mock.create(base);
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    await fireEvent.click(await screen.findByRole("button", { name: "Run now" }));
    await waitFor(() => expect(mock.sent()).toHaveLength(1));
    expect(mock.sent()[0]?.text).toBe("Scheduled: Review\n\nSummarise.");
    await fireEvent.click(screen.getByRole("button", { name: "History" }));
    await waitFor(() => expect(screen.getByText(/Task queued/)).toBeInTheDocument());
  });

  it("says why a second run is refused while the first one is still going", async () => {
    await mock.create(base);
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    await fireEvent.click(await screen.findByRole("button", { name: "Run now" }));
    await waitFor(() => expect(mock.sent()).toHaveLength(1));
    await fireEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("still going"));
    expect(mock.sent()).toHaveLength(1);
  });

  it("keeps the routine when the question about deleting is answered No, and deletes it on Yes", async () => {
    await mock.create(base);
    const ask = vi.spyOn(window, "confirm").mockReturnValue(false);
    ask.mockClear();
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    await fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(ask).toHaveBeenCalledTimes(1);
    expect(await mock.list()).toHaveLength(1);
    ask.mockReturnValue(true);
    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByText("Review")).not.toBeInTheDocument());
    expect(await mock.list()).toEqual([]);
    ask.mockRestore();
  });

  it("follows a routine that the program starts by itself (the event of the channel)", async () => {
    await mock.create(base);
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    await screen.findByText("Review");
    expect(screen.queryByText(/Last:/)).not.toBeInTheDocument();
    mock.tick(31);
    await waitFor(() => expect(screen.getByText(/Last:/)).toBeInTheDocument());
  });
});
