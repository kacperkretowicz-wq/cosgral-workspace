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

afterEach(() => {
  setLanguage("en");
  // A spy left by one test (the confirm of the delete question) must not count calls of the next one.
  vi.restoreAllMocks();
});

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

  const daily = { ...base, schedule: { type: "daily", time: "09:00" } } as const;

  it("edits a routine: name, instruction, time and weekdays are saved through update, and the list shows them", async () => {
    const created = await mock.create(daily);
    const update = vi.spyOn(mock, "update");
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    await fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const form = within(await screen.findByRole("region", { name: "Edit routine" }));
    // The form starts with what the routine has.
    expect(form.getByLabelText("Routine name")).toHaveValue("Review");
    expect(form.getByLabelText("What the lead does on each run")).toHaveValue("Summarise.");
    expect(form.getByLabelText("Time")).toHaveValue("09:00");
    expect(form.getByLabelText("Mon")).not.toBeChecked();
    await fireEvent.input(form.getByLabelText("Routine name"), { target: { value: "Monday and Wednesday review" } });
    await fireEvent.input(form.getByLabelText("What the lead does on each run"), {
      target: { value: "Check the plan." },
    });
    await fireEvent.input(form.getByLabelText("Time"), { target: { value: "08:30" } });
    await fireEvent.click(form.getByLabelText("Mon"));
    await fireEvent.click(form.getByLabelText("Wed"));
    await fireEvent.click(form.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        routineId: created.id,
        name: "Monday and Wednesday review",
        prompt: "Check the plan.",
        schedule: { type: "daily", time: "08:30", weekdays: [1, 3] },
        timezone: expect.any(String),
      }),
    );
    // The form closes and the list says what changed, in the week order of the contract (Sunday 0).
    await waitFor(() => expect(screen.queryByRole("region", { name: "Edit routine" })).not.toBeInTheDocument());
    expect(screen.getByText("Monday and Wednesday review")).toBeInTheDocument();
    expect(screen.getByText(/Daily at 08:30 on Mon, Wed/)).toBeInTheDocument();
    expect((await mock.list({ channelId: "c1" }))[0]).toMatchObject({
      name: "Monday and Wednesday review",
      schedule: { type: "daily", time: "08:30", weekdays: [1, 3] },
    });
  });

  it("unticking every weekday means every day again, and Sunday (0) is listed last but saved as 0", async () => {
    await mock.create({ ...base, schedule: { type: "daily", time: "09:00", weekdays: [0, 5] } });
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    expect(await screen.findByText(/Daily at 09:00 on Sun, Fri/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const form = within(await screen.findByRole("region", { name: "Edit routine" }));
    const labels = form
      .getAllByLabelText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/)
      .map((box) => box.parentElement?.textContent);
    expect(labels).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(form.getByLabelText("Sun")).toBeChecked();
    expect(form.getByLabelText("Fri")).toBeChecked();
    await fireEvent.click(form.getByLabelText("Sun"));
    await fireEvent.click(form.getByLabelText("Fri"));
    await fireEvent.click(form.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByText(/on Sun, Fri/)).not.toBeInTheDocument());
    expect(screen.getByText(/Daily at 09:00/)).toBeInTheDocument();
    expect((await mock.list({ channelId: "c1" }))[0]?.schedule).toEqual({ type: "daily", time: "09:00" });
  });

  it("an edit that breaks a rule says why, sends nothing and keeps the routine; Cancel closes the form", async () => {
    await mock.create(daily);
    const update = vi.spyOn(mock, "update");
    render(() => <ChannelRoutinesPanel channel={panelChannel} />);
    await fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    let form = within(await screen.findByRole("region", { name: "Edit routine" }));
    await fireEvent.input(form.getByLabelText("Routine name"), { target: { value: "   " } });
    await fireEvent.click(form.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Give the routine a name."));
    expect(update).not.toHaveBeenCalled();
    expect((await mock.list({ channelId: "c1" }))[0]?.name).toBe("Review");
    await fireEvent.click(form.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Edit routine" })).not.toBeInTheDocument());
    expect(screen.getByText("Review")).toBeInTheDocument();
    // A cron with the wrong number of fields is refused the same way.
    await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    form = within(await screen.findByRole("region", { name: "Edit routine" }));
    await fireEvent.change(form.getByLabelText("Repeats"), { target: { value: "cron" } });
    await fireEvent.input(form.getByLabelText("Cron expression"), { target: { value: "* *" } });
    await fireEvent.click(form.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("five fields"));
    expect(update).not.toHaveBeenCalled();
  });
});
