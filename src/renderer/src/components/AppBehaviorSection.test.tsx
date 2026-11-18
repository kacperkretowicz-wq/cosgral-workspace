import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockOpenBot } from "../../stories/mock-openbot";
import { AppBehaviorSection } from "./AppBehaviorSection";

let dispose: () => void = () => undefined;

beforeEach(() => {
  const mock = createMockOpenBot();
  dispose = () => mock.dispose();
  Object.defineProperty(window, "openbot", { configurable: true, value: mock.api });
});
afterEach(() => {
  cleanup();
  dispose();
  vi.restoreAllMocks();
});

const LAUNCH = "Launch COSGRAL Workspace at login";
const KEEP = "Keep COSGRAL Workspace running in the background";

it("starts with both switches off and saves each one on its own", async () => {
  render(() => <AppBehaviorSection />);
  const launch = await screen.findByRole("switch", { name: LAUNCH });
  const keep = screen.getByRole("switch", { name: KEEP });
  await waitFor(() => expect(launch).toBeEnabled());
  expect(launch).not.toBeChecked();
  expect(keep).not.toBeChecked();

  fireEvent.click(keep);
  await waitFor(async () => expect((await window.openbot.appSettings?.get())?.behavior.keepBackground).toBe(true));
  expect((await window.openbot.appSettings?.get())?.behavior.launchAtLogin).toBe(false);

  await waitFor(() => expect(screen.getByRole("switch", { name: LAUNCH })).toBeEnabled());
  fireEvent.click(screen.getByRole("switch", { name: LAUNCH }));
  await waitFor(async () => expect((await window.openbot.appSettings?.get())?.behavior.launchAtLogin).toBe(true));
  expect((await window.openbot.appSettings?.get())?.behavior.keepBackground).toBe(true);
});

it("takes a switch back and says so when the program refuses the change", async () => {
  render(() => <AppBehaviorSection />);
  const keep = await screen.findByRole("switch", { name: KEEP });
  await waitFor(() => expect(keep).toBeEnabled());
  vi.spyOn(window.openbot.appSettings as NonNullable<typeof window.openbot.appSettings>, "update").mockRejectedValue(
    new Error("The setting was refused."),
  );
  fireEvent.click(keep);
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The setting was refused."));
  await waitFor(() => expect(screen.getByRole("switch", { name: KEEP })).not.toBeChecked());
});
