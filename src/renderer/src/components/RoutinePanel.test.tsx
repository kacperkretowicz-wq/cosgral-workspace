import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { RoutineForm } from "./RoutinePanel";

describe("RoutineForm", () => {
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
