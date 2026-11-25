import type { Routine } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoutineEditForm, RoutineForm, RoutinePanel } from "./RoutinePanel";

describe("RoutineForm", () => {
  it("explains each trigger in a plain sentence under the choice", async () => {
    render(() => <RoutineForm bots={[{ id: "a", name: "Alex" }]} onCreate={vi.fn()} />);
    expect(screen.getByText(/after the number of minutes you give/)).toBeInTheDocument();
    await fireEvent.change(screen.getByLabelText("Trigger"), { target: { value: "cron" } });
    expect(screen.getByText(/0 9 \* \* 1-5 means 9:00 from Monday to Friday/)).toBeInTheDocument();
    await fireEvent.change(screen.getByLabelText("Trigger"), { target: { value: "webhook" } });
    expect(screen.getByText(/another program sends a signal/)).toBeInTheDocument();
  });

  it("creates a daily schedule with its time zone", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    render(() => <RoutineForm bots={[{ id: "a", name: "Alex" }]} onCreate={create} />);
    await fireEvent.input(screen.getByLabelText("Routine name"), { target: { value: "Daily check" } });
    await fireEvent.input(screen.getByLabelText("Instructions"), { target: { value: "Review work" } });
    await fireEvent.change(screen.getByLabelText("Trigger"), { target: { value: "daily" } });
    await fireEvent.input(screen.getByLabelText("Time"), { target: { value: "09:00" } });
    await fireEvent.click(screen.getByRole("button", { name: "Create routine" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Daily check", schedule: { type: "daily", time: "09:00" }, trigger: "schedule" }),
    );
  });
});

const routine: Routine = {
  id: "r1",
  botId: "a",
  name: "Poranny przegląd",
  prompt: "Podsumuj wczoraj",
  trigger: "schedule",
  schedule: { type: "interval", everyMinutes: 60 },
  timezone: "Europe/Warsaw",
  paused: false,
  nextRunAt: null,
  webhook: null,
  createdBy: "person",
  createdAt: "2026-11-25T10:00:00Z",
  updatedAt: "2026-11-25T10:00:00Z",
};

describe("RoutineEditForm", () => {
  it("starts with the routine's values and saves only what the contract allows", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(() => <RoutineEditForm routine={routine} onSave={save} onCancel={() => undefined} />);
    expect(screen.getByLabelText("Routine name")).toHaveValue("Poranny przegląd");
    await fireEvent.change(screen.getByLabelText("How often"), { target: { value: "daily" } });
    await fireEvent.input(screen.getByLabelText("Time"), { target: { value: "08:30" } });
    await fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith({
      routineId: "r1",
      name: "Poranny przegląd",
      prompt: "Podsumuj wczoraj",
      timezone: "Europe/Warsaw",
      schedule: { type: "daily", time: "08:30" },
    });
  });

  it("keeps the weekdays of a daily routine and leaves a webhook routine without a schedule", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const daily: Routine = { ...routine, schedule: { type: "daily", time: "09:00", weekdays: [1, 2] } };
    const first = render(() => <RoutineEditForm routine={daily} onSave={save} onCancel={() => undefined} />);
    await fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save.mock.calls[0]?.[0].schedule).toEqual({ type: "daily", time: "09:00", weekdays: [1, 2] });
    first.unmount();

    const webhook: Routine = { ...routine, trigger: "webhook", schedule: null };
    render(() => <RoutineEditForm routine={webhook} onSave={save} onCancel={() => undefined} />);
    expect(screen.queryByLabelText("How often")).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save.mock.calls[1]?.[0]).not.toHaveProperty("schedule");
  });

  it("shows why saving failed and stays open", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Pick a shorter interval."));
    render(() => <RoutineEditForm routine={routine} onSave={save} onCancel={() => undefined} />);
    await fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a shorter interval.");
  });
});

describe("RoutinePanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("deletes a routine after a confirmation and edits it in place", async () => {
    let list = [routine];
    const remove = vi.fn(async () => {
      list = [];
    });
    const update = vi.fn(async (input: { name?: string }) => {
      list = [{ ...routine, name: input.name ?? routine.name }];
      return list[0];
    });
    Object.assign(window, {
      openbot: {
        agent: { onEvent: () => () => undefined },
        routines: { list: async () => list, listRuns: async () => [], delete: remove, update },
      },
    });
    render(() => <RoutinePanel bots={[{ id: "a", name: "Alex" }]} />);
    await screen.findByText("Poranny przegląd");

    await fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const form = within(screen.getByRole("region", { name: "Edit routine" }));
    await fireEvent.input(form.getByLabelText("Routine name"), { target: { value: "Wieczorny przegląd" } });
    await fireEvent.click(form.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ routineId: "r1", name: "Wieczorny przegląd" })),
    );
    await screen.findByText("Wieczorny przegląd");
    expect(screen.queryByRole("region", { name: "Edit routine" })).not.toBeInTheDocument();

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(remove).not.toHaveBeenCalled();

    vi.spyOn(window, "confirm").mockReturnValueOnce(true);
    await fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith({ routineId: "r1" }));
    await waitFor(() => expect(screen.queryByText("Wieczorny przegląd")).not.toBeInTheDocument());
  });
});
