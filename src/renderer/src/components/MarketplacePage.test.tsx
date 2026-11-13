import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { MarketplaceDetail } from "./MarketplacePage";

describe("marketplace", () => {
  it("blocks installing over a local skill", () => {
    render(() => <MarketplaceDetail bots={[{ id: "a", name: "Ada" }]} selectedBot="a" onSelectBot={vi.fn()} onInstall={vi.fn()} onUninstall={vi.fn()} details={{ item: { id: "skill:one", kind: "skill", title: "One", summary: "A skill", description: "Details", category: "writing", tags: [], featured: false, version: 1, skillName: "one", skills: [], libraryState: "local", installedBotIds: [] }, skillMd: null, files: [], agent: null }} />);
    expect(screen.getByRole("button", { name: "Install" })).toBeDisabled();
    expect(screen.getByText(/local skill with this name/i)).toBeInTheDocument();
  });
});
