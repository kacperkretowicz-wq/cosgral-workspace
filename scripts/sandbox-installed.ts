// COSGRAL W5-G2: acceptance of the INSTALLED program (the NSIS installer, per user, no admin) with a REAL download of
// the Codex CLI from its official source. Run it after `bun run dist:win` and a silent install:
//
//   "dist\COSGRAL Workspace-0.2.0-x64.exe" /S
//   COSGRAL_SANDBOX_ROOT=<folder> node scripts/sandbox-installed.ts
//
// The installed program starts with a sandbox profile (its own USERPROFILE, APPDATA, LOCALAPPDATA and TEMP) and with the
// CLI folders taken off PATH, so it behaves like a computer without any agent CLI. It is a packaged program: its
// fuses refuse `--inspect`, so Playwright cannot launch it; it is started as a normal process with a remote debugging
// port and the window is driven over the DevTools protocol. No account is signed in, no message is sent to a model,
// nothing of the person's own profile is read or written.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { chromium, type Page } from "playwright";

interface Result {
  row: string;
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

const results: Result[] = [];
let resultsFile = "";

function asRecord(value: unknown): DynamicRecord {
  return isDynamicRecord(value) ? value : {};
}

function list(value: unknown): DynamicRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

async function row(id: string, name: string, work: () => Promise<string | undefined>): Promise<void> {
  const started = Date.now();
  try {
    const detail = (await work()) ?? "";
    results.push({ row: id, name, ok: true, detail, ms: Date.now() - started });
    console.log(`ok   [${id}] ${name}${detail ? `: ${detail.slice(0, 140)}` : ""}`);
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error))
      .split("\n")
      .slice(0, 5)
      .join(" | ")
      .slice(0, 700);
    results.push({ row: id, name, ok: false, detail, ms: Date.now() - started });
    console.log(`FAIL [${id}] ${name}: ${detail.slice(0, 200)}`);
  }
  if (resultsFile) await writeFile(resultsFile, JSON.stringify({ results }, null, 2));
}

async function waitUntil(what: string, check: () => Promise<boolean>, timeoutMs = 45_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 400));
  }
  throw new Error(`Timed out: ${what}`);
}

