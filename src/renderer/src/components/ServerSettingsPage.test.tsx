import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockServerSettings } from "../../stories/mock-server-settings";
import { ServerSettingsPage } from "./ServerSettingsPage";

let api = createMockServerSettings(() => undefined);

beforeEach(() => {
  api = createMockServerSettings(() => undefined);
  Object.assign(window, { openbot: { serverSettings: api } });
});
afterEach(cleanup);

it("lists the 14 sections and marks the ones that need an online service", async () => {
  render(() => <ServerSettingsPage />);
  const nav = await screen.findByRole("navigation", { name: "Sections" });
  await waitFor(() => expect(nav.querySelectorAll("button")).toHaveLength(14));
  await fireEvent.click(screen.getByRole("button", { name: /Members/ }));
  expect(await screen.findByText(/Not available on this computer/)).toBeInTheDocument();
});

it("edits General and saves it through serverSettings.update", async () => {
  const update = vi.spyOn(api, "update");
  render(() => <ServerSettingsPage />);
  const name = await screen.findByRole("textbox", { name: "Name" });
  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toBeDisabled();
  await fireEvent.input(name, { target: { value: "Studio" } });
  expect(save).toBeEnabled();
  await fireEvent.click(save);
  await waitFor(() => expect(update).toHaveBeenCalledOnce());
  expect(update.mock.calls[0]?.[0]?.general?.name).toBe("Studio");
  expect(await screen.findByText("Saved.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

it("shows the storage report, measures again and clears logs only after a confirmation", async () => {
  const clearLogs = vi.spyOn(api, "clearLogs");
  render(() => <ServerSettingsPage />);
  await fireEvent.click(await screen.findByRole("button", { name: "Storage" }));
  expect(await screen.findByText("Provider environments")).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Clear diagnostic logs…" }));
  expect(clearLogs).not.toHaveBeenCalled();
  await fireEvent.click(screen.getByRole("button", { name: "Clear diagnostic logs" }));
  await waitFor(() => expect(clearLogs).toHaveBeenCalledOnce());
});

it("sends a section with its own screen to that screen", async () => {
  const onOpenPage = vi.fn();
  render(() => <ServerSettingsPage onOpenPage={onOpenPage} />);
  await fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
  await fireEvent.click(screen.getByRole("button", { name: "Open" }));
  expect(onOpenPage).toHaveBeenCalledWith("providers");
});

it("shows an error with Retry when the settings cannot be read", async () => {
  vi.spyOn(api, "get").mockRejectedValueOnce(new Error("locked"));
  render(() => <ServerSettingsPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("locked");
  await fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("textbox", { name: "Name" })).toBeInTheDocument();
});

it("says so without the contract", () => {
  Object.assign(window, { openbot: {} });
  render(() => <ServerSettingsPage />);
  expect(screen.getByText("Server settings are not available in this version.")).toBeInTheDocument();
});
