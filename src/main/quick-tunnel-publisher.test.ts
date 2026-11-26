// @vitest-environment node

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  buildQuickTunnelArgs,
  findQuickTunnelUrl,
  QUICK_TUNNEL_MESSAGES,
  QuickTunnelPublisher,
} from "./quick-tunnel-publisher";

function fakeProcess() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const events = new EventEmitter();
  const child: {
    exitCode: number | null;
    killed: boolean;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: () => boolean;
    once: (event: string, listener: (...args: unknown[]) => unknown) => unknown;
  } = {
    exitCode: null,
    killed: false,
    stdout,
    stderr,
    kill: () => {
      child.killed = true;
      child.exitCode = 0;
      events.emit("exit", 0);
      return true;
    },
    once: (event: string, listener: (...args: unknown[]) => unknown) => events.once(event, listener),
  };
  return { child, stderr, events };
}

describe("findQuickTunnelUrl", () => {
  it("takes the random address, not the address of the Cloudflare service", () => {
    const output = [
      "INF Requesting new quick Tunnel on trycloudflare.com... url=https://api.trycloudflare.com/tunnel",
      "INF |  https://rapid-green-moon-demo.trycloudflare.com  |",
    ].join("\n");
    expect(findQuickTunnelUrl(output)).toBe("https://rapid-green-moon-demo.trycloudflare.com");
    expect(findQuickTunnelUrl("INF nothing yet")).toBeNull();
  });
});

describe("QuickTunnelPublisher", () => {
  it("starts cloudflared for the local port and returns the random address", async () => {
    const { child, stderr } = fakeProcess();
    const spawnProcess = vi.fn(() => child);
    const publisher = new QuickTunnelPublisher({
      binDirectory: "/unused",
      resolveExecutable: async () => "/bin/cloudflared",
      spawnProcess,
    });
    const published = publisher.publish(4321);
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalled());
    stderr.write("INF |  https://calm-blue-river-demo.trycloudflare.com  |\n");
    await expect(published).resolves.toBe("https://calm-blue-river-demo.trycloudflare.com");
    expect(spawnProcess).toHaveBeenCalledWith("/bin/cloudflared", buildQuickTunnelArgs(4321), expect.anything());
    expect(buildQuickTunnelArgs(4321)).toEqual(["tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:4321"]);
    await publisher.unpublish();
    expect(child.killed).toBe(true);
  });

  it("fetches the program when it is not installed, and tells the host when the tunnel breaks", async () => {
    const { child, stderr } = fakeProcess();
    const install = vi.fn(async (progress: (message: string) => void) => {
      progress("Pobieram…");
      return "/data/bin/cloudflared";
    });
    const spawnProcess = vi.fn(() => child);
    const publisher = new QuickTunnelPublisher({
      binDirectory: "/data/bin",
      resolveExecutable: async () => null,
      install,
      spawnProcess,
    });
    const closed = vi.fn();
    const progress = vi.fn();
    publisher.setListeners({ closed, progress });
    const published = publisher.publish(1);
    await vi.waitFor(() => expect(spawnProcess).toHaveBeenCalled());
    stderr.write("https://some-fresh-words-demo.trycloudflare.com\n");
    await published;
    expect(install).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledWith("Pobieram…");
    expect(spawnProcess).toHaveBeenCalledWith("/data/bin/cloudflared", expect.anything(), expect.anything());

    // The tunnel stops by itself: the host is told. A stop by the host is not reported.
    child.kill();
    expect(closed).toHaveBeenCalledOnce();
  });

  it("says in plain words when cloudflared gives no address", async () => {
    const { child, events } = fakeProcess();
    const publisher = new QuickTunnelPublisher({
      binDirectory: "/unused",
      resolveExecutable: async () => "/bin/cloudflared",
      spawnProcess: () => child,
    });
    const published = publisher.publish(1);
    await vi.waitFor(() => expect(events.listenerCount("exit")).toBeGreaterThan(0));
    events.emit("exit", 1);
    await expect(published).rejects.toThrow(QUICK_TUNNEL_MESSAGES.noAddress);
  });
});