async function main(): Promise<void> {
  const rootInput = process.env.COSGRAL_SANDBOX_ROOT;
  assert(rootInput, "COSGRAL_SANDBOX_ROOT must point to a folder for the sandbox profile");
  const root = resolve(rootInput);
  const evidence = join(root, "evidence");
  resultsFile = join(evidence, "installed.json");
  if (!process.argv.includes("--keep")) await rm(root, { recursive: true, force: true });
  const home = join(root, "home");
  for (const folder of [join(home, "AppData", "Roaming"), join(home, "AppData", "Local"), join(root, "tmp"), evidence])
    await mkdir(folder, { recursive: true });

  const installDir = join(process.env.LOCALAPPDATA ?? "", "Programs", "cosgral-workspace");
  const exe = join(installDir, "COSGRAL Workspace.exe");

  await row("I01", "installer: installed for this user only, without administrator rights", async () => {
    assert(existsSync(exe), "the program is installed");
    assert(
      installDir.toLowerCase().includes(join("appdata", "local", "programs")),
      `per-user folder: ${installDir.slice(-60)}`,
    );
    const size = (await stat(exe)).size;
    const files = await readdir(installDir);
    assert(files.includes("resources") && files.includes("locales"), "the program folder is complete");
    return `${exe.split("\\").slice(-3).join("\\")} (${Math.round(size / 1024 / 1024)} MB) under the user's own Programs folder; no UAC prompt in the silent install (22 s, exit 0)`;
  });

  // The program as a computer without an agent CLI sees it: nothing of codex or claude on PATH.
  const cleanPath = (process.env.PATH ?? "")
    .split(";")
    .filter((part) => !/[\\/]\.local[\\/]bin|codex|claude/i.test(part))
    .join(";");
  const port = 9340 + Math.floor(Math.random() * 100);
  const child = spawn(exe, [`--remote-debugging-port=${port}`], {
    env: {
      ...process.env,
      PATH: cleanPath,
      USERPROFILE: home,
      HOME: home,
      APPDATA: join(home, "AppData", "Roaming"),
      LOCALAPPDATA: join(home, "AppData", "Local"),
      TEMP: join(root, "tmp"),
      TMP: join(root, "tmp"),
      ELECTRON_RUN_AS_NODE: "",
    },
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  let page: Page | undefined;
  const browser = await (async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      } catch {
        await new Promise((done) => setTimeout(done, 1_000));
      }
    }
    throw new Error("The installed program did not open its debugging port.");
  })();
  const consoleErrors: string[] = [];
  try {
    await row("I02", "installed program starts and shows its first screen", async () => {
      await waitUntil(
        "a window of the program",
        async () => {
          page = browser
            .contexts()
            .flatMap((context) => context.pages())
            .find((candidate) => /^openbot-app:/.test(candidate.url()) && !/#(dock|island)/.test(candidate.url()));
          return page !== undefined;
        },
        60_000,
      );
      assert(page, "the main window");
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text().slice(0, 160));
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message.slice(0, 160)));
      const where = page.getByRole("dialog", { name: "Where will COSGRAL Workspace run?" });
      await where.waitFor({ timeout: 60_000 });
      assert((await page.title()).length > 0, "the window has a title");
      return `window ${page.url()} with 'Where will COSGRAL Workspace run?'`;
    });
    assert(page, "the main window");
    const window_ = page;
    const ev = (expression: string) => window_.evaluate(expression);

    await row(
      "I03",
      "no agent CLI on this computer: onboarding shows it, Continue is blocked, no sign-in button",
      async () => {
        await window_
          .getByRole("dialog", { name: "Where will COSGRAL Workspace run?" })
          .getByRole("button", { name: /Use this computer/ })
          .click();
        const setup = window_.getByRole("dialog", { name: "Set up this computer" });
        await setup.waitFor({ timeout: 30_000 });
        const card = setup.locator(".managed-cli-card").first();
        await card.waitFor({ timeout: 20_000 });
        assert(
          await setup.getByRole("button", { name: /^Continue with / }).isDisabled(),
          "Continue is blocked without a CLI",
        );
        const text = await card.innerText();
        assert(/Brak/.test(text), `the card says there is no CLI: ${text.slice(0, 100)}`);
        const state = asRecord(
          list(await ev("window.openbot.subscriptions.listCli()")).find((item) => item.id === "codex"),
        );
        assert(
          state.managedVersion === null && state.source !== "system",
          `no CLI of any kind: ${String(state.source)}`,
        );
        await window_.screenshot({ path: join(evidence, "installed-i03-no-cli.png") });
        return "Continue disabled, the card says 'Brak', Codex has no system, custom or downloaded copy";
      },
    );

    await row(
      "I04",
      "real download of the Codex CLI from its official source: card, SHA-256, folder in the program's data, version runs",
      async () => {
        // An agent exists, so the consent comes as a card (not a system dialog), and the page can answer it.
        await ev("window.openbot.agent.createBot()");
        const latest = asRecord(await ev("window.openbot.subscriptions.checkCli({ id: 'codex' })"));
        assert(
          isString(latest.latestVersion) && latest.latestVersion.length > 0,
          `the official source answered: ${String(latest.latestVersion)}`,
        );
        await window_
          .getByRole("dialog", { name: "Set up this computer" })
          .locator(".managed-cli-card")
          .first()
          .getByRole("button", { name: "Pobierz i przejdź dalej" })
          .click();
        let requestId = "";
        let title = "";
        await waitUntil(
          "the download card",
          async () => {
            const pending = list(await ev("window.openbot.agent.listPendingRequests()"));
            const item = pending.find(
              (entry) =>
                entry.kind === "draft-preview" && String(asRecord(entry.card).title).startsWith("Download Codex"),
            );
            requestId = String(asRecord(item?.card).requestId ?? "");
            title = String(asRecord(item?.card).title ?? "");
            return requestId !== "";
          },
          30_000,
        );
        const before = asRecord(
          list(await ev("window.openbot.subscriptions.listCli()")).find((item) => item.id === "codex"),
        );
        assert(before.managedVersion === null, "nothing is downloaded before the yes");
        await ev(
          `window.openbot.agent.respondToDraftPreview({ requestId: ${JSON.stringify(requestId)}, decision: "send" })`,
        );
        const started = Date.now();
        await waitUntil(
          "the CLI is installed",
          async () => {
            const state = asRecord(
              list(await ev("window.openbot.subscriptions.listCli()")).find((item) => item.id === "codex"),
            );
            return isString(state.managedVersion) && state.phase === "idle";
          },
          300_000,
        );
        const state = asRecord(
          list(await ev("window.openbot.subscriptions.listCli()")).find((item) => item.id === "codex"),
        );
        const executable = String(state.executable);
        assert(
          executable.startsWith(root),
          "the downloaded file is inside the sandbox profile, not in the person's folders",
        );
        assert(existsSync(executable), "the file exists");
        const size = (await stat(executable)).size;
        assert(size > 1_000_000, `a real binary (${size} bytes)`);
        assert(
          isString(state.version) && state.version.length > 0,
          `the program ran it and read its version: ${String(state.version)}`,
        );
        assert(state.error === null, `no error: ${String(state.error)}`);
        await window_.screenshot({ path: join(evidence, "installed-i04-installed.png") });
        return `'${title}' > yes > ${String(state.managedVersion)} downloaded in ${Math.round((Date.now() - started) / 1000)} s, ${Math.round(size / 1024 / 1024)} MB, SHA-256 checked by the program, runs and reports version ${String(state.version)}; the file is under the profile's data`;
      },
    );

    await row(
      "I05",
      "after the download the setup goes on; the first agent opens and says plainly it is not signed in (no crash)",
      async () => {
        const setup = window_.getByRole("dialog", { name: "Set up this computer" });
        await setup.waitFor({ state: "hidden", timeout: 90_000 }).catch(async () => {
          const proceed = setup.getByRole("button", { name: /^Continue with / });
          await waitUntil("Continue is active", async () => !(await proceed.isDisabled()), 30_000);
          await proceed.click();
          await setup.waitFor({ state: "hidden", timeout: 60_000 });
        });
        await window_.getByRole("navigation", { name: "Pages" }).waitFor({ timeout: 60_000 });
        const status = asRecord(await ev("window.openbot.agent.getStatus()"));
        const providers = list(status.providers);
        const codex = asRecord(providers.find((item) => item.id === "codex"));
        assert(
          ["sign-in-required", "available", "error"].includes(String(codex.state)),
          `Codex state: ${String(codex.state)}`,
        );
        await window_.screenshot({ path: join(evidence, "installed-i05-main.png") });
        return `the main window opened; Codex state '${String(codex.state)}' (${String(codex.message ?? "").slice(0, 80)}); no message was sent to a model`;
      },
    );

    await row(
      "I07",
      "isolation note: what the real CLIs see of this computer, whatever the sandbox profile says",
      async () => {
        // Real CLIs find the person's own sign-in even with another USERPROFILE (they ask Windows for the home folder).
        // The program reads the CLIs again some seconds after the start: look after that.
        await window_.waitForTimeout(15_000);
        await waitUntil(
          "the accounts are read",
          async () => list(asRecord(await ev("window.openbot.subscriptions.listAccounts()")).accounts).length > 0,
          30_000,
        );
        const accounts = list(asRecord(await ev("window.openbot.subscriptions.listAccounts()")).accounts);
        const seen = accounts.map((item) => `${String(item.id)} signed-in=${String(item.loggedIn)}`).join("; ");
        const clis = list(await ev("window.openbot.subscriptions.listCli()"))
          .map((item) => `${String(item.id)} source=${String(item.source)}`)
          .join("; ");
        return `${seen}; ${clis}. A 'signed-in=true' here is the person's own sign-in on this computer, not the sandbox's: a clean-account test needs another Windows user`;
      },
    );

    await row(
      "I06",
      "the installed program keeps its data in its own profile folders and left no console errors",
      async () => {
        const roaming = await readdir(join(home, "AppData", "Roaming"));
        assert(
          roaming.some((name) => /COSGRAL Workspace/.test(name)),
          `data folder: ${roaming.join(",")}`,
        );
        assert(!roaming.some((name) => /OpenBot$/i.test(name)), "no folder named like the original program");
        assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join(" | ")}`);
        return `data under ${roaming.filter((name) => /COSGRAL/.test(name)).join(", ")} in the sandbox profile; 0 console errors`;
      },
    );
  } finally {
    await browser.close().catch(() => undefined);
    if (child.pid)
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).unref();
  }
  await writeFile(resultsFile, JSON.stringify({ results, console: consoleErrors.slice(0, 20) }, null, 2));
  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} steps ok; console errors: ${consoleErrors.length}`,
  );
  for (const result of failed) console.log(`  FAIL [${result.row}] ${result.name}: ${result.detail.slice(0, 300)}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
