// @vitest-environment jsdom
// The phone web app's PIN lock and notification settings against the real phone server (Mobile Connect + phone API + the PIN
// lock) with a fake program behind it. The app script runs in jsdom; its relative requests go to the server's address.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, BotSummary } from "@openbot/contracts/ipc";
import { isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { MOBILE_APP_FILES } from "../backend/mobile-app-assets";
import { MobileConnect, mobileAgents, mobileNeedsYou } from "../backend/mobile-connect";
import { MobilePhoneApi, type MobilePhoneHost } from "../backend/mobile-phone-api";
import { MobileStore } from "../backend/mobile-store";
import { PhoneAccess } from "../backend/phone-access";
import { PhoneAccessStore } from "../backend/phone-access-store";

const roots: string[] = [];
const running: Array<{ close: () => Promise<void> | void }> = [];
afterEach(async () => {
  window.dispatchEvent(new Event("cosgral-app-stop"));
  document.body.innerHTML = "";
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  await Promise.all(running.splice(0).map((item) => item.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function bot(id: string): BotSummary {
  return {
    id,
    name: "Scout",
    role: "Research",
    description: "Find sources.",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: `thread-${id}`,
    workspacePath: `C:\\work\\${id}`,
    preview: "Last message",
    updatedAt: "2026-11-13T19:00:00.000Z",
    avatarSeed: id,
    avatarHue: 150,
    avatarUrl: null,
  };
}

async function until(check: () => boolean, what: string): Promise<void> {
  const end = Date.now() + 4_000;
  while (!check() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 10));
  if (!check()) throw new Error(`Timed out waiting for ${what}.\n${document.body.innerHTML.slice(0, 1_500)}`);
}

function one(selector: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}

function text(selector: string): string {
  return document.querySelector(selector)?.textContent ?? "";
}

function type(selector: string, value: string): void {
  const target = document.querySelector(selector);
  if (!(target instanceof HTMLInputElement)) throw new Error(`Missing field ${selector}`);
  target.value = value;
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

async function setup(options: { pushOn?: boolean } = {}) {
  const host: MobilePhoneHost = {
    bots: () => [bot("scout")],
    messages: async () => ({ messages: [], hasMore: false }),
    sendMessage: async () => ({ messageId: "m", deliveries: [] }),
    pending: () => [],
    respondToPrompt: async () => undefined,
    respondToApproval: async () => undefined,
    respondToDraftPreview: async () => undefined,
    templates: () => [],
    createAgent: async () => {
      throw new Error("not used");
    },
    updateProfile: async () => undefined,
    setAvatarHue: async () => undefined,
    subscribe: () => () => undefined,
  };
  const root = await mkdtemp(join(tmpdir(), "mobile-app-lock-"));
  roots.push(root);
  const events: AgentEvent[] = [];
  const box = {
    canEncrypt: () => true,
    encrypt: (plain: string) => `enc:${Buffer.from(plain).toString("base64")}`,
    decrypt: (cipher: string) => Buffer.from(cipher.slice(4), "base64").toString(),
  };
  const phone = new MobilePhoneApi({ host });
  const live: { mobile: MobileConnect | null } = { mobile: null };
  const current = (): MobileConnect => {
    if (!live.mobile) throw new Error("not ready");
    return live.mobile;
  };
  const access = new PhoneAccess({
    store: new PhoneAccessStore(join(root, "phone-access.json"), box),
    mobile: () => current().getState(),
    needsYou: () => mobileNeedsYou(host.pending()),
    agentName: () => "Scout",
    subscribe: () => () => undefined,
    removeDevice: (deviceId) => current().revokeDevice({ deviceId }),
    disconnectDevice: (deviceId) => phone.disconnect(deviceId),
    emit: (event) => events.push(event),
  });
  const mobile = new MobileConnect({
    store: new MobileStore(join(root, "mobile.json")),
    agents: () => mobileAgents(host.bots()),
    needsYou: () => mobileNeedsYou(host.pending()),
    confirm: async () => "send",
    canAsk: () => true,
    emit: () => undefined,
    phone,
    access,
  });
  live.mobile = mobile;
  running.push(mobile);
  access.start();
  running.push({ close: () => access.close() });
  if (options.pushOn) access.setPushEnabled(true);
  const ticket = await mobile.startPairing({ port: 0 });
  return { mobile, access, ticket, events };
}

function openApp(base: string, hash: string): void {
  localStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  const target = new URL(base);
  history.replaceState(null, "", `/app/${hash}`);
  const realFetch = globalThis.fetch.bind(globalThis);
  const toServer = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const { signal, ...rest } = init;
    const address = isString(input) && input.startsWith("/") ? `${target.origin}${input}` : String(input);
    const response = await realFetch(address, rest);
    signal?.addEventListener("abort", () => void response.body?.cancel().catch(() => undefined));
    return response;
  };
  Object.assign(window, { fetch: toServer, TextDecoder });
  Object.assign(globalThis, { fetch: toServer });
  new Function(MOBILE_APP_FILES["/app/app.js"].body)();
}

async function pairAndOpenSettings(options: { pushOn?: boolean } = {}) {
  const fixture = await setup(options);
  openApp(fixture.ticket.urls[0] ?? "", new URL(fixture.ticket.qrPayload).hash);
  await until(() => !!document.querySelector("button[data-action='pair']"), "the pairing screen");
  one("button[data-action='pair']").click();
  await until(() => !!document.querySelector("[data-agent='scout']"), "the agent list");
  one("nav [data-tab='phone']").click();
  await until(() => !!document.querySelector("[data-section='pin']"), "the phone settings");
  return fixture;
}

function leaveTheApp(): void {
  Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("phone web app: PIN lock and notifications", () => {
  it("sets a PIN, locks when the app is left, refuses a wrong PIN with the tries left and opens with the right one", async () => {
    const { mobile } = await pairAndOpenSettings();
    expect(text("[data-section='pin']")).toContain("PIN lock");
    type("input[name='new-pin']", "12");
    one("button[data-action='pin-save']").click();
    expect(text("[data-section='pin'] [data-status]")).toContain("4 to 8 digits");
    type("input[name='new-pin']", "482913");
    one("button[data-action='pin-save']").click();
    await until(() => text("[data-section='pin']").includes("The PIN lock is on."), "the PIN to be saved");
    expect(mobile.getState().devices).toHaveLength(1);

    leaveTheApp();
    await until(() => !!document.querySelector("[data-screen='lock']"), "the lock screen");
    // Nothing of the computer is on the screen or kept by the page.
    expect(document.body.textContent).not.toContain("Scout");
    expect(document.querySelector("[data-agent]")).toBeNull();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(document.querySelector("[data-screen='lock']")).not.toBeNull();

    type("input[name='pin']", "000000");
    one("button[data-action='unlock']").click();
    await until(() => text("[data-error]").includes("tries left"), "the wrong PIN message");
    expect(text("[data-error]")).toContain("4 tries left");
    expect(document.querySelector("[data-screen='lock']")).not.toBeNull();

    type("input[name='pin']", "482913");
    one("button[data-action='unlock']").click();
    // The page comes back to the screen it was on (settings), with its data loaded again.
    await until(() => !!document.querySelector("[data-screen='phone']"), "the screen after the unlock");
    expect(document.querySelector("[data-screen='lock']")).toBeNull();
    one("nav [data-tab='agents']").click();
    await until(() => !!document.querySelector("[data-agent='scout']"), "the agents after the unlock");
  }, 20_000);

  it("a reload of the page with a PIN set starts on the lock screen", async () => {
    const fixture = await pairAndOpenSettings();
    type("input[name='new-pin']", "5678");
    one("button[data-action='pin-save']").click();
    await until(() => text("[data-section='pin']").includes("The PIN lock is on."), "the PIN to be saved");
    // The page is opened again: the same saved key, a fresh script.
    const saved = localStorage.getItem("cosgral.phone.v1") ?? "";
    window.dispatchEvent(new Event("cosgral-app-stop"));
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.setItem("cosgral.phone.v1", saved);
    history.replaceState(null, "", "/app/#/agents");
    new Function(MOBILE_APP_FILES["/app/app.js"].body)();
    await until(() => !!document.querySelector("[data-screen='lock']"), "the lock screen after a reload");
    expect(fixture.access.getState().devices[0]).toMatchObject({ pinSet: true });
    expect(document.querySelector("[data-agent]")).toBeNull();
  }, 20_000);

  it("the 5th wrong PIN removes the phone and the app goes back to pairing", async () => {
    const { mobile } = await pairAndOpenSettings();
    type("input[name='new-pin']", "5678");
    one("button[data-action='pin-save']").click();
    await until(() => text("[data-section='pin']").includes("The PIN lock is on."), "the PIN to be saved");
    leaveTheApp();
    await until(() => !!document.querySelector("[data-screen='lock']"), "the lock screen");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      if (document.querySelector("[data-screen='pair']")) break;
      type("input[name='pin']", "0000");
      one("button[data-action='unlock']").click();
      await until(
        () =>
          !!document.querySelector("[data-screen='pair']") ||
          text("[data-error]").includes(`${5 - attempt} tries left`),
        `attempt ${attempt}`,
      );
    }
    await until(() => !!document.querySelector("[data-screen='pair']"), "the pairing screen");
    expect(text("[data-notice]")).toContain("removed");
    expect(mobile.getState().devices).toEqual([]);
    expect(localStorage.getItem("cosgral.phone.v1")).toBeNull();
  }, 20_000);

  it("when the computer locks the phone, the next call shows the lock screen", async () => {
    const { access, mobile } = await pairAndOpenSettings();
    type("input[name='new-pin']", "5678");
    one("button[data-action='pin-save']").click();
    await until(() => text("[data-section='pin']").includes("The PIN lock is on."), "the PIN to be saved");
    // The idle time ran out on the computer's side (the page did not know).
    const deviceId = mobile.getState().devices[0]?.id ?? "";
    const session = JSON.parse(localStorage.getItem("cosgral.phone.v1") ?? "{}");
    await fetch("/v1/lock", { method: "POST", headers: { authorization: `Bearer ${session.token}` } });
    expect(access.getState().devices.find((device) => device.deviceId === deviceId)?.locked).toBe(true);
    one("nav [data-tab='agents']").click();
    await until(
      () => !!document.querySelector("[data-screen='lock']") || !!document.querySelector("[data-agent]"),
      "a screen",
    );
    // The agents list may paint from memory first; the next request of the page is refused and shows the lock.
    one("nav [data-tab='needs']")?.click();
    await until(() => !!document.querySelector("[data-screen='lock']"), "the lock screen after a refused call");
  }, 20_000);

  it("says that notifications are turned on at the computer first, and shows the real state once they are on", async () => {
    await pairAndOpenSettings();
    expect(text("[data-section='push']")).toContain("Turn on notifications on the computer first");
    expect(document.querySelector("button[data-action='push-on']")).toBeNull();
  }, 20_000);

  it("with notifications on at the computer, a browser without push support is told what to do", async () => {
    await pairAndOpenSettings({ pushOn: true });
    // jsdom has no Push API: the page says so (on an iPhone: add the page to the home screen).
    expect(text("[data-section='push'] [data-push='unsupported']")).toContain("home screen");
    expect(text("[data-section='push']")).toContain("only say that an agent is waiting");
  }, 20_000);
});
