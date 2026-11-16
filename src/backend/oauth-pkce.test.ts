// @vitest-environment node
// COSGRAL W10-KK1: the sign-in flow against a mock "service" on this computer: PKCE checked at the token endpoint, the
// loopback callback taken once, every refusal, the secrets that never come back in a message. No real account, no outside call.

import { createHash } from "node:crypto";
import { createServer, request as httpRequest } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildSignInUrl,
  createPkce,
  createState,
  type OAuthEndpoints,
  OAuthFailure,
  type OAuthRunOptions,
  refreshAccessToken,
  runAuthorization,
} from "./oauth-pkce";
import { browserThatAllows, MockService, portOf } from "./testing/oauth-mock";

let service: MockService | null = null;
afterEach(async () => {
  await service?.stop();
  service = null;
});
const startService = async () => {
  service = new MockService();
  await service.start();
  return service;
};

/** The "browser": follows the sign-in address back to the callback it names, like a person who allowed the access. */
const options = (
  mock: MockService,
  openBrowser: OAuthRunOptions["openBrowser"],
  patch: Partial<OAuthRunOptions> = {},
): OAuthRunOptions => ({
  endpoints: mock.endpoints,
  client: { clientId: "client-1", clientSecret: "client-secret-1" },
  scopes: ["read", "write"],
  redirectPort: null,
  openBrowser,
  onWaiting: () => undefined,
  timeoutMs: 5_000,
  now: () => 1_000_000,
  ...patch,
});

const reasonOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof OAuthFailure) return error.message;
    throw error;
  }
  throw new Error("expected a failure");
};

describe("PKCE and the sign-in address (W10-KK1)", () => {
  it("the verifier is long and random, the challenge is its S256 fingerprint, the state differs every time", () => {
    const a = createPkce();
    const b = createPkce();
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).toBe(createHash("sha256").update(a.verifier).digest("base64url"));
    expect(createState()).not.toBe(createState());
    expect(createState().length).toBeGreaterThanOrEqual(32);
  });

  it("the address has the code flow, S256, the state, the redirect, the scopes and the fixed extra parameters", () => {
    const url = new URL(
      buildSignInUrl({
        endpoints: {
          authorizeUrl: "https://example.com/authorize",
          tokenUrl: "https://example.com/t",
          tokenAuth: "body",
          authorizeParams: [["prompt", "consent"]],
        },
        clientId: "cid",
        redirectUri: "http://127.0.0.1:5000/callback",
        scopes: ["a", "b"],
        state: "st",
        challenge: "ch",
      }),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "cid",
      redirect_uri: "http://127.0.0.1:5000/callback",
      scope: "a b",
      state: "st",
      code_challenge: "ch",
      code_challenge_method: "S256",
      prompt: "consent",
    });
  });
});

