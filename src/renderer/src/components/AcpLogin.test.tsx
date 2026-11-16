import type { AcpLoginState } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { AcpLoginCard, AcpPresetCard } from "./AcpLogin";

const state: AcpLoginState = {
  agentId: "gemini",
  phase: "code-required",
  signedIn: false,
  message: null,
  url: "https://example.com/login",
  methods: [],
  methodId: null,
};
describe("ACP sign-in", () => {
  it("requires a detected or supplied command to add a preset", async () => {
    render(() => (
      <AcpPresetCard
        preset={{
          id: "gemini",
          name: "Gemini CLI",
          command: "gemini",
          args: ["--acp"],
          installUrl: "https://example.com/install",
          detectedCommand: null,
          added: false,
        }}
        onAdded={() => {}}
      />
    ));
    expect(screen.getByRole("button", { name: "Add Gemini CLI" })).toBeDisabled();
    fireEvent.input(screen.getByLabelText("Gemini CLI command"), { target: { value: "gemini" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Add Gemini CLI" })).not.toBeDisabled());
  });
  it("refuses an unsafe link", () => {
    render(() => (
      <AcpLoginCard
        name="Gemini"
        state={{ ...state, url: "javascript:alert(1)" }}
        onStart={async () => {}}
        onCancel={async () => {}}
        onCode={async () => {}}
      />
    ));
    expect(screen.getByRole("button", { name: "Open sign-in page" })).toBeDisabled();
  });
  it("clears the masked field before forwarding the code", async () => {
    let field: HTMLInputElement;
    let called = false;
    let receivedNonempty = false;
    let fieldWasEmpty = false;
    render(() => (
      <AcpLoginCard
        name="Gemini"
        state={state}
        onStart={async () => {}}
        onCancel={async () => {}}
        onCode={async (code) => {
          called = true;
          receivedNonempty = code.length > 0;
          fieldWasEmpty = field.value.length === 0;
        }}
      />
    ));
    const candidate = screen.getByLabelText("Authorization code");
    if (!(candidate instanceof HTMLInputElement)) throw new Error("Expected a code field");
    field = candidate;
    expect(field.type).toBe("password");
    fireEvent.input(field, { target: { value: "example-only" } });
    const form = field.closest("form");
    if (!form) throw new Error("Expected a form");
    fireEvent.submit(form);
    await waitFor(() => expect(called).toBe(true));
    expect(receivedNonempty).toBe(true);
    expect(fieldWasEmpty).toBe(true);
  });
  it("explains a rejected code and supports cancellation", async () => {
    const cancel = vi.fn(async () => {});
    render(() => (
      <AcpLoginCard
        name="Gemini"
        state={{ ...state, message: "invalid_grant" }}
        onStart={async () => {}}
        onCancel={cancel}
        onCode={async () => {}}
      />
    ));
    expect(screen.getByText("Code rejected, a new link was issued")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
});
