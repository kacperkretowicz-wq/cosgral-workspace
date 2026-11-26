import { describe, expect, it } from "vitest";
import {
  TAILSCALE_MESSAGES,
  TailscalePublisher,
  type TailscaleRun,
  tailscaleHostFromStatus,
} from "./tailscale-publisher";

const running = JSON.stringify({ BackendState: "Running", Self: { DNSName: "Komputer-Kacpra.tail1a2b3.ts.net." } });

function publisher(responses: Array<{ code: number; output: string }>, installed = true) {
  const calls: string[][] = [];
  const run: TailscaleRun = async (_executable, args) => {
    calls.push(args);
    return responses.shift() ?? { code: 0, output: "" };
  };
  return {
    calls,
    publisher: new TailscalePublisher({ resolveExecutable: async () => (installed ? "tailscale" : null), run }),
  };
}

describe("tailscaleHostFromStatus", () => {
  it("reads the name of this computer without the final dot, in lower case", () => {
    expect(tailscaleHostFromStatus(running)).toBe("komputer-kacpra.tail1a2b3.ts.net");
  });

  it("says what to do when Tailscale is logged out, stopped or has no name", () => {
    expect(() => tailscaleHostFromStatus(JSON.stringify({ BackendState: "NeedsLogin" }))).toThrow(
      TAILSCALE_MESSAGES.needsLogin,
    );
    expect(() => tailscaleHostFromStatus(JSON.stringify({ BackendState: "Stopped" }))).toThrow(
      TAILSCALE_MESSAGES.stopped,
    );
    expect(() => tailscaleHostFromStatus(JSON.stringify({ BackendState: "Running", Self: {} }))).toThrow(
      TAILSCALE_MESSAGES.noName,
    );
    expect(() => tailscaleHostFromStatus("not json")).toThrow(TAILSCALE_MESSAGES.stopped);
  });
});

describe("TailscalePublisher", () => {
  it("shows the local server at the https address of this computer", async () => {
    const { calls, publisher: tailscale } = publisher([
      { code: 0, output: running },
      { code: 0, output: "Available within your tailnet" },
    ]);
    await expect(tailscale.publish(4321)).resolves.toBe("https://komputer-kacpra.tail1a2b3.ts.net");
    expect(calls).toEqual([
      ["status", "--json"],
      ["serve", "--bg", "--https=443", "http://127.0.0.1:4321"],
    ]);
  });

  it("explains a missing program, a missing HTTPS setting and a timeout", async () => {
    await expect(publisher([], false).publisher.publish(1)).rejects.toThrow(TAILSCALE_MESSAGES.notInstalled);
    await expect(
      publisher([
        { code: 0, output: running },
        { code: 1, output: "Serve is not enabled on your tailnet. HTTPS must be enabled" },
      ]).publisher.publish(1),
    ).rejects.toThrow(TAILSCALE_MESSAGES.needsHttps);
    await expect(publisher([{ code: -1, output: "timeout" }]).publisher.publish(1)).rejects.toThrow(
      TAILSCALE_MESSAGES.timeout,
    );
  });

  it("stops showing the server, and does not fail without Tailscale", async () => {
    const { calls, publisher: tailscale } = publisher([{ code: 0, output: "" }]);
    await tailscale.unpublish();
    expect(calls).toEqual([["serve", "--https=443", "off"]]);
    await expect(publisher([], false).publisher.unpublish()).resolves.toBeUndefined();
  });
});
