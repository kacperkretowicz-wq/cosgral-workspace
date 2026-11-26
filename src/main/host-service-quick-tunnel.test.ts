// @vitest-environment node

import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenBotDatabase } from "../backend/openbot-database";
import { TeamChatStore } from "../backend/team-chat-store";
import { HostService } from "./host-service";
import { parseJoinUrl, RemoteServerManager } from "./remote-server-manager";
import { TeamStore } from "./team-store";

type Options = ConstructorParameters<typeof HostService>[0];

const ADDRESSES = ["pierwszy-adres-test", "drugi-adres-test"];
const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function unused(): never {
  throw new Error("This operation is not used by this test.");
}

async function setup(setupOptions: { publishError?: Error; withTailscale?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "cosgral-host-quick-"));
  roots.push(root);
  const store = new TeamStore(join(root, "team.json"));
  await store.initialize();
  const database = new OpenBotDatabase(root);
  await database.initialize();
  const events = new EventEmitter();
  const published: number[] = [];
  let unpublished = 0;
  const listeners: { closed?: () => void } = {};
  const options = {
    store,
    agents: Object.assign(events, { listBots: () => [] }),
    mailbox: { resolveAttachment: unused },
    browser: {},
    chat: new TeamChatStore(database),
    getSignedInUser: () => ({ id: "owner", email: "owner@cosgral.local", name: "Kacper", avatarUrl: null }),
    redeemCentralTicket: async () => null,
    sendTeamInviteEmail: async () => unused(),
    getRemoteDesktopPassword: () => null,
    setRemoteDesktopPassword: async () => undefined,
    provisionTeamTunnel: async () => unused(),
    quickTunnel: {
      publish: async (port: number) => {
        if (setupOptions.publishError) throw setupOptions.publishError;
        published.push(port);
        return `https://${ADDRESSES[(published.length - 1) % ADDRESSES.length]}.trycloudflare.com`;
      },
      unpublish: async () => {
        unpublished += 1;
      },
      setListeners: (next: { closed?: () => void }) => {
        listeners.closed = next.closed;
      },
    },
    ...(setupOptions.withTailscale
      ? {
          tailscale: {
            publish: async (port: number) => {
              published.push(port);
              return "https://komputer.tail1a2b3.ts.net";
            },
            unpublish: async () => undefined,
          },
        }
      : {}),
  };
  // The host needs only a small part of the agent service, browser host and mailbox in this test.
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: the host needs only a small part of the agent service, browser host and mailbox here.
  const host = new HostService(options as unknown as Options);
  return { host, published, listeners, store, unpublishedCount: () => unpublished };
}

/** Sends the requests for the random addresses to the local server that stands behind each of them. */
function routeAddresses(published: number[]) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const index = ADDRESSES.findIndex((name) => url.startsWith(`https://${name}.trycloudflare.com`));
    const port = published[index] ?? published.at(-1);
    return index < 0 || port === undefined
      ? realFetch(input, init)
      : realFetch(url.replace(`https://${ADDRESSES[index]}.trycloudflare.com`, `http://127.0.0.1:${port}`), init);
  });
}

async function remoteManager() {
  const root = await mkdtemp(join(tmpdir(), "cosgral-remote-"));
  roots.push(root);
  const manager = new RemoteServerManager(
    join(root, "servers.json"),
    { encrypt: (value) => Buffer.from(value), decrypt: (value) => value.toString() },
    { createTeamAuthTicket: async () => unused(), getEmail: () => unused() },
  );
  await manager.initialize();
  return manager;
}

describe("HostService through a quick tunnel", () => {
  it("is the default way of sharing: one link, no account, and the other person joins with a name and a password", async () => {
    const { host, published } = await setup({ withTailscale: true });
    routeAddresses(published);
    const configured = await host.configure({ serverName: "Nasza przestrzeń" });
    expect(configured).toMatchObject({ configured: true, transport: "quick-tunnel", apiUrl: null });

    const started = await host.start();
    expect(started).toMatchObject({
      phase: "online",
      apiOnline: true,
      transport: "quick-tunnel",
      apiUrl: "https://pierwszy-adres-test.trycloudflare.com",
    });
    const invite = await host.createInvite({ role: "member" });
    expect(parseJoinUrl(invite.inviteUrl).apiUrl).toBe("https://pierwszy-adres-test.trycloudflare.com");

    const manager = await remoteManager();
    const server = await manager.join({
      inviteUrl: invite.inviteUrl,
      username: "Kuba",
      password: "bardzo-dlugie-haslo-1",
    });
    expect(server).toMatchObject({ name: "Nasza przestrzeń", role: "member", kind: "remote" });
    await manager.remove(server.id);
    await host.stop();
  });

  it("gives a new address after a restart, and the person who joined takes it over from the address update link", async () => {
    const { host, published } = await setup();
    routeAddresses(published);
    await host.configure({ serverName: "Nasza przestrzeń" });
    await host.start();
    const invite = await host.createInvite({ role: "member" });
    const manager = await remoteManager();
    const server = await manager.join({
      inviteUrl: invite.inviteUrl,
      username: "Kuba",
      password: "bardzo-dlugie-haslo-1",
    });

    await host.stop();
    const restarted = await host.start();
    expect(restarted.apiUrl).toBe("https://drugi-adres-test.trycloudflare.com");
    const updated = await manager.updateAddress(host.createAddressUpdate());
    expect(updated).toMatchObject({ id: server.id, name: "Nasza przestrzeń" });
    await expect(manager.login({ serverId: server.id })).resolves.toMatchObject({ role: "member" });
    await manager.remove(server.id);
    await host.stop();
  });

  it("remembers the choice of Tailscale and says in plain words when the tunnel breaks", async () => {
    const { host, published, listeners, store } = await setup({ withTailscale: true });
    await host.configure({ serverName: "Nasza przestrzeń" });
    const viaTailscale = await host.start({ transport: "tailscale" });
    expect(viaTailscale).toMatchObject({
      phase: "online",
      transport: "tailscale",
      apiUrl: "https://komputer.tail1a2b3.ts.net",
    });
    expect(store.getShareChoice()).toBe("tailscale");
    await host.stop();

    routeAddresses(published);
    const viaTunnel = await host.start({ transport: "quick-tunnel" });
    expect(viaTunnel).toMatchObject({ phase: "online", transport: "quick-tunnel" });
    listeners.closed?.();
    expect(host.getStatus()).toMatchObject({ phase: "error", apiOnline: false, apiUrl: null });
    expect(host.getStatus().message).toContain("przerwane");
    await host.stop();
  });

  it("says in plain words why it could not start, and leaves nothing running", async () => {
    const { host, unpublishedCount } = await setup({ publishError: new Error("Nie mam połączenia z internetem.") });
    await host.configure({ serverName: "Nasza przestrzeń" });
    const started = await host.start();
    expect(started).toMatchObject({
      phase: "error",
      apiOnline: false,
      apiUrl: null,
      message: "Nie mam połączenia z internetem.",
    });
    expect(unpublishedCount()).toBeGreaterThan(0);
  });
});
