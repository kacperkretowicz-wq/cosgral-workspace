import type { AgentEvent } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockPluginCatalog } from "../../stories/mock-plugin-catalog";
import { PluginAppsPanel } from "./PluginAppsPanel";

let api = createMockPluginCatalog(() => undefined);
let emit: (event: AgentEvent) => void = () => undefined;

beforeEach(() => {
  api = createMockPluginCatalog((event) => emit(event));
  Object.assign(window, {
    openbot: {
      pluginCatalog: api,
      agent: {
        onEvent: (listener: (event: AgentEvent) => void) => {
          emit = listener;
          return () => undefined;
        },
      },
    },
  });
});
afterEach(cleanup);

it("lists the catalog and filters by words", async () => {
  render(() => <PluginAppsPanel />);
  expect(await screen.findByRole("button", { name: "Demo Data" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Apps" })).toBeInTheDocument();
  await fireEvent.input(screen.getByRole("searchbox", { name: "Search apps" }), { target: { value: "design" } });
  await fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Demo Data" })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Demo Design" })).toBeInTheDocument();
});

it("groups apps by category on the home view", async () => {
  render(() => <PluginAppsPanel />);
  expect(await screen.findByRole("region", { name: "Data & analytics" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Design" })).toBeInTheDocument();
});

it("opens details, asks for key values in password fields and installs", async () => {
  const install = vi.spyOn(api, "install");
  render(() => <PluginAppsPanel />);
  await fireEvent.click(await screen.findByRole("button", { name: "Demo Data" }));
  const detail = await screen.findByRole("region", { name: "App details" });
  expect(detail).toBeInTheDocument();
  const fields = detail.querySelectorAll("input[type='password']");
  expect(fields.length).toBeGreaterThan(0);
  const first = fields[0];
  if (!(first instanceof HTMLInputElement)) throw new Error("no password field");
  await fireEvent.input(first, { target: { value: "secret-value" } });
  await fireEvent.click(screen.getByRole("button", { name: "Install" }));
  await waitFor(() => expect(install).toHaveBeenCalledOnce());
  expect(Object.values(install.mock.calls[0]?.[0]?.secrets ?? {})).toContain("secret-value");
  expect(await screen.findByRole("button", { name: "Uninstall" })).toBeInTheDocument();
  expect(screen.queryByDisplayValue("secret-value")).not.toBeInTheDocument();
});

it("shows an app that only runs on macOS as not installable here", async () => {
  render(() => <PluginAppsPanel />);
  await fireEvent.click(await screen.findByRole("button", { name: "Demo Mail" }));
  expect(await screen.findByText("This app cannot run on this computer.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Install" })).toBeDisabled();
});

it("shows an error with Retry when the catalog cannot be read", async () => {
  vi.spyOn(api, "list").mockRejectedValueOnce(new Error("catalog locked"));
  render(() => <PluginAppsPanel />);
  expect(await screen.findByRole("alert")).toHaveTextContent("catalog locked");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("button", { name: "Demo Data" })).toBeInTheDocument();
});

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <PluginAppsPanel />);
  expect(screen.getByText("Apps are not available in this version.")).toBeInTheDocument();
});

it("says what is missing when no catalog is loaded, and loads one from a folder the person chooses", async () => {
  const empty = {
    source: "none",
    catalogVersion: null,
    count: 0,
    loadedAt: null,
    skipped: 0,
    directory: null,
  } as const;
  vi.spyOn(api, "list").mockResolvedValueOnce({ info: empty, plugins: [], total: 0 });
  const choose = vi.spyOn(api, "chooseCatalogFolder");
  render(() => <PluginAppsPanel />);
  // No pointer to a "server settings" screen that does not exist: the way out is on the card itself.
  expect(await screen.findByText(/No app catalog is loaded yet/)).toBeInTheDocument();
  expect(screen.queryByText(/server settings/)).not.toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Choose the catalog folder" }));
  await waitFor(() => expect(choose).toHaveBeenCalledOnce());
  expect(await screen.findByRole("button", { name: "Demo Data" })).toBeInTheDocument();
});
