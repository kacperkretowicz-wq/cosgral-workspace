import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { MemoryPanel } from "./MemoryPanel";

describe("MemoryPanel", () => {
  it("saves an always memory and shows the exact prompt budget", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(() => (
      <MemoryPanel
        entries={[]}
        settings={{
          botId: "a",
          maxMemories: 3,
          customLimit: true,
          essentialCount: 0,
          searchableCount: 0,
          essentialInPrompt: 0,
          essentialPromptBytes: 80,
        }}
        onSave={save}
        onDelete={vi.fn()}
        onSearch={vi.fn()}
        onLimit={vi.fn()}
      />
    ));
    expect(screen.getByText(/80 \/ 8192 bytes/)).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText("Memory text"), { target: { value: "Prefers tea" } });
    await fireEvent.change(screen.getByLabelText("Inclusion"), { target: { value: "essential" } });
    await fireEvent.click(screen.getByRole("button", { name: "Save memory" }));
    expect(save).toHaveBeenCalledWith("Prefers tea", "essential", undefined);
  });
});
