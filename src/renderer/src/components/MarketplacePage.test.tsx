import type { MarketplaceItem } from "@openbot/contracts/ipc";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import { MarketplaceDetail, matchesBothLanguages } from "./MarketplacePage";

afterEach(() => {
  cleanup();
  setLanguage("en");
});

const meetingNotes: MarketplaceItem = {
  id: "skill:meeting-notes",
  kind: "skill",
  title: "Meeting notes",
  summary: "Turns raw meeting notes into decisions, action items, owners and dates.",
  description:
    "Reads notes or a transcript of a meeting and writes a short summary: what was decided, who does what by when, and open questions. It asks before it sends the summary to anyone.",
  category: "productivity",
  tags: ["meetings", "notes"],
  featured: true,
  version: 1,
  skillName: "meeting-notes",
  skills: [],
  libraryState: null,
  installedBotIds: [],
};

describe("marketplace", () => {
  it("blocks installing over a local skill", () => {
    render(() => (
      <MarketplaceDetail
        bots={[{ id: "a", name: "Ada" }]}
        selectedBot="a"
        onSelectBot={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        details={{
          item: {
            id: "skill:one",
            kind: "skill",
            title: "One",
            summary: "A skill",
            description: "Details",
            category: "writing",
            tags: [],
            featured: false,
            version: 1,
            skillName: "one",
            skills: [],
            libraryState: "local",
            installedBotIds: [],
          },
          skillMd: null,
          files: [],
          agent: null,
        }}
      />
    ));
    expect(screen.getByRole("button", { name: "Install" })).toBeDisabled();
    expect(screen.getByText(/local skill with this name/i)).toBeInTheDocument();
  });

  it("shows the catalog's title, description and category in Polish (they were English on Polish screens)", () => {
    setLanguage("pl");
    render(() => (
      <MarketplaceDetail
        bots={[]}
        selectedBot=""
        onSelectBot={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        details={{ item: meetingNotes, skillMd: null, files: [], agent: null }}
      />
    ));
    expect(screen.getByRole("heading", { name: "Notatki ze spotkań" })).toBeInTheDocument();
    expect(screen.getByText(/Czyta notatki albo zapis spotkania/)).toBeInTheDocument();
    expect(screen.getByText(/Produktywność/)).toBeInTheDocument();
  });

  it("finds an item by Polish or English words, without accents, and only when every word matches", () => {
    setLanguage("pl");
    // Solid 2 applies a signal write on the next flush; read the dictionary after it.
    flush();
    expect(matchesBothLanguages(meetingNotes, "notatki")).toBe(true);
    expect(matchesBothLanguages(meetingNotes, "spotkan")).toBe(true);
    expect(matchesBothLanguages(meetingNotes, "meeting decyzje")).toBe(true);
    expect(matchesBothLanguages(meetingNotes, "produktywnosc")).toBe(true);
    expect(matchesBothLanguages(meetingNotes, "notatki podróż")).toBe(false);
  });

  const agent: MarketplaceItem = {
    ...meetingNotes,
    id: "agent:research-analyst",
    kind: "agent",
    title: "Research analyst",
    skillName: null,
    libraryState: null,
  };
  const agentDetails = (installedBotIds: string[]) => ({
    item: { ...agent, installedBotIds },
    skillMd: null,
    files: [],
    agent: { role: "Research and analysis", description: "You research.", memories: [] },
  });

  it("brings the details into view when a card is opened", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scrollIntoView, configurable: true });
    render(() => (
      <MarketplaceDetail
        bots={[]}
        selectedBot=""
        onSelectBot={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        details={agentDetails([])}
      />
    ));
    flush();
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole("region", { name: "Item details" }));
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  });

  it("shows the role in Polish and says Installed once the agent exists", () => {
    setLanguage("pl");
    render(() => (
      <MarketplaceDetail
        bots={[{ id: "a", name: "Analityk" }]}
        selectedBot=""
        onSelectBot={vi.fn()}
        onInstall={vi.fn()}
        onUninstall={vi.fn()}
        details={agentDetails(["a"])}
      />
    ));
    expect(screen.getByText("Rola: Badania i analiza")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zainstalowane" })).toBeDisabled();
  });

  it("keeps Install for an agent that is not installed yet, and for a skill only until it is on the chosen agent", () => {
    const onInstall = vi.fn();
    const view = render(() => (
      <MarketplaceDetail
        bots={[]}
        selectedBot=""
        onSelectBot={vi.fn()}
        onInstall={onInstall}
        onUninstall={vi.fn()}
        details={agentDetails([])}
      />
    ));
    expect(screen.getByRole("button", { name: "Install" })).toBeEnabled();
    view.unmount();
    render(() => (
      <MarketplaceDetail
        bots={[{ id: "a", name: "Ada" }]}
        selectedBot="a"
        onSelectBot={vi.fn()}
        onInstall={onInstall}
        onUninstall={vi.fn()}
        details={{ item: { ...meetingNotes, installedBotIds: ["a"] }, skillMd: null, files: [], agent: null }}
      />
    ));
    expect(screen.getByRole("button", { name: "Installed" })).toBeDisabled();
  });
});
