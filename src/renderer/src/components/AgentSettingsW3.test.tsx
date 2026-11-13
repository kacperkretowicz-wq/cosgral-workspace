import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { AgentTemplateCreator } from "./AgentSettingsW3";

describe("agent creator", () => {
  it("shows warnings returned after creating an agent", async () => {
    const create = vi.fn().mockResolvedValue({ bot: { id: "new" }, warnings: ["Skill unavailable"] });
    render(() => <AgentTemplateCreator templates={[]} create={create} />);
    await fireEvent.input(screen.getByLabelText("Agent name"), { target: { value: "Writer" } });
    await fireEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect(await screen.findByText("Skill unavailable")).toBeInTheDocument();
  });
});
