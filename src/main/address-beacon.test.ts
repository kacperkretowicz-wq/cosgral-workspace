// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  AddressBeacon,
  addressTopic,
  DEFAULT_ADDRESS_RELAY,
  parseMailbox,
  resolveAddressRelay,
} from "./address-beacon";

const SERVER = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
const FINGERPRINT = "a".repeat(43);

describe("addressTopic", () => {
  it("is the same for the same server, differs for another, and is a valid mailbox name", () => {
    const topic = addressTopic(SERVER, FINGERPRINT);
    expect(topic).toBe(addressTopic(SERVER.toUpperCase(), FINGERPRINT));
    expect(topic).not.toBe(addressTopic(SERVER.replace("6f", "7f"), FINGERPRINT));
    expect(topic).toMatch(/^cosgral-[A-Za-z0-9_-]{40}$/u);
    expect(topic).not.toContain(SERVER);
  });
});

describe("resolveAddressRelay", () => {
  it("uses the free public mailbox by default, can be switched off, and takes only an https address", () => {
    expect(resolveAddressRelay(undefined)).toBe(DEFAULT_ADDRESS_RELAY);
    expect(resolveAddressRelay("off")).toBeNull();
    expect(resolveAddressRelay("https://ntfy.example.org/")).toBe("https://ntfy.example.org");
    expect(resolveAddressRelay("http://ntfy.example.org")).toBe(DEFAULT_ADDRESS_RELAY);
  });
});

describe("parseMailbox", () => {
  it("keeps only the update links, newest first, without repeats", () => {
    const lines = [
      JSON.stringify({ event: "open", id: "x" }),
      JSON.stringify({ event: "message", time: 100, message: "cosgral://update?api=old" }),
      JSON.stringify({ event: "message", time: 300, message: "cosgral://update?api=new" }),
      JSON.stringify({ event: "message", time: 200, message: "hello, not a link" }),
      JSON.stringify({ event: "message", time: 301, message: "cosgral://update?api=new" }),
      "not json",
      JSON.stringify({ event: "keepalive" }),
    ].join("\n");
    expect(parseMailbox(lines)).toEqual(["cosgral://update?api=new", "cosgral://update?api=old"]);
  });
});

describe("AddressBeacon", () => {
  it("leaves a note in the mailbox of the server and reads it back", async () => {
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const fetchFile: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), method: init?.method, body: init?.body });
      if (init?.method === "POST") return new Response("{}");
      return new Response(`${JSON.stringify({ event: "message", time: 5, message: "cosgral://update?api=x" })}\n`);
    };
    const beacon = new AddressBeacon({ relayUrl: "https://ntfy.example.org/", fetchFile });
    await beacon.publish(SERVER, FINGERPRINT, "cosgral://update?api=x");
    expect(calls[0]).toMatchObject({
      url: `https://ntfy.example.org/${addressTopic(SERVER, FINGERPRINT)}`,
      method: "POST",
      body: "cosgral://update?api=x",
    });
    await expect(beacon.lookup(SERVER, FINGERPRINT)).resolves.toEqual(["cosgral://update?api=x"]);
    expect(calls[1]?.url).toBe(`https://ntfy.example.org/${addressTopic(SERVER, FINGERPRINT)}/json?poll=1&since=all`);
    await expect(beacon.publish(SERVER, FINGERPRINT, "https://evil.example")).rejects.toThrow();
  });

  it("never throws when it looks up and the mailbox is not reachable", async () => {
    const beacon = new AddressBeacon({
      relayUrl: "https://ntfy.example.org",
      fetchFile: async () => {
        throw new Error("offline");
      },
    });
    await expect(beacon.lookup(SERVER, FINGERPRINT)).resolves.toEqual([]);
  });
});
