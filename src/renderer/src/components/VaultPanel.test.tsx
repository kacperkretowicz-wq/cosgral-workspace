import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { VaultForm } from "./VaultPanel";

describe("VaultForm", () => {
  it("does not replace an existing password when the field is blank", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(() => (
      <VaultForm
        initial={{
          id: "a",
          kind: "login",
          label: "Work",
          origin: "https://example.com",
          username: "sam",
          hasTwoStepKey: true,
          cardLast4: null,
          cardExpiry: null,
          name: null,
          createdAt: "",
          updatedAt: "",
        }}
        onSave={save}
      />
    ));
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    await fireEvent.click(screen.getByRole("button", { name: "Save item" }));
    expect(save).toHaveBeenCalledWith({
      id: "a",
      kind: "login",
      label: "Work",
      url: "https://example.com",
      username: "sam",
    });
  });
});
