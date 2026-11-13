// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentEvent,
  type BotSummary,
  type DraftPreviewResolution,
  isMobilePairingTicket,
  MOBILE_API_PATHS,
  MOBILE_LIMITS,
  MOBILE_TRANSPORT_WARNING,
  type PendingAgentRequest,
  parseMobilePairingPayload,
} from "@openbot/contracts/ipc";
import { isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { MobileConnect, mobileAgents, mobileNeedsYou, mobileUrls } from "./mobile-connect";
import { buildPairingQr } from "./mobile-qr";
import { MobileStore } from "./mobile-store";

const roots: string[] = [];
const running: MobileConnect[] = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((mobile) => mobile.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function bot(id: string, name: string): BotSummary {
  return {
    id,
    name,
    role: "Research",
    description: "Private instructions that stay on the computer.",
    notifications: true,
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    threadId: null,
    workspacePath: `C:\\work\\${id}`,
    preview: "Last message",
    updatedAt: null,
    avatarSeed: id,
    avatarHue: 150,
    avatarUrl: null,
  };
}

const PENDING: PendingAgentRequest[] = [
  {
    kind: "prompt",
    requestId: 7,
    botId: "scout",
    threadId: "t",
    turnId: "u",
    questions: [{ id: "q", header: "Budget", question: "How much can I spend?", isSecret: false, options: null }],
    createdAt: "2026-11-13T18:00:00.000Z",
  },
  {
    kind: "browser-takeover",
    phase: "requested",
    request: {
      requestId: "take-1",
      botId: "scout",
      threadId: "t",
      turnId: "u",
      tabId: "tab",
      url: "https://bank.test",
      reason: "Sign in to your bank",
      createdAt: "2026-11-13T18:01:00.000Z",
    },
  },
];

async function setup(options: { decision?: DraftPreviewResolution; root?: string; canAsk?: boolean } = {}) {
  const root = options.root ?? (await mkdtemp(join(tmpdir(), "mobile-connect-")));
  if (!options.root) roots.push(root);
  const events: AgentEvent[] = [];
  const cards: Array<{ title: string; preview: string }> = [];
  const decision = { value: options.decision ?? ("send" satisfies DraftPreviewResolution) };
  const clock = { now: Date.parse("2026-11-13T18:00:00.000Z") };
  const store = new MobileStore(join(root, "mobile.json"));
  const mobile = new MobileConnect({
    store,
    agents: () => mobileAgents([bot("scout", "Scout"), bot("writer", "Writer")]),
    needsYou: () => mobileNeedsYou(PENDING),
    confirm: async (input) => {
      cards.push(input);
      return decision.value;
    },
    canAsk: () => options.canAsk ?? true,
    emit: (event) => events.push(event),
    now: () => new Date(clock.now),
  });
  running.push(mobile);
  return { root, mobile, store, events, cards, decision, clock };
}

interface CallInit {
  method?: string;
  /** A pairing request, sent as JSON. */
  json?: { ticket: string; deviceName: string; platform?: string };
  /** A body sent as it is (bad JSON). */
  raw?: string;
  token?: string;
}

async function call(base: string, path: string, init: CallInit = {}) {
  const body = init.raw ?? (init.json ? JSON.stringify(init.json) : undefined);
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body,
  });
  const json = await response.json();
  return { status: response.status, body: isDynamicRecord(json) ? json : {} };
}

async function pairTicket(mobile: MobileConnect) {
  const ticket = await mobile.startPairing({ port: 0 });
  const base = ticket.urls[0] ?? "";
  return { ticket, base };
}

