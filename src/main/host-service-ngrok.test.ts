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

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function unused(): never {
  throw new Error("This operation is not used by this test.");
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "cosgral-host-ngrok-"));
  roots.push(root);
  const store = new TeamStore(join(root, "team.json"));
  await store.initialize();
  const database = new OpenBotDatabase(root);
  await database.initialize();
  const events = new EventEmitter();
  const published: number[] = [];
  let unpublished = 0;
  let savedDomain: string | null = null;
  const mailbox: string[] = [];
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
    addressBeacon: {
      publish: async (_serverId: string, _fingerprint: string, updateUrl: string) => {
        mailbox.unshift(updateUrl);
      },
    },
    quickTunnel: { publish: async () => "https://unused-test.trycloudflare.com", unpublish: async () => undefined },
    ngrokSettings: {
      get: () => (savedDomain ? { domain: savedDomain } : null),
      set: async (input: { authtoken: string; domain: string }) => {
        savedDomain = input.domain;
      },
    },
    ngrok: {
      publish: async (port: number) => {
        if (!savedDomain) throw new Error("Najpierw wpisz token i domenę.");
        published.push(port);
        return `https://${savedDomain}`;
      },
      unpublish: async () => {
        unpublished += 1;
      },
    },
  };
  // The host needs only a small part of the agent service, browser host and mailbox in this test.
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: the host needs only a small part of the agent service, browser host and mailbox here.
  const host = new HostService(options as unknown as Options);
  return { host, published, store, mailbox, unpublishedCount: () => unpublished };
}

function routeAddress(published: number[]) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const port = published.at(-1);
    return url.startsWith("https://nazwa-test.ngrok-free.app") && port !== undefined
      ? realFetch(url.replace("https://nazwa-test.ngrok-free.app", `http://127.0.0.1:${port}`), init)
      : realFetch(input, init);
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

describe("HostService with a stable ngrok address", () => {
  it("needs the token and the domain first, then shares at the same address every time and needs no new-address notes", async () => {
    const { host, published, mailbox, store } = await setup();
    await host.configure({ serverName: "Nasza przestrzeń" });
    expect(host.getStatus().ngrok).toEqual({ configured: false, domain: null });
    const early = await host.start({ transport: "ngrok" });
    expect(early).toMatchObject({ phase: "error", transport: "ngrok", message: "Najpierw wpisz token i domenę." });

    const saved = await host.configureNgrok({ authtoken: "x".repeat(30), domain: "nazwa-test.ngrok-free.app" });
    expect(saved.ngrok).toEqual({ configured: true, domain: "nazwa-test.ngrok-free.app" });
    routeAddress(published);
    const first = await host.start({ transport: "ngrok" });
    expect(first).toMatchObject({ phase: "online", transport: "ngrok", apiUrl: "https://nazwa-test.ngrok-free.app" });
    expect(store.getShareChoice()).toBe("ngrok");
    const invite = await host.createInvite({ role: "member" });
    expect(parseJoinUrl(invite.inviteUrl).apiUrl).toBe("https://nazwa-test.ngrok-free.app");

    const manager = await remoteManager();
    const server = await manager.join({
      inviteUrl: invite.inviteUrl,
      username: "Kuba",
      password: "bardzo-dlugie-haslo-1",
    });
    expect(server).toMatchObject({ role: "member", kind: "remote", apiUrl: "https://nazwa-test.ngrok-free.app" });

    await host.stop();
    const second = await host.start();
    expect(second.apiUrl).toBe("https://nazwa-test.ngrok-free.app");
    await expect(manager.login({ serverId: server.id })).resolves.toMatchObject({ role: "member" });
    expect(mailbox).toHaveLength(0);
    manager.stop();
    await host.stop();
  });
});
