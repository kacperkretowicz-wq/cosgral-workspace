import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { SkillsPanel } from "./SkillsPanel";

describe("SkillsPanel", () => {
  it("asks before overwriting a locally modified installation", async () => {
    const update = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(() => (
      <SkillsPanel
        skills={[
          {
            id: "s",
            name: "report",
            description: "",
            examplePrompt: null,
            version: 2,
            createdByBotId: null,
            createdAt: "",
            updatedAt: "",
            path: "",
          },
        ]}
        installs={[
          {
            botId: "b",
            skillId: "s",
            name: "report",
            installedVersion: 1,
            latestVersion: 2,
            updateAvailable: true,
            modifiedLocally: true,
            path: "",
            installedAt: "",
          },
        ]}
        onInspect={vi.fn()}
        onInstall={vi.fn()}
        onUpdate={update}
        onUninstall={vi.fn()}
      />
    ));
    await fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
