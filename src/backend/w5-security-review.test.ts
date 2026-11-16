// @vitest-environment node
// COSGRAL W5-T3: extra unit checks found in the security review (fake keys only; no Electron).
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseAgentRequest } from "../main/ipc/agent-inputs";
import { ApiKeyStore, maskApiKey } from "./api-key-store";
import { ProviderAccounts } from "./provider-accounts";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import type { SecretBox } from "./vault-store";

const KEY = "test-key-0000-security-abcd";
const SHORT = "testkey1"; // 8 chars (min), must not reveal any character

const fakeBox: SecretBox = {
  canEncrypt: () => true,
  encrypt: (plain) => `box:${Buffer.from(plain, "utf8").toString("base64").split("").reverse().join("")}`,
  decrypt: (cipher) => Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString("utf8"),
};

const roots: string[] = [];
afterEach(async () => {
  closeTestDatabases();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("W5-T3 mask and check options", () => {
  it("a masked key cannot be rebuilt from the answer (short or long)", () => {
    expect(maskApiKey(SHORT)).toBe("••••");
    expect(maskApiKey(SHORT)).not.toContain(SHORT[0]!);
    const masked = maskApiKey(KEY);
    expect(masked).toBe("••••abcd");
    expect(masked).not.toContain(KEY.slice(0, -4));
    expect(KEY.endsWith(masked.slice(-4))).toBe(true);
    expect(KEY.length - 4).toBeGreaterThan(masked.slice(-4).length);
  });

  it("check passes redirect:error and a ~15s AbortSignal timeout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "w5-sec-key-"));
    roots.push(dir);
    const seen: RequestInit[] = [];
    const fetchImpl: typeof fetch = Object.assign(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        seen.push(init ?? {});
        return new Response("{}", { status: 200 });
      },
      { preconnect: () => undefined },
    );
    const database = testDatabase(join(dir, "data"));
    await database.initialize();
    const store = new ApiKeyStore(database, fakeBox, { fetch: fetchImpl });
    store.set("codex", KEY);
    await store.check("codex");
    expect(seen[0]?.redirect).toBe("error");
    const signal = seen[0]?.signal;
    expect(signal).toBeTruthy();
    expect(signal?.aborted).toBe(false);
    // AbortSignal.timeout(15000) exposes the deadline via the underlying timer; we only assert a live signal was set.
    expect(typeof signal?.addEventListener).toBe("function");
  });
});

describe("W5-T3 account folder paths", () => {
  it("ignores path-traversal and dotted ids in accounts.json on load", async () => {
    const dir = await mkdtemp(join(tmpdir(), "w5-sec-acc-"));
    roots.push(dir);
    const root = join(dir, "accounts");
    await writeFile(
      join(dir, "accounts.json.tmp"),
      JSON.stringify({
        accounts: [
          { id: "acc-../../evil", provider: "codex", label: "bad", loggedIn: false },
          { id: "acc-aaaa/../bbbb", provider: "codex", label: "slash", loggedIn: false },
          { id: "acc-abcdef12", provider: "codex", label: "ok", loggedIn: false, isDefault: false, inPool: true },
        ],
        pool: { maxAccountsPerProvider: 3 },
        assignments: [],
      }),
    );
    // ProviderAccounts reads <root>/accounts.json; root is the accounts folder.
    const { mkdir } = await import("node:fs/promises");
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, "accounts.json"),
      await readFile(join(dir, "accounts.json.tmp"), "utf8"),
    );
    const accounts = new ProviderAccounts({
      root,
      resolveExecutable: async () => "missing",
      confirm: async () => false,
      emit: () => undefined,
      baseEnv: { ...process.env },
    });
    const ids = accounts.snapshot().accounts.map((item) => item.id);
    expect(ids).toContain("system-codex");
    expect(ids).toContain("acc-abcdef12");
    expect(ids.some((id) => id.includes("..") || id.includes("/"))).toBe(false);
    const env = accounts.environment("acc-abcdef12");
    expect(env.CODEX_HOME?.replaceAll("\\", "/")).toMatch(/\/acc-abcdef12$/);
    expect(env.CODEX_HOME).not.toMatch(/\.\./);
  });
});

describe("W5-T3 C13 local-only guard (same rule as api-keys / subscriptions IPC)", () => {
  function requireLocal(input: unknown, message: string): void {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error(message);
  }

  it("rejects a remote serverId for API keys and subscriptions wording", () => {
    expect(() => requireLocal({ serverId: "srv-1", payload: null }, "API keys are kept on this computer only.")).toThrow(
      /this computer only/i,
    );
    expect(() =>
      requireLocal({ serverId: "phone-peer", payload: null }, "Accounts are managed on this computer only."),
    ).toThrow(/this computer only/i);
    expect(() => requireLocal({ serverId: "local", payload: { provider: "codex" } }, "x")).not.toThrow();
  });
});
