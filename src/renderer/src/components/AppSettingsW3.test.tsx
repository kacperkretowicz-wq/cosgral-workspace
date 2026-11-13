import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { OnboardingW3 } from "./AppSettingsW3";

describe("onboarding", () => {
  it("passes the chosen language and provider once on completion", async () => {
    const complete = vi.fn().mockResolvedValue(undefined);
    render(() => (
      <OnboardingW3
        state={{
          completed: false,
          language: null,
          preferredProvider: null,
          firstAgentId: null,
          proposals: [],
          computerUse: { available: false, reason: "Unavailable" },
        }}
        complete={complete}
      />
    ));
    await fireEvent.change(screen.getByLabelText("Language"), { target: { value: "pl" } });
    await fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(complete).toHaveBeenCalledWith({ language: "pl", preferredProvider: "codex", firstAgent: null });
  });
});
