import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { AppearanceSettings } from "./AppearanceSettings";

it("loads and automatically persists the selected theme", async () => {
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  render(() => <AppearanceSettings />);
  const select = screen.getByLabelText("Theme");
  await waitFor(() => expect(select).toBeEnabled());
  fireEvent.change(select, { target: { value: "light" } });
  await waitFor(() => expect(select).toHaveValue("light"));
  expect((await mock.api.appSettings?.get())?.theme).toBe("light");
  mock.dispose();
});

it("shows a failed save and restores the saved choice", async () => {
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  if (!mock.api.appSettings) throw new Error("missing mock");
  mock.api.appSettings.update = vi.fn().mockRejectedValue(new Error("disk unavailable"));
  render(() => <AppearanceSettings />);
  const select = screen.getByLabelText("Theme");
  await waitFor(() => expect(select).toBeEnabled());
  fireEvent.change(select, { target: { value: "dark" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save theme");
  expect(select).toHaveValue("system");
  mock.dispose();
});
