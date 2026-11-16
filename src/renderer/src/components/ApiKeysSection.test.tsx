import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { createMockApiKeysApi } from "../../stories/mock-api-keys-api";
import { ApiKeysSection } from "./ApiKeysSection";
import { statusLabel } from "./api-keys-view";

function openaiCard() {
  return screen.getByRole("group", { name: "OpenAI key" });
}

function anthropicCard() {
  return screen.getByRole("group", { name: "Anthropic key" });
}

describe("api-keys-view helpers", () => {
  it("labels rejected keys", () => {
    expect(statusLabel("rejected")).toBe("Rejected");
  });
});

describe("ApiKeysSection", () => {
  it("saves a key into a password field then clears the draft and shows the mask", async () => {
    const api = createMockApiKeysApi(0);
    render(() => <ApiKeysSection api={api} />);
    await waitFor(() => expect(within(openaiCard()).getByText("No key saved")).toBeInTheDocument());
    // Yield once so the first async list can settle before we type into the draft.
    await new Promise((r) => setTimeout(r, 0));
    const field = within(openaiCard()).getByLabelText("OpenAI API key");
    expect(field).toHaveAttribute("type", "password");
    field.focus();
    await fireEvent.input(field, { target: { value: "sk-live-demo1234" } });
    await waitFor(() => expect(field).toHaveValue("sk-live-demo1234"));
    await fireEvent.click(within(openaiCard()).getByRole("button", { name: "Save key" }));
    await waitFor(() => expect(within(openaiCard()).getByText(/Saved key:/)).toHaveTextContent("••••1234"));
    await waitFor(() => expect(within(openaiCard()).getByLabelText("OpenAI API key")).toHaveValue(""));
    expect(screen.queryByDisplayValue("sk-live-demo1234")).not.toBeInTheDocument();
  });

  it("checks connection only after click and can reject or accept", async () => {
    const api = createMockApiKeysApi(0);
    await api.set({ provider: "codex", key: "bad-demo-bad0" });
    const check = vi.spyOn(api, "check");
    render(() => <ApiKeysSection api={api} />);
    await waitFor(() => expect(within(openaiCard()).getByText(/Saved key:/)).toHaveTextContent("••••bad0"));
    expect(check).not.toHaveBeenCalled();
    await fireEvent.click(within(openaiCard()).getByRole("button", { name: "Check connection" }));
    await waitFor(() => expect(within(openaiCard()).getByText("Rejected")).toBeInTheDocument());
    const field = () => within(openaiCard()).getByLabelText("OpenAI API key");
    field().focus();
    await fireEvent.input(field(), { target: { value: "sk-test-good0000" } });
    await waitFor(() => expect(field()).toHaveValue("sk-test-good0000"));
    await fireEvent.click(within(openaiCard()).getByRole("button", { name: "Save key" }));
    await waitFor(() => expect(within(openaiCard()).getByText(/Saved key:/)).toHaveTextContent("••••0000"));
    await fireEvent.click(within(openaiCard()).getByRole("button", { name: "Check connection" }));
    await waitFor(() => expect(within(openaiCard()).getByText("OK")).toBeInTheDocument());
  });

  it("removes a saved key and returns to no-key state", async () => {
    const api = createMockApiKeysApi(0);
    await api.set({ provider: "claude", key: "test-key-9999" });
    render(() => <ApiKeysSection api={api} />);
    await waitFor(() => expect(within(anthropicCard()).getByText(/Saved key:/)).toHaveTextContent("••••9999"));
    await fireEvent.click(within(anthropicCard()).getByRole("button", { name: "Remove key" }));
    await waitFor(() => expect(within(anthropicCard()).getByText("No key saved")).toBeInTheDocument());
  });
  it("announces checking and blocks conflicting actions until the check returns", async () => {
    const api = createMockApiKeysApi(0);
    await api.set({ provider: "codex", key: "test-key-1234" });
    const response = await api.list();
    let finish = () => {};
    api.check = () =>
      new Promise((resolve) => {
        finish = () => resolve(response[0]);
      });
    render(() => <ApiKeysSection api={api} />);
    await waitFor(() => expect(within(openaiCard()).getByText(/Saved key:/)).toBeInTheDocument());
    await fireEvent.click(within(openaiCard()).getByRole("button", { name: "Check connection" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Checking connection" })).toHaveAttribute("aria-busy", "true"),
    );
    expect(within(openaiCard()).getByRole("button", { name: "Remove key" })).toBeDisabled();
    finish();
    await waitFor(() => expect(within(openaiCard()).getByRole("button", { name: "Remove key" })).toBeEnabled());
  });
});
