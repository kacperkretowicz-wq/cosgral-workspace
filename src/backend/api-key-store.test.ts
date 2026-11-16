// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiKeyEnv, redactApiKeys, setApiKeySource } from "./api-key-env";
import { ApiKeyStore } from "./api-key-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import type { SecretBox } from "./vault-store";

// Test data only: no real key.
const OPENAI_KEY = "test-key-0000-openai-abcd";
const ANTHROPIC_KEY = "test-key-1111-anthropic-wxyz";

/** A reversible stand-in for Electron safeStorage: the stored text never equals the secret. */
const fakeBox: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8"),
};
const noBox: SecretBox = {
  canEncrypt: () => false,
  encrypt: () => {
    throw new Error("unavailable");
  },
  decrypt: () => {
    throw new Error("unavailable");
  },
};

const roots: string[] = [];
afterEach(async () => {
  setApiKeySource(null);
  vi.restoreAllMocks();
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

type FetchCall = { url: string; headers: Record<string, string>; method: string };

function fakeFetch(status: number | Error, calls: FetchCall[] = []): typeof fetch {
  return Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        headers: Object.fromEntries(new Headers(init?.headers)),
        method: init?.method ?? "GET",
      });
      if (status instanceof Error) throw status;
      return new Response(JSON.stringify({ error: `echo ${JSON.stringify(init?.headers)}` }), { status });
    },
    { preconnect: () => undefined },
  );
}

async function open(box: SecretBox = fakeBox, fetchImpl: typeof fetch = fakeFetch(200)) {
  const dir = await mkdtemp(join(tmpdir(), "api-key-store-"));
  roots.push(dir);
  const database = testDatabase(join(dir, "data"));
  await database.initialize();
  const store = new ApiKeyStore(database, box, { fetch: fetchImpl, now: () => new Date("2026-11-16T10:00:00.000Z") });
  return { dir, database, store };
}

async function everythingOnDisk(dir: string): Promise<string> {
  const folder = join(dir, "data");
  const parts: string[] = [];
  for (const name of await readdir(folder)) {
    const file = join(folder, name);
    if (name.startsWith("openbot.db")) parts.push((await readFile(file)).toString("latin1"));
  }
  return parts.join("\n");
}

