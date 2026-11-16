import { fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { PageRail } from "./PageRail";

afterEach(() => vi.unstubAllGlobals());
it("keeps pins in saved order and puts other pages in More", () => {
  render(() => (
    <PageRail active="phone" pinnedPageIds={["providers", "library"]} onSelect={vi.fn()} onOpenSettings={vi.fn()} />
  ));
  const nav = within(screen.getByRole("navigation", { name: "Pages" }));
  expect(nav.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
    "Agents",
    "Providers",
    "Library",
    "More pages (current: Phone)",
    "Settings",
  ]);
});
it("pins from More and unpins from the page context menu", async () => {
  const toggle = vi.fn();
  render(() => (
    <PageRail
      active="agents"
      pinnedPageIds={["library"]}
      onTogglePin={toggle}
      onSelect={vi.fn()}
      onOpenSettings={vi.fn()}
    />
  ));
  await fireEvent.pointerDown(screen.getByRole("button", { name: "More pages" }), { button: 0, pointerType: "mouse" });
  const menu = await screen.findByRole("menu", { name: "More pages" });
  await fireEvent.pointerUp(within(menu).getByRole("menuitem", { name: "Przypnij Phone" }));
  expect(toggle).toHaveBeenCalledWith("phone");
  await fireEvent.keyDown(menu, { key: "Escape" });
  await fireEvent.contextMenu(screen.getByRole("button", { name: "Library" }));
  const pageMenu = await screen.findByRole("menu", { name: "Menu strony Library" });
  await fireEvent.pointerUp(within(pageMenu).getByRole("menuitem", { name: "Odepnij Library" }));
  expect(toggle).toHaveBeenCalledWith("library");
});
it("writes the whole latest list and hydrates it after remount", async () => {
  let ids = ["library"];
  const update = vi.fn(async (input: { navigation: { pinnedPageIds: string[] } }) => {
    ids = input.navigation.pinnedPageIds;
    return { navigation: { pinnedPageIds: ids } };
  });
  vi.stubGlobal("openbot", {
    appSettings: { get: async () => ({ navigation: { pinnedPageIds: ids } }), update },
    agent: { onEvent: () => () => {} },
  });
  const view = render(() => <PageRail active="agents" onSelect={vi.fn()} onOpenSettings={vi.fn()} />);
  await waitFor(() => expect(screen.queryByRole("button", { name: "Phone" })).toBeNull());
  await fireEvent.pointerDown(screen.getByRole("button", { name: "More pages" }), { button: 0, pointerType: "mouse" });
  await fireEvent.pointerUp(await screen.findByRole("menuitem", { name: "Przypnij Phone" }));
  await waitFor(() => expect(update).toHaveBeenCalledWith({ navigation: { pinnedPageIds: ["library", "phone"] } }));
  view.unmount();
  render(() => <PageRail active="agents" onSelect={vi.fn()} onOpenSettings={vi.fn()} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Phone" })).toBeVisible());
});

it("uses a newer settings event instead of a late load response", async () => {
  let finish: (value: unknown) => void = () => {};
  let emit: (event: import("@openbot/contracts/ipc").AgentEvent) => void = () => {};
  vi.stubGlobal("openbot", {
    appSettings: {
      get: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    agent: {
      onEvent: (listener: typeof emit) => {
        emit = listener;
        return () => {};
      },
    },
  });
  render(() => <PageRail active="agents" onSelect={vi.fn()} onOpenSettings={vi.fn()} />);
  // Only navigation is used here; take the full settings fixture from the event parser's supported shape.
  const { defaultNotificationPreferences, SETTINGS_TABS } = await import("@openbot/contracts/ipc");
  emit({
    type: "app-settings-changed",
    settings: {
      language: "en",
      languageChosen: true,
      notifications: defaultNotificationPreferences(),
      tabs: SETTINGS_TABS.map((id) => ({ id, available: true })),
      navigation: { pinnedPageIds: ["phone"] },
    },
  });
  finish({ navigation: { pinnedPageIds: ["library"] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Phone" })).toHaveAttribute("data-pinned", "true"));
  expect(screen.queryByRole("button", { name: "Library" })).toBeNull();
});
