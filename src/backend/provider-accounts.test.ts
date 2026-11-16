// @vitest-environment node
// COSGRAL W5-BE2: provider accounts on a fake CLI. The account folder is a black box: the tests check only that the
// folder reached the CLI process (the fake logs CODEX_HOME / CLAUDE_CONFIG_DIR to a file outside it).
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AccountsSnapshot, ProviderAccount } from "@openbot/contracts/ipc";
import { isString } from "@openbot/contracts/runtime-values";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AccountCliRunner,
  maskAccount,
  nodeCliRunner,
  ProviderAccounts,
  readAccountStatus,
  readLoginOutput,
} from "./provider-accounts";
import { writeFakeCli } from "./testing/fake-cli";

// One fake for both CLIs. FAKE_MODE: ok (default), fail, hang, code. FAKE_LOG gets one JSON line per start.
const FAKE = String.raw`
const fs = require("node:fs"), path = require("node:path");
const args = process.argv.slice(2);
const claude = args[0] === "auth";
const home = claude ? process.env.CLAUDE_CONFIG_DIR : process.env.CODEX_HOME;
fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, home: home ?? null, pid: process.pid }) + "\n");
const marker = home ? path.join(home, "fake-signed-in") : null;
const verb = claude ? args[1] : args[0] === "login" && args[1] === "status" ? "status" : args[0];
if (verb === "status") {
  const on = marker && fs.existsSync(marker);
  if (claude) console.log(JSON.stringify(on ? { loggedIn: true, authMethod: "claude.ai", email: "person@example.com", subscriptionType: "max" } : { loggedIn: false, authMethod: "none" }));
  else console.error(on ? "Logged in using ChatGPT" : "Not logged in");
  process.exit(on ? 0 : 1);
}
if (verb === "logout") { if (marker) fs.rmSync(marker, { force: true }); process.exit(0); }
const mode = process.env.FAKE_MODE || "ok";
if (mode === "fail") { console.error("login failed"); process.exit(3); }
if (mode === "helper") require("node:child_process").spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], { stdio: "inherit" }).unref();
if (mode === "hang") { console.log("Open https://example.invalid/sign-in"); setInterval(() => {}, 1000); }
else if (mode === "code") {
  console.log("Browser didn't open? Use the url below to sign in:\nhttps://example.invalid/oauth?x=1\nPaste code here if prompted > ");
  process.stdin.once("data", (data) => {
    if (String(data).trim() === "good-code") { fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(marker, "1"); process.exit(0); }
    process.exit(2);
  });
} else {
  console.log("If your browser did not open, navigate to this URL to authenticate:\nhttps://example.invalid/oauth/authorize?c=1 code WXYZ-1234");
  setTimeout(() => { fs.mkdirSync(home, { recursive: true }); fs.writeFileSync(marker, "1"); process.exit(0); }, 100);
}
`;

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0).reverse()) await step();
});

async function setup(options: { runner?: AccountCliRunner; confirm?: boolean; loginTimeoutMs?: number } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "cosgral-accounts-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const cli = await writeFakeCli(join(dir, "bin"), "fake-cli", FAKE);
  const log = join(dir, "cli-log.jsonl");
  await writeFile(log, "");
  const env: NodeJS.ProcessEnv = { ...process.env, FAKE_LOG: log, FAKE_MODE: "ok" };
  delete env.CODEX_HOME;
  delete env.CLAUDE_CONFIG_DIR;
  const events: AccountsSnapshot[] = [];
  const confirms: string[] = [];
  const root = join(dir, "accounts");
  const make = () =>
    new ProviderAccounts({
      root,
      resolveExecutable: async () => cli,
      runner: options.runner,
      confirm: async ({ title }) => {
        confirms.push(title);
        return options.confirm ?? false;
      },
      emit: (snapshot) => events.push(snapshot),
      baseEnv: env,
      loginTimeoutMs: options.loginTimeoutMs,
    });
  const accounts = make();
  cleanup.push(async () => accounts.close());
  const starts = async () => (await readFile(log, "utf8")).split("\n").filter(Boolean).map(parseStart);
  return { dir, root, env, accounts, make, events, confirms, starts };
}

