import { afterEach, expect, it, vi } from "vitest";
import { createMockOpenBot } from "../stories/mock-openbot";
import { APPEARANCE_CACHE_KEY, applyAppearanceDom, startAppearance } from "./appearance";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-ui-scale");
  document.documentElement.removeAttribute("data-font");
  document.documentElement.removeAttribute("data-chat-accent");
  document.documentElement.style.removeProperty("--openbot-ui-scale");
  document.documentElement.style.removeProperty("--openbot-accent");
  document.documentElement.style.removeProperty("--openbot-font-sans");
});

it("paints scale, font and accent on the document root", () => {
  applyAppearanceDom({ uiScale: 110, font: "system", chatAccent: "orange" });
  expect(document.documentElement.dataset.uiScale).toBe("110");
  expect(document.documentElement.dataset.font).toBe("system");
  expect(document.documentElement.dataset.chatAccent).toBe("orange");
  expect(document.documentElement.style.getPropertyValue("--openbot-ui-scale")).toBe("1.1");
  expect(document.documentElement.style.getPropertyValue("--openbot-accent")).toBe("#f97316");
  expect(document.documentElement.style.getPropertyValue("--openbot-font-sans")).toContain("system-ui");
});

it("follows app-settings-changed and caches the look", async () => {
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  const stop = startAppearance();
  await Promise.resolve();
  await mock.api.appSettings?.update({ appearance: { uiScale: 140, font: "mono", chatAccent: "pink" } });
  expect(document.documentElement.dataset.uiScale).toBe("140");
  expect(document.documentElement.dataset.font).toBe("mono");
  expect(JSON.parse(localStorage.getItem(APPEARANCE_CACHE_KEY) ?? "{}")).toMatchObject({
    uiScale: 140,
    font: "mono",
    chatAccent: "pink",
  });
  stop();
  mock.dispose();
});
