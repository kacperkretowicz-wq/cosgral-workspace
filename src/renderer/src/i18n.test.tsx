import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AppSettings } from "@openbot/contracts/ipc";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { createMockOpenBot } from "../stories/mock-openbot";
import { en, language, setLanguage, startI18n, systemLanguage, t } from "./i18n";
import { pl } from "./locales/pl";

afterEach(() => {
  cleanup();
  setLanguage("en");
  vi.restoreAllMocks();
});

it("has complete, nonempty PL and EN catalogs", () => {
  const english = Object.keys(en).sort();
  const polish = Object.keys(pl).sort();
  expect(polish).toEqual(english);
  expect(english.length).toBeGreaterThanOrEqual(1500);
  for (const value of [...Object.values(pl), ...Object.values(en)]) expect(value.trim()).not.toBe("");
});
it("has a catalog entry for every literal translation used by migrated surfaces", () => {
  const files = [
    "AppearanceSettings",
    "PageRail",
    "AppSettingsW3",
    "Sidebar",
    "PageRail",
    "ContextSettingsSection",
    "InitialSetup",
    "ThreadTabs",
    "GlobalSearch",
    "SideQuestionPanel",
    "SkillQuickPick",
    "AgentCardsSection",
    "AgentCardPage",
    "ContextIndicator",
    "ChatSidePanelLauncher",
    "ServerSettingsPage",
    "PluginAppsPanel",
    "NewAgentPage",
    "LibraryFilesView",
    "UsageReportView",
    "TasksPage",
    "TasksViewScreen",
    "ProviderCatalogPanel",
    "ProviderAccounts",
    "UsagePage",
    "ProvidersPage",
    "WorkflowVersionsPanel",
    "ThreadUndoBar",
    "MarketplaceGallery",
    "WorkflowPreviewCanvas",
    "WorkflowsPage",
    "AgentCardDetail",
    "MarketplacePage",
    "ChannelView",
    "HostPanel",
    "VaultConnectorsPanel",
    "ScheduleOverview",
    "ManagedCliSection",
    "SubagentsPanel",
    "IntegrationsPanel",
    "RemoteDesktopAccessPanel",
    "MobileOverviewPanel",
    "VoiceOverviewPanel",
    "InstanceTransferPanel",
    "MessengersPanel",
    "UpdatesPanel",
    "McpSignInPanel",
    "EndpointsSection",
    "PlanPanel",
    "LibraryPanel",
    "Conversation",
    "ContextIndicator",
    "AccessSettings",
    "IsolationSettings",
    "BrowserProfileSettings",
    "BudgetSettings",
    "ChannelWorkspace",
    "RoutinePanel",
    "VaultPanel",
    "MemoryPanel",
    "ApprovalRulesSettings",
    "AccountLogin",
    "MessageHistoryActions",
    "AlwaysAllowPanel",
    "ComposerEditor",
  ];
  const extra = [
    "conversation/AgentActivity",
    "conversation/MessageRendering",
    "conversation/ChatSearch",
    "conversation/QueuePanel",
    "conversation/SelectionActions",
  ];
  for (const file of [...files, ...extra]) {
    const source = readFileSync(resolve(`src/renderer/src/components/${file}.tsx`), "utf8");
    for (const match of source.matchAll(/\bt\("([^"\n]+)"(?:\s*,|\s*\))/g)) {
      expect(Object.hasOwn(en, match[1]), `${file}: ${match[1]}`).toBe(true);
      expect(Object.hasOwn(pl, match[1]), `${file}: ${match[1]}`).toBe(true);
    }
  }
});
it("keeps interpolation slots consistent in both catalogs", () => {
  const english = new Map<string, string>(Object.entries(en));
  for (const [key, value] of Object.entries(pl)) {
    const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    expect(slots(value), key).toEqual(slots(english.get(key) ?? ""));
  }
});
it("interpolates names as plain text, including replacement characters", async () => {
  setLanguage("pl");
  await waitFor(() => expect(language()).toBe("pl"));
  expect(t("Delete {name}?", { name: "$& {percent}" })).toBe("Usunąć agenta $& {percent}?");
  setLanguage("en");
  await waitFor(() => expect(language()).toBe("en"));
  expect(t("Delete {name}?", { name: "Research" })).toBe("Delete Research?");
});
it("uses the primary system language until the person chooses", () => {
  expect(systemLanguage(["pl-PL", "en-US"])).toBe("pl");
  expect(systemLanguage(["de-DE", "pl-PL"])).toBe("en");
  expect(systemLanguage([])).toBe("en");
});
it("updates mounted labels without remounting", async () => {
  render(() => <span>{t("Settings")}</span>);
  expect(screen.getByText("Settings")).toBeVisible();
  setLanguage("pl");
  await waitFor(() => expect(screen.getByText("Ustawienia")).toBeVisible());
});
it("logs an unknown key and falls back to English", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  setLanguage("pl");
  expect(t("Missing example key")).toBe("Missing example key");
  expect(warn).toHaveBeenCalledTimes(1);
});
it("does not let a late initial read override a newer language event", async () => {
  const mock = createMockOpenBot();
  window.openbot = mock.api;
  const old = await mock.api.appSettings?.get();
  if (!old || !mock.api.appSettings) throw new Error("missing mock");
  let resolve: ((settings: AppSettings) => void) | undefined;
  mock.api.appSettings.get = () =>
    new Promise((done) => {
      resolve = done;
    });
  const stop = startI18n();
  await mock.api.appSettings.update({ language: "pl" });
  resolve?.({ ...old, language: "en", languageChosen: true });
  await Promise.resolve();
  expect(language()).toBe("pl");
  expect(document.documentElement.lang).toBe("pl");
  stop();
  mock.dispose();
});