function parseStart(line: string): { args: string[]; home: string | null; pid: number } {
  const value = JSON.parse(line);
  return {
    args: Array.isArray(value.args) ? value.args.map(String) : [],
    home: isString(value.home) ? value.home : null,
    pid: Number(value.pid),
  };
}

async function until(read: () => ProviderAccount, done: (account: ProviderAccount) => boolean, ms = 15_000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const account = read();
    if (done(account)) return account;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out; last state: ${JSON.stringify(read().login)}`);
}

describe("account helpers (W5-BE2)", () => {
  it("masks e-mails and names, never returning them whole", () => {
    expect(maskAccount("person@example.com")).toBe("p***@e***.com");
    expect(maskAccount("Kacper")).toBe("K***");
    expect(maskAccount("a@b")).toBe("a***@b***");
  });

  it("reads the sign-in page, a device code and the code prompt from CLI output", () => {
    expect(readLoginOutput("navigate to this URL:\nhttps://auth.example/x?y=1).\n")).toMatchObject({
      url: "https://auth.example/x?y=1",
      codeRequired: false,
    });
    expect(readLoginOutput("Enter this one-time code ABCD-12345").userCode).toBe("ABCD-12345");
    expect(readLoginOutput("Paste code here if prompted >").codeRequired).toBe(true);
    expect(readLoginOutput("http://localhost:1455 only").url).toBeNull();
  });

  it("reads status without keeping the e-mail", () => {
    expect(
      readAccountStatus("claude", {
        code: 0,
        output: '{"loggedIn":true,"email":"person@example.com","subscriptionType":"max"}',
      }),
    ).toEqual({ loggedIn: true, account: "p***@e***.com", plan: "max" });
    expect(readAccountStatus("claude", { code: 1, output: '{"loggedIn":false}' }).loggedIn).toBe(false);
    expect(readAccountStatus("codex", { code: 0, output: "Logged in using ChatGPT" })).toEqual({
      loggedIn: true,
      account: null,
      plan: "ChatGPT",
    });
    expect(readAccountStatus("codex", { code: 1, output: "Not logged in" }).loggedIn).toBe(false);
  });
});

describe("provider accounts engine (W5-BE2)", () => {
  it("keeps the system account as the untouchable default", async () => {
    const { accounts, starts } = await setup();
    const system = accounts.account("system-codex");
    expect(system).toMatchObject({ system: true, isDefault: true, stateDir: "System (~/.codex)", inPool: true });
    await expect(accounts.logout("system-codex")).rejects.toThrow(/stays/);
    await expect(accounts.login("system-claude")).rejects.toThrow(/managed by the CLI/);
    await expect(accounts.remove("system-codex")).rejects.toThrow(/cannot be removed/);
    await expect(accounts.openLoginTerminal("system-codex")).rejects.toThrow(/managed by the CLI/);
    expect(accounts.environment("system-codex").CODEX_HOME).toBeUndefined();
    expect(await starts()).toEqual([]); // no CLI ran for it
    await accounts.refresh("system-codex"); // status only: the CLI's own folder, nothing passed
    expect((await starts())[0]).toMatchObject({ args: ["login", "status"], home: null });
  });

  it("gives a new account its own folder, passed to the CLI only as CODEX_HOME / CLAUDE_CONFIG_DIR", async () => {
    const { accounts, root, starts } = await setup();
    const codex = await accounts.add("codex", "Work");
    const claude = await accounts.add("claude", "Home");
    expect(codex).toMatchObject({ loggedIn: false, system: false, stateDir: codex.id, poolOrder: 2, isDefault: false });
    expect(existsSync(join(root, codex.id))).toBe(true);
    expect(accounts.environment(codex.id).CODEX_HOME).toBe(join(root, codex.id));
    expect(accounts.environment(claude.id).CLAUDE_CONFIG_DIR).toBe(join(root, claude.id));
    await accounts.refresh(claude.id);
    expect((await starts()).at(-1)).toEqual(
      expect.objectContaining({ args: ["auth", "status", "--json"], home: join(root, claude.id) }),
    );
  });

  it("enforces the account limit per provider (default 3, changeable)", async () => {
    const { accounts } = await setup();
    expect(accounts.pool()).toEqual({ maxAccountsPerProvider: 3, switchBeforeFirstAction: true });
    await accounts.add("claude", "One");
    await accounts.add("claude", "Two");
    await expect(accounts.add("claude", "Three")).rejects.toThrow(/limit is 3/);
    await accounts.add("codex", "Codex is counted apart");
    await accounts.setPoolSettings(2);
    expect(accounts.snapshot().accounts.filter((item) => item.provider === "claude")).toHaveLength(3);
    await accounts.setPoolSettings(4);
    await accounts.add("claude", "Three");
  });

  it("signs in through the CLI's browser flow, shows the page, signs out, and the state survives a restart", async () => {
    const { accounts, root, make, starts } = await setup();
    const codex = await accounts.add("codex", "Work");
    const started = await accounts.login(codex.id);
    expect(started.login.phase).toBe("waiting-for-browser");
    const done = await until(
      () => accounts.account(codex.id),
      (item) => item.login.phase === "success",
    );
    expect(done).toMatchObject({ loggedIn: true, plan: "ChatGPT" });
    const seen = (await starts()).find((item) => item.args[0] === "login" && item.args.length === 1);
    expect(seen?.home).toBe(join(root, codex.id));
    expect(make().account(codex.id)).toMatchObject({ loggedIn: true, plan: "ChatGPT" });

    const out = await accounts.logout(codex.id);
    expect(out).toMatchObject({ loggedIn: false, login: { phase: "idle" } });
    expect((await starts()).some((item) => item.args[0] === "logout" && item.home === join(root, codex.id))).toBe(true);
  });

  it("passes a pasted code to the sign-in and never stores it or the e-mail", async () => {
    const { accounts, env, events, root } = await setup();
    env.FAKE_MODE = "code";
    const claude = await accounts.add("claude", "Home");
    await accounts.login(claude.id);
    const asking = await until(
      () => accounts.account(claude.id),
      (item) => item.login.phase === "code-required",
    );
    expect(asking.login.url).toBe("https://example.invalid/oauth?x=1");
    await accounts.submitCode(claude.id, "good-code");
    const done = await until(
      () => accounts.account(claude.id),
      (item) => item.login.phase === "success",
    );
    expect(done).toMatchObject({ loggedIn: true, account: "p***@e***.com", plan: "max" });
    const everything = JSON.stringify(events) + (await readFile(join(root, "accounts.json"), "utf8"));
    expect(everything).not.toContain("good-code");
    expect(everything).not.toContain("person@example.com");
  });

  it("finishes when the CLI exits even if a helper process keeps its output open", async () => {
    const { accounts, env } = await setup();
    env.FAKE_MODE = "helper";
    const codex = await accounts.add("codex", "Work");
    await accounts.login(codex.id);
    const done = await until(
      () => accounts.account(codex.id),
      (item) => item.login.phase !== "waiting-for-browser",
      8000,
    );
    expect(done).toMatchObject({ loggedIn: true, login: { phase: "success" } });
  });

  it("ends a failed or too long sign-in as error and stops only its own process", async () => {
    const { accounts, env, starts } = await setup({ loginTimeoutMs: 1500 });
    const claude = await accounts.add("claude", "Home");
    env.FAKE_MODE = "fail";
    await accounts.login(claude.id);
    const failed = await until(
      () => accounts.account(claude.id),
      (item) => item.login.phase === "error",
    );
    expect(failed.login.message).toMatch(/exit 3/);
    expect(failed.loggedIn).toBe(false);

    env.FAKE_MODE = "hang";
    await accounts.login(claude.id);
    const slow = await until(
      () => accounts.account(claude.id),
      (item) => item.login.phase === "error",
    );
    expect(slow.login.message).toMatch(/too long/);
    const pid = (await starts()).at(-1)?.pid ?? 0;
    const alive = async () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    for (let attempt = 0; attempt < 40 && (await alive()); attempt += 1) await new Promise((r) => setTimeout(r, 100));
    expect(await alive()).toBe(false);
    await expect(accounts.submitCode(claude.id, "x")).rejects.toThrow(/No sign-in is running/);
  });

  it("orders, enables and picks the default in the pool; removing the default falls back to the system account", async () => {
    const { accounts } = await setup();
    const a = await accounts.add("codex", "A");
    const b = await accounts.add("codex", "B");
    let snapshot = await accounts.setPool({ id: b.id, inPool: true, poolOrder: 1 });
    const order = () =>
      snapshot.accounts.filter((item) => item.provider === "codex").map((item) => `${item.label}:${item.poolOrder}`);
    expect(order()).toEqual(["B:1", "Codex (this computer):2", "A:3"]);
    snapshot = await accounts.setPool({ id: a.id, inPool: false, enabled: false, isDefault: true });
    const codexDefaults = snapshot.accounts.filter((item) => item.provider === "codex" && item.isDefault);
    expect(codexDefaults.map((item) => item.id)).toEqual([a.id]);
    expect(snapshot.accounts.find((item) => item.id === a.id)).toMatchObject({ inPool: false, enabled: false });
    await accounts.assign("bot-1", a.id);
    snapshot = await accounts.remove(a.id);
    expect(snapshot.accounts.find((item) => item.id === "system-codex")?.isDefault).toBe(true);
    expect(snapshot.assignments).toEqual([]);
    expect(order()).toEqual(["B:1", "Codex (this computer):2"]);
  });

  it.runIf(process.platform === "win32")(
    "removes only the account's own folder, never what a link points to",
    async () => {
      const { accounts, root, dir } = await setup();
      const outside = join(dir, "outside");
      await mkdir(outside, { recursive: true });
      await writeFile(join(outside, "keep.txt"), "keep me");
      const a = await accounts.add("codex", "Linked inside");
      await symlink(outside, join(root, a.id, "link"), "junction");
      await accounts.remove(a.id);
      expect(existsSync(join(root, a.id))).toBe(false);
      expect(await readFile(join(outside, "keep.txt"), "utf8")).toBe("keep me");

      const b = await accounts.add("codex", "Folder is a link");
      await rm(join(root, b.id), { recursive: true });
      await symlink(outside, join(root, b.id), "junction");
      await accounts.remove(b.id);
      expect(existsSync(join(root, b.id))).toBe(false);
      expect(await readFile(join(outside, "keep.txt"), "utf8")).toBe("keep me");
    },
  );

  it("the runner answers when the CLI exits, even if a helper keeps the output open", async () => {
    const script = `require("node:child_process").spawn(process.execPath, ["-e", "setTimeout(() => {}, 15000)"], { stdio: ["ignore", "inherit", "inherit"], detached: true }).unref(); console.log("Logged in using ChatGPT");`;
    const started = Date.now();
    const result = await nodeCliRunner.run(process.execPath, ["-e", script], { ...process.env }, 12_000);
    expect(result.code).toBe(0);
    expect(result.output).toContain("Logged in using ChatGPT");
    expect(Date.now() - started).toBeLessThan(6000);
    const exits: (number | null)[] = [];
    const login = nodeCliRunner.start(process.execPath, ["-e", script], { ...process.env });
    login.onExit((code) => exits.push(code));
    const waited = Date.now();
    while (exits.length === 0 && Date.now() - waited < 6000) await new Promise((r) => setTimeout(r, 25));
    expect(exits).toEqual([0]);
  }, 20_000);

  it("opens a terminal for sign-in only after a yes (workaround R2)", async () => {
    const opened: NodeJS.ProcessEnv[] = [];
    const runner: AccountCliRunner = {
      ...nodeCliRunner,
      openTerminal: async (_exe, _args, env) => void opened.push(env),
    };
    const declined = await setup({ runner, confirm: false });
    const a = await declined.accounts.add("codex", "Work");
    await declined.accounts.openLoginTerminal(a.id);
    expect(declined.confirms).toEqual(["Open a terminal to sign in to Codex?"]);
    expect(opened).toEqual([]);

    const allowed = await setup({ runner, confirm: true });
    const b = await allowed.accounts.add("codex", "Work");
    const state = await allowed.accounts.openLoginTerminal(b.id);
    expect(opened[0]?.CODEX_HOME).toBe(join(allowed.root, b.id));
    expect(state.login).toMatchObject({ phase: "waiting-for-browser" });
  });
});
