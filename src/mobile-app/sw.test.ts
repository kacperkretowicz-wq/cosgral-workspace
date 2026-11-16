// @vitest-environment node
// The phone app's service worker (push part): what a notification says, where a tap goes. The worker's own script runs here
// against a small fake of the worker scope.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  data?: { json: () => unknown } | null;
  notification?: { close: () => void; data: unknown };
  waitUntil: (promise: Promise<unknown>) => void;
}

function load(language: string) {
  const source = readFileSync(join(__dirname, "sw.js"), "utf8");
  const listeners = new Map<string, Listener>();
  const shown: Array<{ title: string; options: { body: string; tag: string; data: { target: string } } }> = [];
  const windows: Array<{ url: string; navigate: (target: string) => Promise<unknown>; focus: () => Promise<unknown> }> =
    [];
  const opened: string[] = [];
  const scope = {
    navigator: { language },
    location: { origin: "https://pc.example.test" },
    registration: {
      showNotification: async (title: string, options: { body: string; tag: string; data: { target: string } }) => {
        shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => windows,
      openWindow: async (target: string) => {
        opened.push(target);
      },
      claim: async () => undefined,
    },
    skipWaiting: async () => undefined,
    addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
  };
  new Function("self", "caches", "fetch", source)(scope, {}, async () => new Response(""));
  const fire = async (name: string, event: Omit<FakeEvent, "waitUntil">) => {
    const pending: Array<Promise<unknown>> = [];
    listeners.get(name)?.({ ...event, waitUntil: (promise) => pending.push(promise) });
    await Promise.all(pending);
  };
  return { fire, shown, windows, opened };
}

const payload = (extra: { test?: boolean; itemId?: string } = {}) => ({
  data: { json: () => ({ v: 1, kind: "needs-you", agentName: "Scout", itemId: "card 7", ...extra }) },
});

describe("service worker push", () => {
  it("shows only that an agent waits, and a tap opens that card", async () => {
    const sw = load("en-US");
    await sw.fire("push", payload());
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0]?.title).toBe("COSGRAL");
    expect(sw.shown[0]?.options.body).toBe("Scout is waiting for you");
    expect(sw.shown[0]?.options.tag).toBe("needs-card 7");
    expect(sw.shown[0]?.options.data.target).toBe("/app/#/needs/card%207");
  });

  it("speaks Polish on a Polish phone, and says it is a test for a test", async () => {
    const sw = load("pl-PL");
    await sw.fire("push", payload());
    expect(sw.shown[0]?.options.body).toBe("Scout czeka na Ciebie");
    await sw.fire("push", payload({ test: true, itemId: "test" }));
    expect(sw.shown[1]?.options.body).toMatch(/testowe/);
    expect(sw.shown[1]?.options.data.target).toBe("/app/#/needs");
  });

  it("an unreadable or foreign message still shows a neutral notification and opens no card", async () => {
    const sw = load("en");
    await sw.fire("push", { data: { json: () => ({ v: 2, kind: "x" }) } });
    await sw.fire("push", {
      data: { json: () => ({ v: 1, kind: "needs-you", agentName: "x".repeat(200), itemId: "1" }) },
    });
    await sw.fire("push", {
      data: {
        json: () => {
          throw new SyntaxError("not json");
        },
      },
    });
    await sw.fire("push", { data: null });
    expect(sw.shown).toHaveLength(4);
    for (const entry of sw.shown) {
      expect(entry.options.body).toBe("COSGRAL is waiting for you");
      expect(entry.options.data.target).toBe("/app/#/needs");
    }
  });

  it("a tap focuses the open app and sends it to the card, or opens the app when it is closed", async () => {
    const sw = load("en");
    const moved: string[] = [];
    const focused: string[] = [];
    sw.windows.push({
      url: "https://pc.example.test/app/#/agents",
      navigate: async (target) => {
        moved.push(target);
        return { focus: async () => focused.push("moved") };
      },
      focus: async () => focused.push("same"),
    });
    await sw.fire("notificationclick", {
      notification: { close: () => undefined, data: { target: "/app/#/needs/7" } },
    });
    expect(moved).toEqual(["/app/#/needs/7"]);
    expect(focused).toEqual(["moved"]);
    sw.windows.length = 0;
    await sw.fire("notificationclick", {
      notification: { close: () => undefined, data: { target: "/app/#/needs/8" } },
    });
    expect(sw.opened).toEqual(["/app/#/needs/8"]);
    // A target that is not a string falls back to the list, never to an address from the message.
    await sw.fire("notificationclick", { notification: { close: () => undefined, data: { target: { evil: true } } } });
    expect(sw.opened.at(-1)).toBe("/app/#/needs");
  });
});
