import type { MarketplaceItem } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { MarketplaceGallery } from "./MarketplaceGallery";

afterEach(cleanup);

function item(patch: Partial<MarketplaceItem> & Pick<MarketplaceItem, "id" | "title" | "kind">): MarketplaceItem {
  return {
    summary: `${patch.title} summary`,
    description: "",
    category: "writing",
    tags: [],
    featured: false,
    version: 1,
    skillName: patch.kind === "skill" ? patch.id : null,
    skills: [],
    libraryState: patch.kind === "skill" ? "available" : null,
    installedBotIds: [],
    ...patch,
  };
}

const ITEMS = [
  item({ id: "agent:a", title: "Editor", kind: "agent", featured: true }),
  item({ id: "skill:b", title: "Daily brief", kind: "skill", category: "productivity" }),
];

function draw(over: Partial<Parameters<typeof MarketplaceGallery>[0]> = {}) {
  const props = {
    items: ITEMS,
    query: "",
    category: "" as const,
    selectedId: "",
    onQuery: vi.fn(),
    onCategory: vi.fn(),
    onSearch: vi.fn(),
    onOpen: vi.fn(),
    onInstall: vi.fn(),
    ...over,
  };
  render(() => <MarketplaceGallery {...props} />);
  return props;
}

it("shows a Featured row and the rest of the catalog", () => {
  draw();
  expect(screen.getByRole("heading", { name: "Featured" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Catalog" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Daily brief" })).toBeInTheDocument();
});

it("drops the Featured row while a search or category is active", () => {
  draw({ query: "brief" });
  expect(screen.queryByRole("heading", { name: "Featured" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Results" })).toBeInTheDocument();
});

it("installs an agent from its card and opens a skill for choosing an agent", async () => {
  const props = draw();
  await fireEvent.click(screen.getByRole("button", { name: "Install Editor" }));
  expect(props.onInstall).toHaveBeenCalledWith(ITEMS[0]);
  expect(screen.queryByRole("button", { name: "Install Daily brief" })).not.toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Open Daily brief" }));
  expect(props.onOpen).toHaveBeenCalledWith(ITEMS[1]);
});

it("reports a category chip and typed text", async () => {
  const props = draw();
  await fireEvent.click(screen.getByRole("button", { name: "Writing" }));
  expect(props.onCategory).toHaveBeenCalledWith("writing");
  await fireEvent.input(screen.getByRole("searchbox", { name: "Search the catalog" }), { target: { value: "ed" } });
  expect(props.onQuery).toHaveBeenCalledWith("ed");
});

it("says so when nothing matches", () => {
  draw({ items: [], query: "zzz" });
  expect(screen.getByText("No matching items.")).toBeInTheDocument();
});