describe("ApiKeyStore", () => {
  it("lists both providers without a key at first", async () => {
    const { store } = await open();
    expect(store.list()).toEqual([
      { provider: "codex", maskedKey: null, status: "unchecked", message: null, checkedAt: null, updatedAt: null },
      { provider: "claude", maskedKey: null, status: "unchecked", message: null, checkedAt: null, updatedAt: null },
    ]);
  });

  it("saves a key and answers with a mask of the last 4 characters only", async () => {
    const { store } = await open();
    const entry = store.set("codex", OPENAI_KEY);
    expect(entry).toMatchObject({
      provider: "codex",
      maskedKey: "••••abcd",
      status: "unchecked",
      updatedAt: "2026-11-16T10:00:00.000Z",
    });
    expect(JSON.stringify(store.list())).not.toContain(OPENAI_KEY);
    expect(JSON.stringify(entry)).not.toContain(OPENAI_KEY.slice(0, -4));
    expect(store.list()[1]?.maskedKey).toBeNull();
  });

  it("shows no characters of a short key", async () => {
    const { store } = await open();
    expect(store.set("claude", "test-key").maskedKey).toBe("••••");
  });

  it("trims the pasted key and replaces an older one, resetting the state", async () => {
    const { store } = await open();
    store.set("codex", OPENAI_KEY);
    const replaced = store.set("codex", `  ${ANTHROPIC_KEY}\n`);
    expect(replaced.maskedKey).toBe("••••wxyz");
    expect(replaced.status).toBe("unchecked");
    expect(store.env("codex")).toEqual({ OPENAI_API_KEY: ANTHROPIC_KEY });
  });

  it("reads the key back only as the environment variable of that provider", async () => {
    const { store } = await open();
    expect(store.env("codex")).toEqual({});
    store.set("codex", OPENAI_KEY);
    store.set("claude", ANTHROPIC_KEY);
    expect(store.env("codex")).toEqual({ OPENAI_API_KEY: OPENAI_KEY });
    expect(store.env("claude")).toEqual({ ANTHROPIC_API_KEY: ANTHROPIC_KEY });
  });

  it("keeps the key after the program restarts (same database, new store)", async () => {
    const { store, database } = await open();
    store.set("codex", OPENAI_KEY);
    const again = new ApiKeyStore(database, fakeBox);
    expect(again.env("codex")).toEqual({ OPENAI_API_KEY: OPENAI_KEY });
    expect(again.list()[0]?.maskedKey).toBe("••••abcd");
  });

  it("removes the key and the environment variable", async () => {
    const { store, database } = await open();
    store.set("codex", OPENAI_KEY);
    const entry = store.remove("codex");
    expect(entry).toMatchObject({ provider: "codex", maskedKey: null, status: "unchecked", updatedAt: null });
    expect(store.env("codex")).toEqual({});
    const left = database.connection.prepare("SELECT COUNT(*) AS n FROM projection_provider_api_keys").get();
    expect(left).toMatchObject({ n: 0 });
    expect(() => store.remove("codex")).not.toThrow();
  });

  it("never writes the key as clear text (or as plain base64) into the database files", async () => {
    const { store, database, dir } = await open();
    store.set("codex", OPENAI_KEY);
    store.set("claude", ANTHROPIC_KEY);
    await store.check("codex");
    database.connection.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const disk = await everythingOnDisk(dir);
    for (const secret of [OPENAI_KEY, ANTHROPIC_KEY]) {
      expect(disk).not.toContain(secret);
      expect(disk).not.toContain(Buffer.from(secret).toString("base64"));
    }
    expect(disk).toContain("box:");
    const events = database.connection.prepare("SELECT payload_json FROM orchestration_events").all();
    expect(JSON.stringify(events)).not.toMatch(/test-key-/);
    expect(existsSync(join(dir, "data", "openbot.db"))).toBe(true);
  });

  it("refuses to save when the system cannot encrypt, and saves nothing", async () => {
    const { store, dir } = await open(noBox);
    expect(() => store.set("codex", OPENAI_KEY)).toThrow(/encrypt/i);
    expect(store.list()[0]?.maskedKey).toBeNull();
    expect(await everythingOnDisk(dir)).not.toContain(OPENAI_KEY);
  });

  it("does not leak the key through an error from the box", async () => {
    const leaky: SecretBox = {
      canEncrypt: () => true,
      encrypt: (plain) => {
        throw new Error(`failed on ${plain}`);
      },
      decrypt: fakeBox.decrypt,
    };
    const { store } = await open(leaky);
    let message = "";
    try {
      store.set("codex", OPENAI_KEY);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(OPENAI_KEY);
    expect(message).not.toBe("");
  });

  it("a cipher that cannot be decrypted gives no environment variable instead of an error", async () => {
    const { store, database } = await open();
    store.set("codex", OPENAI_KEY);
    database.connection.prepare("UPDATE projection_provider_api_keys SET key_cipher = 'box:@@@'").run();
    const broken: SecretBox = {
      ...fakeBox,
      decrypt: () => {
        throw new Error("bad data");
      },
    };
    expect(new ApiKeyStore(database, broken).env("codex")).toEqual({});
  });
});

describe("ApiKeyStore.check", () => {
  it("calls the OpenAI model list with the key as a Bearer header and marks it ok", async () => {
    const calls: FetchCall[] = [];
    const { store } = await open(fakeBox, fakeFetch(200, calls));
    store.set("codex", OPENAI_KEY);
    const entry = await store.check("codex");
    expect(entry).toMatchObject({ status: "ok", checkedAt: "2026-11-16T10:00:00.000Z", maskedKey: "••••abcd" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "https://api.openai.com/v1/models", method: "GET" });
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${OPENAI_KEY}`);
    expect(store.list()[0]?.status).toBe("ok");
  });

  it("calls the Anthropic model list with x-api-key and a version header", async () => {
    const calls: FetchCall[] = [];
    const { store } = await open(fakeBox, fakeFetch(200, calls));
    store.set("claude", ANTHROPIC_KEY);
    await store.check("claude");
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/models");
    expect(calls[0]?.headers["x-api-key"]).toBe(ANTHROPIC_KEY);
    expect(calls[0]?.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it.each([401, 403])("marks a key rejected when the provider answers %i", async (status) => {
    const { store } = await open(fakeBox, fakeFetch(status));
    store.set("codex", OPENAI_KEY);
    const entry = await store.check("codex");
    expect(entry.status).toBe("rejected");
    expect(entry.message).toMatch(/rejected/i);
    expect(JSON.stringify(entry)).not.toContain(OPENAI_KEY);
    expect(store.list()[0]?.status).toBe("rejected");
  });

  it("keeps the state unchecked when the provider cannot be reached, and explains", async () => {
    const { store } = await open(fakeBox, fakeFetch(new Error(`connect failed with ${OPENAI_KEY}`)));
    store.set("codex", OPENAI_KEY);
    const entry = await store.check("codex");
    expect(entry.status).toBe("unchecked");
    expect(entry.message).toMatch(/could not reach/i);
    expect(JSON.stringify(entry)).not.toContain(OPENAI_KEY);
  });

  it("does not call it a rejection when the provider is busy (429, 500)", async () => {
    for (const status of [429, 500]) {
      const { store } = await open(fakeBox, fakeFetch(status));
      store.set("codex", OPENAI_KEY);
      const entry = await store.check("codex");
      expect(entry.status).toBe("unchecked");
      expect(entry.message).toContain(String(status));
    }
  });

  it("without a saved key there is nothing to check and no network call", async () => {
    const calls: FetchCall[] = [];
    const { store } = await open(fakeBox, fakeFetch(200, calls));
    await expect(store.check("codex")).rejects.toThrow(/no api key/i);
    expect(calls).toHaveLength(0);
  });

  it("a key replaced during the check is not marked by the old answer", async () => {
    let release: (() => void) | undefined;
    const slow: typeof fetch = Object.assign(
      async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return new Response("{}", { status: 401 });
      },
      { preconnect: () => undefined },
    );
    const { store } = await open(fakeBox, slow);
    store.set("codex", OPENAI_KEY);
    const pending = store.check("codex");
    await vi.waitFor(() => expect(release).toBeDefined());
    store.set("codex", ANTHROPIC_KEY);
    release?.();
    await pending;
    expect(store.list()[0]).toMatchObject({ status: "unchecked", maskedKey: "••••wxyz" });
  });

  it("does not follow redirects (the key must not go to another host)", async () => {
    const seen: RequestInit[] = [];
    const spy: typeof fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init ?? {});
        return new Response("{}", { status: 200 });
      },
      { preconnect: () => undefined },
    );
    const { store } = await open(fakeBox, spy);
    store.set("codex", OPENAI_KEY);
    await store.check("codex");
    expect(seen[0]?.redirect).toBe("error");
  });
});

describe("logs and process environment", () => {
  it("no console output carries the key through save, check, error and remove", async () => {
    const lines: string[] = [];
    for (const name of ["log", "info", "warn", "error", "debug"] as const)
      vi.spyOn(console, name).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    const { store } = await open(fakeBox, fakeFetch(new Error(`boom ${OPENAI_KEY}`)));
    store.set("codex", OPENAI_KEY);
    await store.check("codex");
    store.remove("codex");
    expect(lines.join("\n")).not.toContain(OPENAI_KEY);
  });

  it("the registry gives the environment of one provider and never touches process.env", async () => {
    const { store } = await open();
    store.set("codex", OPENAI_KEY);
    setApiKeySource(store);
    expect(apiKeyEnv("codex")).toEqual({ OPENAI_API_KEY: OPENAI_KEY });
    expect(apiKeyEnv("claude")).toEqual({});
    expect(process.env.OPENAI_API_KEY).not.toBe(OPENAI_KEY);
  });

  it("without a registered store the environment is empty", () => {
    expect(apiKeyEnv("codex")).toEqual({});
    expect(redactApiKeys("hello")).toBe("hello");
  });

  it("redacts every saved key from a text (diagnostics, error messages)", async () => {
    const { store } = await open();
    store.set("codex", OPENAI_KEY);
    store.set("claude", ANTHROPIC_KEY);
    setApiKeySource(store);
    const text = `Incorrect API key provided: ${OPENAI_KEY}; also ${ANTHROPIC_KEY} and ${OPENAI_KEY}`;
    const clean = redactApiKeys(text);
    expect(clean).not.toContain(OPENAI_KEY);
    expect(clean).not.toContain(ANTHROPIC_KEY);
    expect(clean).toContain("[redacted]");
  });
});
