import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { McpPanel } from "./McpPanel";

describe("McpPanel", () => {
  it("submits HTTP secret in a masked field", async () => {
    const add = vi.fn();
    render(() => (
      <McpPanel servers={[]} settings={[]} onAdd={add} onRemove={vi.fn()} onReconnect={vi.fn()} onToggle={vi.fn()} />
    ));
    await fireEvent.input(screen.getByLabelText("Server name"), { target: { value: "remote" } });
    await fireEvent.change(screen.getByLabelText("Transport"), { target: { value: "http" } });
    await fireEvent.input(screen.getByLabelText("URL"), { target: { value: "http://localhost:1234" } });
    await fireEvent.input(screen.getByLabelText("Secret name"), { target: { value: "Authorization" } });
    expect(screen.getByLabelText("Secret value")).toHaveAttribute("type", "password");
    await fireEvent.input(screen.getByLabelText("Secret value"), { target: { value: "example" } });
    await fireEvent.click(screen.getByRole("button", { name: "Add server" }));
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ transport: "http", secrets: { Authorization: "example" } }),
    );
  });
});
