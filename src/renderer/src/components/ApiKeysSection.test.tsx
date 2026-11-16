import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { maskApiKey, statusLabel } from "./api-keys-view";
import { ApiKeysSection, createMockApiKeys } from "./ApiKeysSection";

function openaiCard() {
  return screen.getByRole("group", { name: "OpenAI key" });
}

function anthropicCard() {
  return screen.getByRole("group", { name: "Anthropic key" });
}

describe("api-keys-view helpers", () => {
  it("masks to the last four characters", () => {
    expect(maskApiKey("sk-test-0000")).toBe("····0000");
    expect(statusLabel("rejected")).toBe("Rejected");
  });
});

describe("ApiKeysSection", () => {
  it("saves a key into a password field then clears the draft and shows the mask", async () => {
    const api = createMockApiKeys();
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
    await waitFor(() =>
      expect(within(openaiCard()).getByText(/Saved key ending in/)).toHaveTextContent("····1234"),
    );
    await waitFor(() => expect(within(openaiCard()).getByLabelText("OpenAI API key")).toHaveValue(""));
    expect(screen.queryByDisplayValue("sk-live-demo1234")).not.toBeInTheDocument();
  });

  it("checks connection only after click and can reject or accept", async () => {
    const api = createMockApiKeys([
      { provider: "openai", maskedKey: "····bad0", status: "unchecked" },
      { provider: "anthropic", maskedKey: null, status: "unchecked" },
    ]);
    render(() => <ApiKeysSection api={api} />);
    await waitFor(() =>
      expect(within(openaiCard()).getByText(/Saved key ending in/)).toHaveTextContent("····bad0"),
    );
    await fireEvent.click(within(openaiCard()).getByRole("button", { name: "Check connection" }));
    await waitFor(() => expect(within(openaiCard()).getByText("Rejected")).toBeInTheDocument());
    const field = () => within(openaiCard()).getByLabelText("OpenAI API key");
    field().focus();
    await fireEvent.input(field(), { target: { value: "sk-test-good" } });
    await waitFor(() => expect(field()).toHaveValue("sk-test-good"));
    await fireEvent.click(within(openaiCard()).getByRole("button", { name: "Save key" }));
    await waitFor(() =>
      expect(within(openaiCard()).getByText(/Saved key ending in/)).toHaveTextContent("····good"),
    );
    await fireEvent.click(within(openaiCard()).getByRole("button", { name: "Check connection" }));
    await waitFor(() => expect(within(openaiCard()).getByText("OK")).toBeInTheDocument());
  });

  it("removes a saved key and returns to no-key state", async () => {
    const api = createMockApiKeys([
      { provider: "openai", maskedKey: null, status: "unchecked" },
      { provider: "anthropic", maskedKey: "····9999", status: "ok" },
    ]);
    render(() => <ApiKeysSection api={api} />);
    await waitFor(() =>
      expect(within(anthropicCard()).getByText(/Saved key ending in/)).toHaveTextContent("····9999"),
    );
    await fireEvent.click(within(anthropicCard()).getByRole("button", { name: "Remove key" }));
    await waitFor(() => expect(within(anthropicCard()).getByText("No key saved")).toBeInTheDocument());
  });
});