describe("the sign-in against a mock service (W10-KK1)", () => {
  it("opens the address, takes the one callback, proves the verifier, and gives the tokens", async () => {
    const mock = await startService();
    const calls: Array<{ url: string }> = [];
    const waiting: Array<{ signInUrl: string; waitingUntilMs: number }> = [];
    const tokens = await runAuthorization(
      options(mock, browserThatAllows(mock, calls), { onWaiting: (info) => waiting.push(info) }),
    );
    expect(tokens).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      expiresAtMs: 1_000_000 + 3_600_000,
      scope: "read",
    });
    expect(calls).toHaveLength(1);
    expect(waiting).toEqual([{ signInUrl: calls[0]?.url, waitingUntilMs: 1_005_000 }]);
    const exchange = mock.seen[0];
    expect(exchange?.form.get("grant_type")).toBe("authorization_code");
    expect(exchange?.form.get("client_id")).toBe("client-1");
    expect(exchange?.form.get("client_secret")).toBe("client-secret-1");
    expect(exchange?.form.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  });

  it("the callback server is gone after the sign-in: nothing listens on that port any more", async () => {
    const mock = await startService();
    const calls: Array<{ url: string }> = [];
    await runAuthorization(options(mock, browserThatAllows(mock, calls)));
    const redirect = new URL(new URL(calls[0]?.url ?? "").searchParams.get("redirect_uri") ?? "");
    await expect(fetch(`${redirect.origin}/callback?state=x&code=y`)).rejects.toBeDefined();
  });

  it("a callback with the wrong state, the wrong path or another Host is ignored and does not end the sign-in", async () => {
    const mock = await startService();
    const open: OAuthRunOptions["openBrowser"] = async (signInUrl) => {
      const url = new URL(signInUrl);
      mock.rememberChallenge(url.searchParams.get("code_challenge") ?? "");
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      const state = url.searchParams.get("state") ?? "";
      setTimeout(() => {
        void (async () => {
          const wrongState = await fetch(`${back.origin}/callback?code=evil&state=nope`);
          const wrongPath = await fetch(`${back.origin}/other?code=evil&state=${state}`);
          const post = await fetch(`${back.origin}/callback?code=evil&state=${state}`, { method: "POST" });
          const foreignHost = await new Promise<number>((done, fail) => {
            const rebound = httpRequest(
              {
                host: "127.0.0.1",
                port: back.port,
                path: `/callback?code=evil&state=${state}`,
                headers: { Host: "attacker.example" },
              },
              (response) => {
                response.resume();
                done(response.statusCode ?? 0);
              },
            );
            rebound.on("error", fail);
            rebound.end();
          });
          expect([wrongState.status, wrongPath.status, post.status, foreignHost]).toEqual([404, 404, 404, 404]);
          await fetch(`${back.origin}/callback?code=one-time-code&state=${state}`);
        })();
      }, 20);
    };
    const tokens = await runAuthorization(options(mock, open));
    expect(tokens.accessToken).toBe("access-1");
    expect(mock.seen).toHaveLength(1);
    expect(mock.seen[0]?.form.get("code")).toBe("one-time-code");
  });

  it("the page the browser sees says the sign-in is done and never repeats the address it came with", async () => {
    const mock = await startService();
    const seen = { page: "", cacheControl: "", referrerPolicy: "" };
    const open: OAuthRunOptions["openBrowser"] = async (signInUrl) => {
      const url = new URL(signInUrl);
      mock.rememberChallenge(url.searchParams.get("code_challenge") ?? "");
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", "one-time-code-ZZZ");
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      setTimeout(() => {
        void fetch(back).then(async (response) => {
          seen.cacheControl = response.headers.get("cache-control") ?? "";
          seen.referrerPolicy = response.headers.get("referrer-policy") ?? "";
          seen.page = await response.text();
        });
      }, 20);
    };
    await runAuthorization(options(mock, open));
    await new Promise((done) => setTimeout(done, 50));
    expect(seen.page).toMatch(/You can close this window/);
    expect(seen.page).not.toContain("ZZZ");
    expect(seen.cacheControl).toBe("no-store");
    expect(seen.referrerPolicy).toBe("no-referrer");
  });

  it("a refusal on the sign-in page is a plain sentence, an unknown one is generic and is not echoed", async () => {
    const mock = await startService();
    const refuse =
      (error: string): OAuthRunOptions["openBrowser"] =>
      async (signInUrl) => {
        const url = new URL(signInUrl);
        const back = new URL(url.searchParams.get("redirect_uri") ?? "");
        back.searchParams.set("error", error);
        back.searchParams.set("state", url.searchParams.get("state") ?? "");
        setTimeout(() => void fetch(back).catch(() => undefined), 20);
      };
    expect(await reasonOf(runAuthorization(options(mock, refuse("access_denied"))))).toMatch(/not allowed/);
    const generic = await reasonOf(runAuthorization(options(mock, refuse("<script>alert(1)</script>"))));
    expect(generic).toBe("The service did not allow the sign-in.");
    expect(mock.seen).toHaveLength(0);
  });

  it("gives up after the time, and stops at once when it is cancelled", async () => {
    const mock = await startService();
    const silent: OAuthRunOptions["openBrowser"] = async () => undefined;
    expect(await reasonOf(runAuthorization(options(mock, silent, { timeoutMs: 150 })))).toMatch(/not finished in time/);
    const controller = new AbortController();
    const pending = runAuthorization(options(mock, silent, { signal: controller.signal }));
    setTimeout(() => controller.abort(), 50);
    expect(await reasonOf(pending)).toBe("The sign-in was cancelled.");
    const already = new AbortController();
    already.abort();
    expect(await reasonOf(runAuthorization(options(mock, silent, { signal: already.signal })))).toBe(
      "The sign-in was cancelled.",
    );
  });

  it("a fixed callback port is used, and a port that is taken gives a readable reason", async () => {
    const mock = await startService();
    const free = await new Promise<number>((done) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const port = portOf(probe);
        probe.close(() => done(port));
      });
    });
    const calls: Array<{ url: string }> = [];
    await runAuthorization(options(mock, browserThatAllows(mock, calls), { redirectPort: free }));
    expect(new URL(calls[0]?.url ?? "").searchParams.get("redirect_uri")).toBe(`http://127.0.0.1:${free}/callback`);
    const holder = createServer();
    await new Promise<void>((done) => holder.listen(free, "127.0.0.1", done));
    try {
      expect(await reasonOf(runAuthorization(options(mock, browserThatAllows(mock), { redirectPort: free })))).toMatch(
        /already in use/,
      );
    } finally {
      await new Promise<void>((done) => holder.close(() => done()));
    }
  });

  it("when the browser cannot be opened the try goes on waiting (the address is in the status) and can still finish by hand", async () => {
    const mock = await startService();
    const broken: OAuthRunOptions["openBrowser"] = async () => {
      throw new Error("no browser");
    };
    expect(await reasonOf(runAuthorization(options(mock, broken, { timeoutMs: 200 })))).toMatch(/not finished in time/);
    const byHand = browserThatAllows(mock);
    const addresses: string[] = [];
    const tokens = await runAuthorization(
      options(mock, broken, {
        onWaiting: (info) => {
          addresses.push(info.signInUrl);
          setTimeout(() => void byHand(info.signInUrl), 10);
        },
      }),
    );
    expect(tokens.accessToken).toBe("access-1");
    expect(addresses).toHaveLength(1);
  });

  it("every failure of the token step is a plain sentence that carries no answer body, code or verifier", async () => {
    const mock = await startService();
    const cases: Array<[{ status: number; body: string; type: string }, RegExp]> = [
      [
        {
          status: 401,
          body: JSON.stringify({ error: "invalid_client", error_description: "secret-leak-1" }),
          type: "application/json",
        },
        /client id or secret/,
      ],
      [{ status: 500, body: "<html>secret-leak-2 stack trace</html>", type: "text/html" }, /answer 500/],
      [
        { status: 200, body: JSON.stringify({ token_type: "bearer" }), type: "application/json" },
        /without an access token/,
      ],
      [
        { status: 200, body: JSON.stringify({ access_token: "a", token_type: "mac" }), type: "application/json" },
        /kind of token/,
      ],
      [
        { status: 200, body: JSON.stringify({ error: "invalid_grant" }), type: "application/json" },
        /expired or been used/,
      ],
    ];
    for (const [answer, pattern] of cases) {
      mock.answer = answer;
      const reason = await reasonOf(runAuthorization(options(mock, browserThatAllows(mock))));
      expect(reason).toMatch(pattern);
      expect(reason).not.toMatch(/secret-leak|one-time-code|client-secret-1|stack trace/);
    }
    mock.answer = null;
  });

  it("an unreachable token endpoint is a readable reason, not a stack trace", async () => {
    const mock = await startService();
    const endpoints = { ...mock.endpoints, tokenUrl: "http://127.0.0.1:1/token" };
    const reason = await reasonOf(runAuthorization(options(mock, browserThatAllows(mock), { endpoints })));
    expect(reason).toMatch(/could not be reached/);
  });

  it("a service that answers in a form body (not JSON) is read too", async () => {
    const mock = await startService();
    mock.answer = {
      status: 200,
      body: "access_token=gho_abc&token_type=bearer&scope=repo",
      type: "application/x-www-form-urlencoded",
    };
    const tokens = await runAuthorization(options(mock, browserThatAllows(mock)));
    expect(tokens).toEqual({ accessToken: "gho_abc", refreshToken: null, expiresAtMs: null, scope: "repo" });
  });

  it("Basic client authentication keeps the secret out of the body", async () => {
    const mock = await startService();
    const endpoints: OAuthEndpoints = { ...mock.endpoints, tokenAuth: "basic" };
    await runAuthorization(options(mock, browserThatAllows(mock), { endpoints }));
    const exchange = mock.seen[0];
    expect(exchange?.authorization).toBe(`Basic ${Buffer.from("client-1:client-secret-1").toString("base64")}`);
    expect(exchange?.form.get("client_secret")).toBeNull();
    expect(exchange?.form.get("client_id")).toBeNull();
  });

  it("a client without a secret sends none", async () => {
    const mock = await startService();
    await runAuthorization(
      options(mock, browserThatAllows(mock), { client: { clientId: "public-client", clientSecret: null } }),
    );
    expect(mock.seen[0]?.form.get("client_secret")).toBeNull();
    expect(mock.seen[0]?.form.get("client_id")).toBe("public-client");
  });
});

