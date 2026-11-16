import type { AppSettings } from "@openbot/contracts/ipc";
import { afterEach, expect, it, vi } from "vitest";
import { createMockOpenBot } from "../stories/mock-openbot";
import { startTheme } from "./theme";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("follows OS changes, saves explicit choices, and removes listeners", async () => {
  const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  const stop = startTheme();
  await Promise.resolve();
  expect(document.documentElement.dataset.theme).toBe("light");
  media.matches = true;
  media.addEventListener.mock.calls[0][1]();
  expect(document.documentElement.dataset.theme).toBe("dark");
  await mock.api.appSettings?.update({ theme: "light" });
  expect(localStorage.getItem("cosgral-theme")).toBe("light");
  media.addEventListener.mock.calls[0][1]();
  expect(document.documentElement.dataset.theme).toBe("light");
  stop();
  expect(media.removeEventListener).toHaveBeenCalled();
  mock.dispose();
});

it("does not let a late initial read overwrite a newer settings event", async () => {
  const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  const old = await mock.api.appSettings?.get();
  if (!old || !mock.api.appSettings) throw new Error("missing mock");
  let resolve!: (settings: AppSettings) => void;
  mock.api.appSettings.get = () =>
    new Promise((done) => {
      resolve = done;
    });
  const stop = startTheme();
  await mock.api.appSettings.update({ theme: "dark" });
  resolve({ ...old, theme: "light" });
  await Promise.resolve();
  expect(document.documentElement.dataset.theme).toBe("dark");
  stop();
  mock.dispose();
});
