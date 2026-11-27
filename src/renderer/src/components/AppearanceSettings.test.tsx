import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { AppearanceSettings } from "./AppearanceSettings";

it("has no theme choice: the program has one dark look", async () => {
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  render(() => <AppearanceSettings />);
  await waitFor(() => expect(screen.getByLabelText("Interface scale")).toBeEnabled());
  expect(screen.queryByLabelText("Theme")).toBeNull();
  expect(screen.queryByRole("option", { name: "Light" })).toBeNull();
  mock.dispose();
});

it("saves interface scale and send shortcut through appearance", async () => {
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  render(() => <AppearanceSettings />);
  await waitFor(() => expect(screen.getByLabelText("Interface scale")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("Interface scale"), { target: { value: "125" } });
  await waitFor(async () => expect((await mock.api.appSettings?.get())?.appearance.uiScale).toBe(125));
  fireEvent.change(screen.getByLabelText("Send message with"), { target: { value: "mod-enter" } });
  await waitFor(async () => expect((await mock.api.appSettings?.get())?.appearance.sendShortcut).toBe("mod-enter"));
  fireEvent.click(screen.getByLabelText("Unread first"));
  await waitFor(async () => expect((await mock.api.appSettings?.get())?.appearance.unreadFirst).toBe(true));
  fireEvent.change(screen.getByLabelText("Agent steps"), { target: { value: "collapse" } });
  await waitFor(async () => expect((await mock.api.appSettings?.get())?.appearance.agentSteps).toBe("collapse"));
  fireEvent.change(screen.getByLabelText("Text weight"), { target: { value: "strong" } });
  await waitFor(async () => expect((await mock.api.appSettings?.get())?.appearance.fontWeight).toBe("strong"));
  mock.dispose();
});

it("shows a failed save and restores the saved choice", async () => {
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  if (!mock.api.appSettings) throw new Error("missing mock");
  mock.api.appSettings.update = vi.fn().mockRejectedValue(new Error("disk unavailable"));
  render(() => <AppearanceSettings />);
  const select = screen.getByLabelText("Interface scale");
  await waitFor(() => expect(select).toBeEnabled());
  const saved = select instanceof HTMLSelectElement ? select.value : "";
  fireEvent.change(select, { target: { value: "125" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save appearance");
  expect(select).toHaveValue(saved);
  mock.dispose();
});
