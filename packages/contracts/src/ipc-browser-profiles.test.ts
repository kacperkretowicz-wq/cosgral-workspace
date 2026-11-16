import { describe, expect, it } from "vitest";
import {
  BROWSER_PROFILE_LIMITS,
  BROWSER_PROFILE_PARTS,
  domainDecision,
  emptyDomainPolicy,
  hostMatches,
  isBrowserProfileDescription,
  isBrowserProfileList,
  isBrowserProfilesChanged,
  normalizeDomain,
  parseBrowserProfileInput,
  parseClearBrowserProfileInput,
  parseDomainList,
  parseSetBrowserDomainsInput,
} from "./ipc-browser-profiles";
import { isAgentEvent } from "./ipc-conversation";

describe("browser profile contract (W8-KK3)", () => {
  it("a site name is read from what a person types", () => {
    for (const [typed, host] of [
      ["Example.com", "example.com"],
      ["  https://www.Example.com/path?q=1#x ", "www.example.com"],
      ["*.example.com", "example.com"],
      ["example.com:8080", "example.com"],
      ["example.com.", "example.com"],
      ["localhost", "localhost"],
      ["http://localhost:3000/app", "localhost"],
      ["sub-domain.example.co.uk", "sub-domain.example.co.uk"],
      ["zażółć.pl", "xn--za-6ja4f8n1l.pl"],
    ] as const) {
      expect(normalizeDomain(typed)).toBe(host);
    }
  });

  it("what is not a site name is refused", () => {
    for (const bad of [
      "",
      "   ",
      "nodot",
      "-bad.com",
      "bad-.com",
      "a b.com",
      "user@example.com",
      "[::1]",
      "::1",
      "ex*mple.com",
      "http://",
      "a..b.com",
      `${"a".repeat(64)}.com`,
      `${"a.".repeat(130)}com`,
    ]) {
      expect(normalizeDomain(bad)).toBeNull();
    }
  });

  it("a list is tidy, without duplicates, and a bad entry or too many entries are refused", () => {
    expect(parseDomainList(["Example.com", "https://example.com/x", "other.org"], "allow")).toEqual([
      "example.com",
      "other.org",
    ]);
    expect(parseDomainList([], "block")).toEqual([]);
    expect(() => parseDomainList(["fine.com", "no way"], "block")).toThrow(/not a site name/);
    expect(() => parseDomainList("example.com", "allow")).toThrow(/list of sites/);
    expect(() => parseDomainList([5], "allow")).toThrow(/not a site name/);
    const many = Array.from({ length: BROWSER_PROFILE_LIMITS.domainsPerList + 1 }, (_, index) => `site${index}.com`);
    expect(() => parseDomainList(many, "allow")).toThrow(/at most 100/);
  });

  it("a domain covers its subdomains on a label boundary only", () => {
    expect(hostMatches("example.com", "example.com")).toBe(true);
    expect(hostMatches("www.example.com", "example.com")).toBe(true);
    expect(hostMatches("a.b.example.com", "example.com")).toBe(true);
    expect(hostMatches("badexample.com", "example.com")).toBe(false);
    expect(hostMatches("example.com.evil.org", "example.com")).toBe(false);
    expect(hostMatches("EXAMPLE.COM.", "example.com")).toBe(true);
  });

  it("block wins and applies to every request; the allow list limits pages only", () => {
    const policy = { allow: ["shop.example.com", "docs.org"], block: ["ads.shop.example.com", "tracker.net"] };
    expect(domainDecision(policy, "https://shop.example.com/cart", "navigation")).toEqual({
      allowed: true,
      reason: null,
    });
    expect(domainDecision(policy, "https://www.docs.org/a", "navigation").allowed).toBe(true);
    const outside = domainDecision(policy, "https://news.com/", "navigation");
    expect(outside.allowed).toBe(false);
    expect(outside.reason).toMatch(/allow list.*news\.com/);
    expect(domainDecision(policy, "https://cdn.news.com/a.js", "resource").allowed).toBe(true);
    const blocked = domainDecision(policy, "https://ads.shop.example.com/x.js", "resource");
    expect(blocked).toMatchObject({ allowed: false });
    expect(blocked.reason).toMatch(/blocks ads\.shop\.example\.com/);
    expect(domainDecision(policy, "https://tracker.net/", "navigation").allowed).toBe(false);
    expect(
      domainDecision({ allow: ["tracker.net"], block: ["tracker.net"] }, "https://tracker.net/", "navigation").allowed,
    ).toBe(false);
  });

  it("with no lists everything is allowed; addresses that are not http or https are not judged", () => {
    expect(domainDecision(emptyDomainPolicy(), "https://anything.com/", "navigation").allowed).toBe(true);
    const strict = { allow: ["only.com"], block: ["bad.com"] };
    for (const address of ["about:blank", "data:text/html,x", "blob:https://news.com/1", "not a url", "file:///c:/x"]) {
      expect(domainDecision(strict, address, "navigation").allowed).toBe(true);
    }
  });

  it("describe: every part is separate and never shared; the guards insist on it", () => {
    const description = {
      botId: "chief",
      exists: true,
      isolated: [...BROWSER_PROFILE_PARTS],
      sharedWithOthers: false,
      domains: emptyDomainPolicy(),
      createdAt: "2026-11-16T12:00:00.000Z",
      clearedAt: null,
      openTabs: 2,
    };
    expect(isBrowserProfileDescription(description)).toBe(true);
    expect(isBrowserProfileDescription({ ...description, sharedWithOthers: true })).toBe(false);
    expect(isBrowserProfileDescription({ ...description, isolated: ["cookies"] })).toBe(false);
    expect(isBrowserProfileDescription({ ...description, openTabs: -1 })).toBe(false);
    expect(BROWSER_PROFILE_PARTS).toEqual(["cookies", "storage", "cache", "history"]);
  });

  it("the list has one profile per agent; the event is in the agent event union", () => {
    const profile = {
      botId: "chief",
      createdAt: "2026-11-16T12:00:00.000Z",
      clearedAt: null,
      domains: emptyDomainPolicy(),
    };
    const list = { spaceId: "main", profiles: [profile, { ...profile, botId: "scout" }] };
    expect(isBrowserProfileList(list)).toBe(true);
    expect(isBrowserProfileList({ ...list, profiles: [profile, profile] })).toBe(false);
    expect(
      isBrowserProfileList({ spaceId: "main", profiles: [{ ...profile, domains: { allow: [1], block: [] } }] }),
    ).toBe(false);
    expect(isBrowserProfilesChanged({ type: "browser-profiles-changed", ...list })).toBe(true);
    expect(isAgentEvent({ type: "browser-profiles-changed", ...list })).toBe(true);
    expect(isAgentEvent({ type: "browser-profiles-changed", spaceId: 1, profiles: [] })).toBe(false);
  });

  it("requests are parsed first: an agent is needed; clearing needs a real true; lists are made tidy", () => {
    expect(parseBrowserProfileInput({ botId: "chief" })).toEqual({ botId: "chief" });
    expect(() => parseBrowserProfileInput({ botId: "" })).toThrow(/agent id/);
    expect(() => parseBrowserProfileInput(null)).toThrow(/malformed/);
    expect(parseSetBrowserDomainsInput({ botId: "chief", allow: ["HTTPS://A.com/x"], block: ["b.com"] })).toEqual({
      botId: "chief",
      allow: ["a.com"],
      block: ["b.com"],
    });
    expect(() => parseSetBrowserDomainsInput({ botId: "chief", allow: ["??"], block: [] })).toThrow(/not a site name/);
    expect(parseClearBrowserProfileInput({ botId: "chief", confirm: true })).toEqual({ botId: "chief", confirm: true });
    for (const confirm of [false, "true", 1, undefined]) {
      expect(() => parseClearBrowserProfileInput({ botId: "chief", confirm })).toThrow(/removes this agent's sign-ins/);
    }
  });
});
