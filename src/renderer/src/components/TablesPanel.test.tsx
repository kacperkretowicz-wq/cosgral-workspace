import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { RowEditor } from "./TablesPanel";

describe("RowEditor", () => {
  it("offers the current row when a version conflicts", async () => {
    const row = {
      id: "r",
      tableId: "t",
      version: 1,
      values: { Name: "Old", Note: "Original" },
      createdByBotId: null,
      updatedByBotId: null,
      createdAt: "",
      updatedAt: "",
    };
    const save = vi
      .fn()
      .mockResolvedValue({
        status: "conflict",
        current: { ...row, version: 2, values: { Name: "New", Note: "Other change" } },
      });
    render(() => (
      <RowEditor
        table={{
          id: "t",
          name: "T",
          description: null,
          columns: [
            { name: "Name", type: "text" },
            { name: "Note", type: "text" },
          ],
          ownerBotId: null,
          rowCount: 1,
          createdAt: "",
          updatedAt: "",
        }}
        row={row}
        onSave={save}
        onDone={vi.fn()}
      />
    ));
    await fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Mine" } });
    await fireEvent.click(screen.getByRole("button", { name: "Save row" }));
    await screen.findByText(/New/);
    expect(screen.getByRole("button", { name: "Apply my changes" })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Apply my changes" }));
    expect(save).toHaveBeenLastCalledWith({ Name: "Mine" }, 2);
  });
});
