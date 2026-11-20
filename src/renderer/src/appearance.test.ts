import { flush } from "solid-js";
import { afterEach, expect, it, vi } from "vitest";
import { createMockOpenBot } from "../stories/mock-openbot";
import { APPEARANCE_CACHE_KEY, applyAppearanceDom, startAppearance } from "./appearance";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-ui-scale");
  document.documentElement.removeAttribute("data-font");
  document.documentElement.removeAttribute("data-chat-accent");
  document.documentElement.removeAttribute("data-font-weight");
  for (const name of ["regular", "medium", "semibold", "bold"]) {
    document.documentElement.style.removeProperty(`--openbot-weight-${name}`);
  }
  document.documentElement.removeAttribute("data-unread-first");
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

it("lets the Azure accent stand for the default blue and only overrides a chosen one", () => {
  applyAppearanceDom({ chatAccent: "orange" });
  expect(document.documentElement.style.getPropertyValue("--openbot-accent")).toBe("#f97316");
  applyAppearanceDom({ chatAccent: "blue" });
  expect(document.documentElement.style.getPropertyValue("--openbot-accent")).toBe("");
  expect(document.documentElement.style.getPropertyValue("--openbot-accent-soft")).toBe("");
});

it("sets the text weights for a lighter or stronger look and drops them for the normal one", () => {
  const root = document.documentElement;
  applyAppearanceDom({ fontWeight: "strong" });
  expect(root.dataset.fontWeight).toBe("strong");
  expect(root.style.getPropertyValue("--openbot-weight-regular")).toBe("440");
  expect(root.style.getPropertyValue("--openbot-weight-semibold")).toBe("630");
  expect(root.style.getPropertyValue("--openbot-weight-bold")).toBe("630");
  applyAppearanceDom({ fontWeight: "light" });
  expect(root.style.getPropertyValue("--openbot-weight-regular")).toBe("330");
  applyAppearanceDom({ fontWeight: "normal" });
  expect(root.dataset.fontWeight).toBe("normal");
  for (const name of ["regular", "medium", "semibold", "bold"]) {
    expect(root.style.getPropertyValue(`--openbot-weight-${name}`)).toBe("");
  }
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

it("tells the window whether unread agents go first (BE-AC), also after a change", async () => {
  const { unreadFirst } = await import("./appearance");
  applyAppearanceDom({ unreadFirst: true });
  flush();
  expect(unreadFirst()).toBe(true);
  expect(document.documentElement.dataset.unreadFirst).toBe("true");
  applyAppearanceDom({});
  flush();
  expect(unreadFirst()).toBe(false);
});
