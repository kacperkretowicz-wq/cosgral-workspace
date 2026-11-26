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

async function setup(publishError?: Error) {
  const root = await mkdtemp(join(tmpdir(), "cosgral-host-tailscale-"));
  roots.push(root);
  const store = new TeamStore(join(root, "team.json"));
  await store.initialize();
  const database = new OpenBotDatabase(root);
  await database.initialize();
  const events = new EventEmitter();
  const published: number[] = [];
  let unpublished = 0;
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
    tailscale: {
      publish: async (port: number) => {
        if (publishError) throw publishError;
        published.push(port);
        return "https://komputer.tail1a2b3.ts.net";
      },
      unpublish: async () => {
        unpublished += 1;
      },
    },
  };
  // The host needs only a small part of the agent service, browser host and mailbox in this test.
  // biome-ignore lint/nursery/noUnsafeTypeAssertion: the host needs only a small part of the agent service, browser host and mailbox here.
  const host = new HostService(options as unknown as Options);
  return { host, published, unpublishedCount: () => unpublished };
}

describe("HostService through Tailscale", () => {
  it("shows the server in the private network, lets a person join with a name and a password, and stops", async () => {
    const { host, published, unpublishedCount } = await setup();
    const configured = await host.configure({ serverName: "Nasza przestrzeń" });
    expect(configured).toMatchObject({ configured: true, transport: "tailscale", apiUrl: null });

    const started = await host.start();
    expect(started).toMatchObject({ phase: "online", apiOnline: true, apiUrl: "https://komputer.tail1a2b3.ts.net" });
    expect(published).toHaveLength(1);

    const invite = await host.createInvite({ role: "member" });
    const parsed = parseJoinUrl(invite.inviteUrl);
    expect(parsed.apiUrl).toBe("https://komputer.tail1a2b3.ts.net");

    const base = `http://127.0.0.1:${published[0]}`;
    const joined = await fetch(`${base}/v1/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteToken: parsed.token, username: "kuba", password: "bardzo-dlugie-haslo-1" }),
    });
    expect(joined.status).toBe(201);
    expect(await joined.json()).toMatchObject({ member: { role: "member" }, sessionToken: expect.any(String) });
    const login = await fetch(`${base}/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "kuba", password: "bardzo-dlugie-haslo-1" }),
    });
    expect(login.status).toBe(200);

    const stopped = await host.stop();
    expect(stopped).toMatchObject({ phase: "idle", apiOnline: false, apiUrl: null });
    expect(unpublishedCount()).toBeGreaterThan(0);
  });

  it("lets the other computer join with a name and a password, and sign in again later", async () => {
    const { host, published } = await setup();
    await host.configure({ serverName: "Nasza przestrzeń" });
    await host.start();
    const invite = await host.createInvite({ role: "member" });
    // The Tailscale address cannot be reached in a test: send its requests to the local server of the host.
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) =>
      realFetch(String(input).replace("https://komputer.tail1a2b3.ts.net", `http://127.0.0.1:${published[0]}`), init),
    );
    const root = await mkdtemp(join(tmpdir(), "cosgral-remote-"));
    roots.push(root);
    const manager = new RemoteServerManager(
      join(root, "servers.json"),
      { encrypt: (value) => Buffer.from(value), decrypt: (value) => value.toString() },
      {
        createTeamAuthTicket: async () => unused(),
        getEmail: () => unused(),
      },
    );
    await manager.initialize();
    const server = await manager.join({
      inviteUrl: invite.inviteUrl,
      username: "Kuba",
      password: "bardzo-dlugie-haslo-1",
    });
    expect(server).toMatchObject({ name: "Nasza przestrzeń", role: "member", kind: "remote" });
    await expect(manager.login({ serverId: server.id })).resolves.toMatchObject({ role: "member" });
    await manager.remove(server.id);
    await host.stop();
  });

  it("says in plain words why it could not start, and leaves nothing running", async () => {
    const { host } = await setup(new Error("Zainstaluj Tailscale."));
    await host.configure({ serverName: "Nasza przestrzeń" });
    const started = await host.start();
    expect(started).toMatchObject({ phase: "error", apiOnline: false, apiUrl: null, message: "Zainstaluj Tailscale." });
  });
});
