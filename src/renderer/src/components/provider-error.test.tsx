import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { STORY_MODELS } from "../../stories/fixtures";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { accountError } from "./account-state";
import { ProviderFallbackLists } from "./ProviderFallbackLists";
import { ProvidersPage } from "./ProvidersPage";
import { providerError, safeCliError } from "./provider-error";

const raw = "Error invoking remote method 'providers:set-fallback-models': Error: At most 8 models.";
describe("provider error display", () => {
  it("cleans Error objects and string IPC failures", () => {
    expect(providerError(new Error(raw), "Fallback")).toBe("At most 8 models.");
    expect(providerError(`Error: ${raw}`, "Fallback")).toBe("At most 8 models.");
  });
  it("preserves plain reasons and uses fallback for unknown or empty values", () => {
    expect(providerError("Connection unavailable.", "Fallback")).toBe("Connection unavailable.");
    expect(providerError({}, "Fallback")).toBe("Fallback");
    expect(providerError("", "Fallback")).toBe("Fallback");
  });
  it("keeps CLI path redaction and cleans account limit refusals", () => {
    expect(safeCliError("Cannot open C:\\Users\\Example\\cli.exe")).not.toContain("Example");
    expect(
      accountError(
        new Error("Error invoking remote method 'subscriptions:add-account': Error: Account limit reached."),
      ),
    ).toBe("Account limit reached.");
  });
  it("renders a clean fallback save refusal in the provider group", async () => {
    const mock = createMockOpenBot();
    const api = mock.api.providers;
    if (!api) throw new Error("Missing providers.");
    vi.spyOn(api, "setFallbackModels").mockRejectedValue(new Error(raw));
    try {
      render(() => (
        <ProviderFallbackLists
          groups={[{ scope: "provider:codex", label: "Codex" }]}
          options={STORY_MODELS}
          api={api}
        />
      ));
      const group = within(screen.getByRole("region", { name: "Codex fallback list" }));
      await waitFor(() => expect(group.getByLabelText("Add fallback model")).toBeEnabled());
      await fireEvent.change(group.getByLabelText("Add fallback model"), { target: { value: "claude-opus-5" } });
      await fireEvent.click(group.getByRole("button", { name: "Save order" }));
      expect(await group.findByRole("alert")).toHaveTextContent("At most 8 models.");
      expect(group.getByRole("alert")).not.toHaveTextContent("Error invoking");
    } finally {
      mock.dispose();
    }
  });
  it("cleans a refusal while saving an agent list on ProvidersPage", async () => {
    const mock = createMockOpenBot();
    const api = mock.api.providers;
    if (!api) throw new Error("Missing providers.");
    const previous = window.openbot;
    window.openbot = mock.api;
    vi.spyOn(api, "setFallbackModels").mockRejectedValue(new Error(raw));
    try {
      render(() => <ProvidersPage />);
      const group = within(screen.getByRole("group", { name: "Agent fallback settings" }));
      await waitFor(() => expect(group.getByLabelText("Add fallback model")).toBeEnabled());
      await fireEvent.change(group.getByLabelText("Add fallback model"), { target: { value: "claude-opus-5" } });
      await fireEvent.click(group.getByRole("button", { name: "Save order" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("At most 8 models.");
      expect(screen.getByRole("alert")).not.toHaveTextContent("Error invoking");
    } finally {
      mock.dispose();
      window.openbot = previous;
    }
  });
});
