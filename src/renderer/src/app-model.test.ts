import { createRoot, flush } from "solid-js";
import { expect, it } from "vitest";
import {
  CONVERSATION_MIN_WIDTH,
  createStoredMessage,
  createStoredProfile,
  LEFT_PANEL_COLLAPSE_THRESHOLD,
  LEFT_PANEL_EXPAND_THRESHOLD,
  LEFT_PANEL_MAX,
  LEFT_PANEL_MIN,
  ONBOARDING_PROFILES,
  updateStored,
} from "./app-model";
import type { BotMessage, BotProfile } from "./data";

const profile: BotProfile = {
  id: "a",
  name: "Alice",
  role: "Assistant",
  description: "",
  notifications: false,
  model: "gpt-5.6-luna",
  reasoningEffort: "medium",
  threadId: null,
  avatarSeed: "a",
  avatarHue: null,
  avatarUrl: null,
  time: "10:00",
  preview: "Hi",
};

const message: BotMessage = { id: "m1", author: "bot", body: "Hello", time: "10:00" };

it("replaces a stored agent in place, so rows holding it update", () => {
  const dispose = createRoot((dispose) => dispose);
  const stored = createRoot(() => createStoredProfile(profile));
  updateStored(stored, { ...profile, name: "Alicia", preview: "New" });
  flush();
  expect(stored.name).toBe("Alicia");
  expect(stored.preview).toBe("New");
  dispose();
});

it("replaces a stored message in place and ignores a value of the other kind", () => {
  const stored = createRoot(() => createStoredMessage(message));
  updateStored(stored, { ...message, body: "Edited" });
  flush();
  expect(stored.body).toBe("Edited");
  updateStored(stored, profile);
  flush();
  expect(stored.body).toBe("Edited");
});

it("keeps the left panel limits and its collapse hysteresis in order", () => {
  expect(LEFT_PANEL_MIN).toBeLessThan(LEFT_PANEL_MAX);
  expect(LEFT_PANEL_COLLAPSE_THRESHOLD).toBeLessThan(LEFT_PANEL_EXPAND_THRESHOLD);
  expect(CONVERSATION_MIN_WIDTH).toBeGreaterThan(0);
});

it("offers the onboarding choices that become an agent, each with a role, a description and a first message", () => {
  expect(Object.keys(ONBOARDING_PROFILES)).toEqual(["Work & projects", "Research & writing", "Sales & outreach"]);
  for (const entry of Object.values(ONBOARDING_PROFILES)) {
    expect(entry.role && entry.description && entry.firstMessage).toBeTruthy();
  }
});
