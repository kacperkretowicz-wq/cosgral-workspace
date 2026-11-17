// @vitest-environment node
// W12-KK (1): the MCP sign-in on a FAKE OAuth + MCP server that listens on 127.0.0.1 (a random port) and a fake "browser" that opens
// the authorization address and follows its redirect. No real account, service or network.
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@openbot/contracts/ipc";
import { isMcpOAuthChanged, isMcpOAuthStatus } from "@openbot/contracts/ipc";
import { isDynamicRecord, isNumber, isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import { closeTestDatabases, testDatabase } from "../testing/databases";
import type { SecretBox } from "../vault-store";
import { startCallbackServer } from "./loopback-callback";
import { McpOAuthService } from "./mcp-oauth-service";
import { McpOAuthStore } from "./oauth-store";

const fakeBox: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8"),
};

const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A fake service: protected-resource and authorization-server metadata, client registration, authorize, token (PKCE checked). */
async function fakeService(options: { registration?: boolean } = {}) {
  const issued = {
    codes: new Map<string, { challenge: string; redirect: string }>(),
    access: new Set<string>(),
    refresh: new Set<string>(),
  };
  const tokenRequests: string[] = [];
  const redirectUris: string[] = [];
  const seen = { registrations: 0, tokenRequests, redirectUris };
  let base = "";
  const readBody = (request: import("node:http").IncomingMessage) =>
    new Promise<string>((resolve) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", base);
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      return json(200, { resource: `${base}/mcp`, authorization_servers: [base] });
    }
    if (url.pathname.startsWith("/.well-known/oauth-authorization-server")) {
      return json(200, {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        ...(options.registration === false ? {} : { registration_endpoint: `${base}/register` }),
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
      });
    }
    if (url.pathname === "/register" && request.method === "POST") {
      const body = JSON.parse(await readBody(request));
      seen.registrations += 1;
      seen.redirectUris.push(...body.redirect_uris);
      return json(201, { ...body, client_id: `client-${seen.registrations}` });
    }
    if (url.pathname === "/authorize") {
      const redirect = url.searchParams.get("redirect_uri") ?? "";
      const code = randomBytes(8).toString("hex");
      issued.codes.set(code, { challenge: url.searchParams.get("code_challenge") ?? "", redirect });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ code, state: url.searchParams.get("state"), redirect }));
      return undefined;
    }
    if (url.pathname === "/token" && request.method === "POST") {
      const form = new URLSearchParams(await readBody(request));
      seen.tokenRequests.push(form.get("grant_type") ?? "");
      if (form.get("grant_type") === "authorization_code") {
        const entry = issued.codes.get(form.get("code") ?? "");
        const verifier = form.get("code_verifier") ?? "";
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        if (!entry || entry.challenge !== challenge || entry.redirect !== form.get("redirect_uri")) {
          return json(400, { error: "invalid_grant" });
        }
        issued.codes.delete(form.get("code") ?? "");
      } else if (form.get("grant_type") === "refresh_token") {
        if (!issued.refresh.has(form.get("refresh_token") ?? "")) return json(400, { error: "invalid_grant" });
      } else return json(400, { error: "unsupported_grant_type" });
      const access = `access-${randomBytes(6).toString("hex")}`;
      const refresh = `refresh-${randomBytes(6).toString("hex")}`;
      issued.access.add(access);
      issued.refresh.add(refresh);
      return json(200, { access_token: access, token_type: "Bearer", expires_in: 3600, refresh_token: refresh });
    }
    if (url.pathname === "/mcp") {
      const bearer = (request.headers.authorization ?? "").replace(/^Bearer /, "");
      if (!issued.access.has(bearer)) {
        response.writeHead(401, {
          "www-authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
        });
        response.end();
        return undefined;
      }
      return json(200, { ok: true });
    }
    response.writeHead(404).end();
    return undefined;
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${isDynamicRecord(address) && isNumber(address.port) ? address.port : 0}`;
  return { base, issued, seen };
}

async function setup(opts: { registration?: boolean; waitMs?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "mcp-oauth-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const remote = await fakeService({ registration: opts.registration });
  const store = new McpOAuthStore(database, fakeBox);
  const events: AgentEvent[] = [];
  const reconnects: string[] = [];
  const opened: string[] = [];
  const mcpServers = [
    { id: "srv-http", name: "p_demo", transport: "http" as const, url: `${remote.base}/mcp` },
    { id: "srv-stdio", name: "p_local", transport: "stdio" as const, url: null },
  ];
  const service = new McpOAuthService({
    store,
    mcp: {
      list: () => mcpServers,
      reconnect: async ({ serverId }) => {
        reconnects.push(serverId);
      },
    },
    emit: (event) => events.push(event),
    openBrowser: async (url) => {
      opened.push(url);
    },
    waitMs: opts.waitMs,
  });
  /** The fake browser: opens the authorization address, then follows the redirect to the loopback address with `code` and `state`. */
  const browser = async (mutate?: (url: URL) => void) => {
    const address = opened.at(-1);
    if (!address) throw new Error("no browser address");
    const answer = await (await fetch(address)).json();
    if (!isDynamicRecord(answer) || !isString(answer.redirect) || !isString(answer.code) || !isString(answer.state)) {
      throw new Error("unexpected authorize answer");
    }
    const back = new URL(answer.redirect);
    back.searchParams.set("code", answer.code);
    back.searchParams.set("state", answer.state);
    mutate?.(back);
    return fetch(back);
  };
  const until = async (check: () => boolean) => {
    for (let index = 0; index < 200 && !check(); index += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    if (!check()) throw new Error("timed out in the test");
  };
  return { service, store, remote, events, reconnects, opened, browser, until, database };
}

describe("loopback callback", () => {
  it("answers only the right host and path, takes the first result, and writes nothing of the address into the page", async () => {
    const callback = await startCallbackServer({ expectedState: "good-state" });
    const base = new URL(callback.redirectUrl);
    expect((await fetch(`${base.origin}/other`)).status).toBe(404);
    expect((await fetch(`${base.origin}${base.pathname}`)).status).toBe(404);
    const reply = await fetch(`${callback.redirectUrl}?code=SECRET-CODE-123&state=good-state`);
    expect(reply.status).toBe(200);
    expect(await reply.text()).not.toContain("SECRET-CODE-123");
    expect(await callback.result).toEqual({ kind: "code", code: "SECRET-CODE-123" });
    callback.close();
  });

  it("a wrong state, a refusal and the time limit each end it; closing first says closed", async () => {
    const wrong = await startCallbackServer({ expectedState: "good" });
    await fetch(`${wrong.redirectUrl}?code=x&state=bad`);
    expect(await wrong.result).toEqual({ kind: "state-mismatch" });
    const denied = await startCallbackServer({ expectedState: "good" });
    await fetch(`${denied.redirectUrl}?error=access_denied&state=good`);
    expect(await denied.result).toEqual({ kind: "denied" });
    const slow = await startCallbackServer({ expectedState: "good", timeoutMs: 30 });
    expect(await slow.result).toEqual({ kind: "timeout" });
    const closed = await startCallbackServer({ expectedState: "good" });
    closed.close();
    expect(await closed.result).toEqual({ kind: "closed" });
  });
});

describe("MCP sign-in (fake service)", () => {
  it("runs the whole flow: browser, code, tokens saved encrypted, server reconnected, signed in", async () => {
    const { service, store, remote, events, reconnects, opened, browser, until, database } = await setup();
    expect(service.list().statuses.map((status) => [status.serverId, status.state])).toEqual([
      ["srv-http", "signed-out"],
    ]);
    const waiting = await service.signIn("srv-http");
    expect(waiting.state).toBe("waiting-browser");
    expect(isMcpOAuthStatus(waiting)).toBe(true);
    await until(() => opened.length === 1);
    expect(new URL(opened[0] ?? "").origin).toBe(remote.base);
    const page = await browser();
    expect(page.status).toBe(200);
    await until(() => service.status("srv-http").state === "signed-in");
    expect(reconnects).toEqual(["srv-http"]);
    expect(remote.seen.registrations).toBe(1);
    expect(remote.seen.tokenRequests).toEqual(["authorization_code"]);
    expect(remote.seen.redirectUris[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp-oauth\/callback$/);
    const stored = store.read("srv-http");
    expect(stored.tokens?.access_token).toMatch(/^access-/);
    const accessToken = stored.tokens?.access_token ?? "";
    const row = database.connection.prepare("SELECT tokens_enc, client_enc FROM projection_mcp_oauth").get();
    expect(JSON.stringify(row)).not.toContain(accessToken);
    expect(JSON.stringify(row)).not.toContain("client-1");
    // Nothing of a token, a code or a state in any event or status.
    const everything = JSON.stringify([events, service.list(), service.status("srv-http")]);
    expect(everything).not.toContain(accessToken);
    expect(everything).not.toContain(stored.tokens?.refresh_token ?? "x");
    expect(everything).not.toMatch(/code=/);
    expect(events.every(isMcpOAuthChanged)).toBe(true);
    expect(service.status("srv-http")).toMatchObject({ state: "signed-in" });
    expect(service.status("srv-http").tokenExpiresAt).not.toBeNull();
  });

  it("a normal connection gets a provider only when tokens are saved, and it never opens a browser", async () => {
    const { service, opened, browser, until } = await setup();
    expect(service.providerFor("srv-http")).toBeUndefined();
    await service.signIn("srv-http");
    await until(() => opened.length === 1);
    await browser();
    await until(() => service.status("srv-http").state === "signed-in");
    const provider = service.providerFor("srv-http");
    expect(provider).toBeDefined();
    expect(provider?.tokens()).toMatchObject({ token_type: "Bearer" });
    opened.length = 0;
    await provider?.redirectToAuthorization(new URL("https://login.example.test/authorize"));
    expect(opened).toEqual([]);
  });

  it("a refused sign-in, a wrong state and a timeout end as failed with a fixed sentence; nothing is saved", async () => {
    const first = await setup();
    await first.service.signIn("srv-http");
    await first.until(() => first.opened.length === 1);
    await first.browser((back) => {
      back.searchParams.delete("code");
      back.searchParams.set("error", "access_denied");
    });
    await first.until(() => first.service.status("srv-http").state === "failed");
    expect(first.service.status("srv-http")).toMatchObject({
      errorCode: "denied",
      error: "The sign-in was refused on the service's page.",
    });
    expect(first.store.read("srv-http").tokens).toBeNull();

    const second = await setup();
    await second.service.signIn("srv-http");
    await second.until(() => second.opened.length === 1);
    await second.browser((back) => back.searchParams.set("state", "forged"));
    await second.until(() => second.service.status("srv-http").state === "failed");
    expect(second.service.status("srv-http").errorCode).toBe("state-mismatch");
    expect(second.store.read("srv-http").tokens).toBeNull();

    const third = await setup({ waitMs: 60 });
    await third.service.signIn("srv-http");
    await third.until(() => third.service.status("srv-http").state === "failed");
    expect(third.service.status("srv-http").errorCode).toBe("timeout");
    expect(isMcpOAuthStatus(third.service.status("srv-http"))).toBe(true);
  });

  it("a server that does not allow registration or has no sign-in ends as failed with the right code", async () => {
    const noRegistration = await setup({ registration: false });
    await noRegistration.service.signIn("srv-http");
    await noRegistration.until(() => noRegistration.service.status("srv-http").state === "failed");
    expect(noRegistration.service.status("srv-http").errorCode).toBe("registration-failed");
    expect(JSON.stringify(noRegistration.events)).not.toMatch(/dynamic client registration/);
  });

  it("a server over stdio cannot sign in, and an unknown server is refused", async () => {
    const { service } = await setup();
    await expect(service.signIn("nope")).rejects.toThrow(/not known/);
    expect(service.status("srv-stdio").errorCode).toBeNull();
    const status = await service.signIn("srv-stdio");
    expect(status).toMatchObject({ state: "failed", errorCode: "not-http" });
  });

  it("cancel stops a waiting attempt and frees the loopback address; a new attempt replaces an old one", async () => {
    const { service, opened, until, browser } = await setup();
    await service.signIn("srv-http");
    await until(() => opened.length === 1);
    expect(service.cancel("srv-http").state).toBe("signed-out");
    // The old browser page now reaches nothing that counts: refused (or no listener at all), and nothing is signed in.
    const late = await browser().then(
      (reply) => reply.status,
      () => 0,
    );
    expect(late === 0 || late === 404).toBe(true);
    expect(service.status("srv-http").state).toBe("signed-out");
    await service.signIn("srv-http");
    await until(() => opened.length === 2);
    await service.signIn("srv-http");
    await until(() => opened.length === 3);
    await browser();
    await until(() => service.status("srv-http").state === "signed-in");
  });

  it("sign-out forgets the tokens and the registration and reconnects the server", async () => {
    const { service, store, reconnects, opened, until, browser } = await setup();
    await service.signIn("srv-http");
    await until(() => opened.length === 1);
    await browser();
    await until(() => service.status("srv-http").state === "signed-in");
    reconnects.length = 0;
    const out = await service.signOut("srv-http");
    expect(out.state).toBe("signed-out");
    expect(store.read("srv-http")).toEqual({ client: null, tokens: null, tokensSavedAt: null });
    expect(reconnects).toEqual(["srv-http"]);
    expect(service.providerFor("srv-http")).toBeUndefined();
  });

  it("the saved tokens renew by themselves: a stale access token is refreshed with the refresh token", async () => {
    const { service, store, remote, opened, until, browser } = await setup();
    await service.signIn("srv-http");
    await until(() => opened.length === 1);
    await browser();
    await until(() => service.status("srv-http").state === "signed-in");
    const before = store.read("srv-http").tokens;
    remote.issued.access.clear();
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const provider = service.providerFor("srv-http");
    const transport = new StreamableHTTPClientTransport(
      new URL(`${remote.base}/mcp`),
      provider ? { authProvider: provider } : {},
    );
    // The first request is refused (the access token is gone), the SDK renews it through the provider, and the second one passes.
    await transport.start();
    await transport.send({ jsonrpc: "2.0", id: 1, method: "ping" }).catch(() => undefined);
    expect(remote.seen.tokenRequests).toContain("refresh_token");
    expect(store.read("srv-http").tokens?.access_token).not.toBe(before?.access_token);
    await transport.close();
  });

  it("removed servers lose their saved tokens when the list is read", async () => {
    const { service, store } = await setup();
    store.writeTokens("gone-server", { access_token: "a", token_type: "Bearer" });
    expect(store.serverIdsWithTokens()).toContain("gone-server");
    service.list();
    expect(store.serverIdsWithTokens()).not.toContain("gone-server");
  });
});