describe("refreshing a sign-in (W10-KK1)", () => {
  it("gives a new access token and keeps the old refresh token when none comes back", async () => {
    const mock = await startService();
    const tokens = await refreshAccessToken({
      endpoints: mock.endpoints,
      client: { clientId: "c", clientSecret: null },
      refreshToken: "refresh-1",
      now: () => 5_000,
    });
    expect(tokens).toEqual({
      accessToken: "access-2",
      refreshToken: "refresh-1",
      expiresAtMs: 5_000 + 1_800_000,
      scope: null,
    });
    expect(mock.seen[0]?.form.get("grant_type")).toBe("refresh_token");
    expect(mock.seen[0]?.form.get("refresh_token")).toBe("refresh-1");
  });

  it("a refused refresh means the sign-in is dead; a broken service is only a bad moment", async () => {
    const mock = await startService();
    const attempt = () =>
      refreshAccessToken({
        endpoints: mock.endpoints,
        client: { clientId: "c", clientSecret: null },
        refreshToken: "r",
      });
    mock.answer = { status: 400, body: JSON.stringify({ error: "invalid_grant" }), type: "application/json" };
    await expect(attempt()).rejects.toMatchObject({ needsLogin: true });
    mock.answer = { status: 503, body: "busy", type: "text/plain" };
    await expect(attempt()).rejects.toMatchObject({ needsLogin: false });
  });
});
