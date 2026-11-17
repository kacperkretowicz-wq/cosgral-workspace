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
  expect(await screen.findByRole("button", { name: /Demo Data/ })).toBeInTheDocument();
  await fireEvent.input(screen.getByRole("searchbox", { name: "Search apps" }), { target: { value: "design" } });
  await fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: /Demo Data/ })).not.toBeInTheDocument());
  expect(screen.getByRole("button", { name: /Demo Design/ })).toBeInTheDocument();
});

it("opens details, asks for key values in password fields and installs", async () => {
  const install = vi.spyOn(api, "install");
  render(() => <PluginAppsPanel />);
  await fireEvent.click(await screen.findByRole("button", { name: /Demo Data/ }));
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
  await fireEvent.click(await screen.findByRole("button", { name: /Demo Mail/ }));
  expect(await screen.findByText("This app cannot run on this computer.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Install" })).toBeDisabled();
});

it("shows an error with Retry when the catalog cannot be read", async () => {
  vi.spyOn(api, "list").mockRejectedValueOnce(new Error("catalog locked"));
  render(() => <PluginAppsPanel />);
  expect(await screen.findByRole("alert")).toHaveTextContent("catalog locked");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("button", { name: /Demo Data/ })).toBeInTheDocument();
});

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <PluginAppsPanel />);
  expect(screen.getByText("Apps are not available in this version.")).toBeInTheDocument();
});