describe("Mobile Connect pairing", () => {
  it("needs an agent to carry the consent card", async () => {
    const { mobile } = await setup({ canAsk: false });
    await expect(mobile.startPairing({ port: 0 })).rejects.toThrow("Create an agent first");
  });

  it("pairs a phone after the person approves, and the phone reads agents and Needs you with its token", async () => {
    const { mobile, events, cards, root } = await setup();
    const { ticket, base } = await pairTicket(mobile);
    expect(isMobilePairingTicket(ticket)).toBe(true);
    expect(ticket.state).toMatchObject({ enabled: true, exposure: "loopback", unencrypted: true });
    expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(parseMobilePairingPayload(ticket.qrPayload)).toMatchObject({ ticket: ticket.ticket, urls: ticket.urls });
    expect(ticket.qrSvg.startsWith("<svg")).toBe(true);

    const paired = await call(base, MOBILE_API_PATHS.pair, {
      method: "POST",
      json: { ticket: ticket.ticket, deviceName: "Pixel 9", platform: "android" },
    });
    expect(paired.status).toBe(200);
    expect(paired.body).toMatchObject({ protocol: 1 });
    const token = isString(paired.body.token) ? paired.body.token : "";
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.preview).toContain("Pixel 9");
    expect(cards[0]?.preview).toContain("127.0.0.1");
    expect(cards[0]?.preview).toContain(MOBILE_TRANSPORT_WARNING);
    expect(events.some((event) => event.type === "mobile-pairing-completed" && event.device.name === "Pixel 9")).toBe(
      true,
    );

    const agents = await call(base, MOBILE_API_PATHS.agents, { token });
    expect(agents.status).toBe(200);
    expect(agents.body.agents).toEqual([
      { id: "scout", name: "Scout", role: "Research", avatarHue: 150, model: "gpt-5.6-luna" },
      { id: "writer", name: "Writer", role: "Research", avatarHue: 150, model: "gpt-5.6-luna" },
    ]);
    const needs = await call(base, MOBILE_API_PATHS.needsYou, { token });
    expect(needs.body.items).toEqual([
      {
        id: "7",
        botId: "scout",
        kind: "prompt",
        title: "Budget: How much can I spend?",
        createdAt: "2026-11-13T18:00:00.000Z",
        answerOn: "phone",
        computerReason: null,
      },
      {
        id: "take-1",
        botId: "scout",
        kind: "browser-takeover",
        title: "Sign in to your bank",
        createdAt: "2026-11-13T18:01:00.000Z",
        answerOn: "computer",
        computerReason: "Taking over the browser needs the computer.",
      },
    ]);
    const me = await call(base, MOBILE_API_PATHS.me, { token });
    expect(me.body.device).toMatchObject({ name: "Pixel 9", platform: "android", lastAddress: "127.0.0.1" });

    // The token is stored only as a hash.
    const saved = await readFile(join(root, "mobile.json"), "utf8");
    expect(saved).not.toContain(token);
    expect(saved).toContain("tokenHash");
    expect((await mobile.getState()).devices.map((device) => device.name)).toEqual(["Pixel 9"]);
  });

  it("uses a ticket once; a declined pairing also uses it up", async () => {
    const { mobile, decision, store } = await setup({ decision: "keep-draft" });
    const { ticket, base } = await pairTicket(mobile);
    const declined = await call(base, MOBILE_API_PATHS.pair, {
      method: "POST",
      json: { ticket: ticket.ticket, deviceName: "Phone" },
    });
    expect(declined.status).toBe(403);
    decision.value = "send";
    const again = await call(base, MOBILE_API_PATHS.pair, {
      method: "POST",
      json: { ticket: ticket.ticket, deviceName: "Phone" },
    });
    expect(again.status).toBe(410);
    expect(store.listDevices()).toEqual([]);
    expect((await mobile.getState()).pairing).toBeNull();
  });

  it("closes the pairing after too many wrong tickets", async () => {
    const { mobile, cards } = await setup();
    const { ticket, base } = await pairTicket(mobile);
    for (let attempt = 0; attempt < MOBILE_LIMITS.ticketAttempts; attempt += 1) {
      const wrong = await call(base, MOBILE_API_PATHS.pair, {
        method: "POST",
        json: { ticket: "W".repeat(22), deviceName: "Intruder" },
      });
      expect(wrong.status).toBe(401);
    }
    expect((await mobile.getState()).pairing).toBeNull();
    const late = await call(base, MOBILE_API_PATHS.pair, {
      method: "POST",
      json: { ticket: ticket.ticket, deviceName: "Phone" },
    });
    expect([410, 429]).toContain(late.status);
    expect(cards).toEqual([]);
  });

  it("refuses an expired ticket", async () => {
    const { mobile, clock } = await setup();
    const { ticket, base } = await pairTicket(mobile);
    clock.now += MOBILE_LIMITS.ticketTtlMs + 1;
    const expired = await call(base, MOBILE_API_PATHS.pair, {
      method: "POST",
      json: { ticket: ticket.ticket, deviceName: "Phone" },
    });
    expect(expired.status).toBe(410);
  });

  it("takes a removed phone's access away at once, and keeps paired phones after a restart", async () => {
    const first = await setup();
    const { ticket, base } = await pairTicket(first.mobile);
    const paired = await call(base, MOBILE_API_PATHS.pair, {
      method: "POST",
      json: { ticket: ticket.ticket, deviceName: "Phone" },
    });
    const token = String(paired.body.token);
    await first.mobile.close();

    const second = await setup({ root: first.root });
    await second.mobile.resume();
    const state = await second.mobile.getState();
    expect(state.enabled).toBe(true);
    const after = state.urls[0] ?? "";
    expect((await call(after, MOBILE_API_PATHS.agents, { token })).status).toBe(200);
    const deviceId = state.devices[0]?.id ?? "";
    await second.mobile.revokeDevice({ deviceId });
    expect((await call(after, MOBILE_API_PATHS.agents, { token })).status).toBe(401);
    await expect(second.mobile.revokeDevice({ deviceId })).rejects.toThrow("no longer paired");
    await second.mobile.disable();
    expect((await second.mobile.getState()).enabled).toBe(false);
    await expect(fetch(`${after}${MOBILE_API_PATHS.agents}`)).rejects.toThrow();
  });

  it("answers unknown paths, bad requests and missing tokens plainly, and slows down repeated failures", async () => {
    const { mobile } = await setup();
    const { base } = await pairTicket(mobile);
    expect((await call(base, "/v1/unknown")).status).toBe(404);
    expect((await call(base, MOBILE_API_PATHS.pair, { method: "POST", raw: "{not json" })).status).toBe(400);
    expect(
      (
        await call(base, MOBILE_API_PATHS.pair, {
          method: "POST",
          json: { ticket: "x".repeat(5_000), deviceName: "a" },
        })
      ).status,
    ).toBe(413);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < MOBILE_LIMITS.failuresPerMinute + 1; attempt += 1) {
      statuses.push((await call(base, MOBILE_API_PATHS.agents, { token: `bad-${attempt}` })).status);
    }
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("Mobile Connect helpers", () => {
  it("lists loopback, and on the local network the computer's own IPv4 addresses", () => {
    const interfaces = {
      Ethernet: [
        { address: "192.168.1.10", family: "IPv4", internal: false },
        { address: "fe80::1", family: "IPv6", internal: false },
      ],
      Loopback: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    };
    expect(mobileUrls("loopback", 47_930, interfaces)).toEqual(["http://127.0.0.1:47930"]);
    expect(mobileUrls("lan", 47_930, interfaces)).toEqual(["http://127.0.0.1:47930", "http://192.168.1.10:47930"]);
  });

  it("builds a QR code as SVG and a data URL without other dependencies", () => {
    const qr = buildPairingQr("cosgral://pair?v=1&t=Abcdefghijklmnopqrstuv&u=http%3A%2F%2F127.0.0.1%3A47930");
    expect(qr.svg.startsWith("<svg")).toBe(true);
    expect(qr.svg).toContain("</svg>");
    expect(qr.modules).toBeGreaterThanOrEqual(21);
    expect(Buffer.from(qr.dataUrl.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8")).toBe(qr.svg);
  });

  it("shows the phone short Needs you titles, never secrets or full drafts", () => {
    const items = mobileNeedsYou([
      ...PENDING,
      {
        kind: "draft-preview",
        card: {
          requestId: "card-1",
          botId: "writer",
          threadId: "t",
          turnId: "u",
          variant: "draft",
          title: "Send this e-mail to Anna?",
          recipient: "anna@example.test",
          channel: "email",
          preview: "Full private draft text",
          draftId: null,
          createdAt: "2026-11-13T18:02:00.000Z",
        },
      },
    ]);
    expect(items.map((item) => item.title)).toEqual([
      "Budget: How much can I spend?",
      "Sign in to your bank",
      "Send this e-mail to Anna?",
    ]);
    expect(JSON.stringify(items)).not.toContain("Full private draft text");
    expect(items.every((item) => item.title.length <= MOBILE_LIMITS.needsYouTitle)).toBe(true);
  });
});
