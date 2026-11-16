// COSGRAL W5-G3: the installed program is UPDATED by running a newer installer over it. This checks that the update
// leaves the person's data alone: the downloaded agent CLIs (same files, same SHA-256), the settings and the agents.
//
// Two runs around the update, on the same sandbox profile (a copy of an earlier profile of scripts/sandbox-installed.ts,
// which has the Codex and Claude CLIs downloaded and the first agent set up):
//
//   COSGRAL_PHASE=before COSGRAL_SANDBOX_ROOT=<folder> node scripts/sandbox-update.ts
//   "dist\COSGRAL Workspace-<version>-x64.exe" /S              (the new installer, over the old program)
//   COSGRAL_PHASE=after  COSGRAL_SANDBOX_ROOT=<folder> node scripts/sandbox-update.ts
//
// `before` only reads the files of the profile and of the installed program (no program is started). `after` starts the
// updated program with the same profile and compares. No account is signed in, no message goes to a model, no CLI is
// downloaded (a download card here would be a failure), nothing of the person's own profile is read or written.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { type DynamicRecord, isDynamicRecord, isString } from "@openbot/contracts/runtime-values";
import { chromium, type Page } from "playwright";

interface Result {
  row: string;
  name: string;
  ok: boolean;
  detail: string;
}

const results: Result[] = [];
let resultsFile = "";

const asRecord = (value: unknown): DynamicRecord => (isDynamicRecord(value) ? value : {});
const list = (value: unknown): DynamicRecord[] => (Array.isArray(value) ? value.map(asRecord) : []);

async function row(id: string, name: string, work: () => Promise<string>): Promise<void> {
  try {
    const detail = await work();
    results.push({ row: id, name, ok: true, detail });
    console.log(`ok   [${id}] ${name}: ${detail.slice(0, 160)}`);
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error)).split("\n").slice(0, 4).join(" | ");
    results.push({ row: id, name, ok: false, detail: detail.slice(0, 600) });
    console.log(`FAIL [${id}] ${name}: ${detail.slice(0, 220)}`);
  }
  if (resultsFile) await writeFile(resultsFile, JSON.stringify({ results }, null, 2));
}

function sha256(file: string): Promise<string> {
  return new Promise((done, fail) => {
    const hash = createHash("sha256");
    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => done(hash.digest("hex")))
      .on("error", fail);
  });
}

async function walk(folder: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

/** What the update must not change: every file under cli/ (size and SHA-256) and the small settings files (content). */
async function dataSnapshot(dataDir: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  const cliDir = join(dataDir, "cli");
  if (existsSync(cliDir)) {
    for (const file of await walk(cliDir)) {
      const info = await stat(file);
      snapshot[relative(dataDir, file)] = `${info.size}:${await sha256(file)}`;
    }
  }
  for (const name of ["cosgral-local-owner-v1.json", "openbot-setup-v2.json", join("accounts", "accounts.json")]) {
    const file = join(dataDir, name);
    if (existsSync(file)) snapshot[name] = `${(await stat(file)).size}:${await sha256(file)}`;
  }
  return snapshot;
}

/** The installed program: the application archive and the executable, so a changed build is visible. */
async function programSnapshot(installDir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of [join("resources", "app.asar"), "COSGRAL Workspace.exe"]) {
    const file = join(installDir, name);
    if (existsSync(file)) out[name] = `${(await stat(file)).size}:${await sha256(file)}`;
  }
  return out;
}

async function main(): Promise<void> {
  const phase = process.env.COSGRAL_PHASE;
  assert(phase === "before" || phase === "after", "COSGRAL_PHASE must be before or after");
  const rootInput = process.env.COSGRAL_SANDBOX_ROOT;
  assert(rootInput, "COSGRAL_SANDBOX_ROOT must point to the sandbox profile folder");
  const root = resolve(rootInput);
  const home = join(root, "home");
  const dataDir = join(home, "AppData", "Roaming", "COSGRAL Workspace");
  const evidence = join(root, "evidence");
  await mkdir(evidence, { recursive: true });
  resultsFile = join(evidence, `update-${phase}.json`);
  const installDir = join(process.env.LOCALAPPDATA ?? "", "Programs", "cosgral-workspace");
  const exe = join(installDir, "COSGRAL Workspace.exe");
  const beforeFile = join(evidence, "update-before-state.json");

  if (phase === "before") {
    await row("U01", "the profile has CLIs and setup data to protect; the installed program is recorded", async () => {
      assert(existsSync(dataDir), "the profile has data (copy an earlier installed-program profile here)");
      assert(existsSync(exe), "the program is installed");
      const data = await dataSnapshot(dataDir);
      const program = await programSnapshot(installDir);
      const cliFiles = Object.keys(data).filter((name) => name.startsWith("cli"));
      assert(cliFiles.length > 0, "at least one downloaded CLI file");
      await writeFile(beforeFile, JSON.stringify({ data, program }, null, 2));
      return `${cliFiles.length} CLI files and ${Object.keys(data).length - cliFiles.length} settings files recorded; program archive ${program[join("resources", "app.asar")]?.slice(-12)}`;
    });
    console.log(results.every((result) => result.ok) ? "before: recorded" : "before: FAILED");
    process.exit(results.every((result) => result.ok) ? 0 : 1);
  }

  const saved = asRecord(JSON.parse(await readFile(beforeFile, "utf8")));
  const strings = (value: unknown): Record<string, string> =>
    Object.fromEntries(
      Object.entries(asRecord(value)).flatMap(([key, entry]) => (isString(entry) ? [[key, entry]] : [])),
    );
  const recorded = { data: strings(saved.data), program: strings(saved.program) };
  await row("U02", "the installer replaced the program (a different build), still per user", async () => {
    const program = await programSnapshot(installDir);
    const asar = join("resources", "app.asar");
    assert(program[asar] !== undefined && recorded.program[asar] !== undefined, "the archive exists before and after");
    assert(installDir.toLowerCase().includes(join("appdata", "local", "programs")), "still the per-user folder");
    const changed = program[asar] !== recorded.program[asar];
    return changed
      ? `application archive changed (${recorded.program[asar]?.slice(-10)} > ${program[asar]?.slice(-10)})`
      : "SAME build as before: the update replaced the files with identical ones (valid, but then it proves less)";
  });
  await row("U03", "files of the data folder: CLIs and settings are exactly as before the update", async () => {
    const now = await dataSnapshot(dataDir);
    const lost = Object.keys(recorded.data).filter((name) => now[name] === undefined);
    const changed = Object.keys(recorded.data).filter(
      (name) => now[name] !== undefined && now[name] !== recorded.data[name],
    );
    assert.deepEqual(lost, [], "no file lost");
    assert.deepEqual(changed, [], "no file changed");
    return `${Object.keys(recorded.data).length} files compared by size and SHA-256 before the program is started: none lost, none changed`;
  });

  const cleanPath = (process.env.PATH ?? "")
    .split(";")
    .filter((part) => !/[\\/]\.local[\\/]bin|codex|claude/i.test(part))
    .join(";");
  const port = 9440 + Math.floor(Math.random() * 100);
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
  });
  child.unref();
  await mkdir(join(root, "tmp"), { recursive: true });
  const browser = await (async () => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        return await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      } catch {
        await new Promise((done) => setTimeout(done, 1_000));
      }
    }
    throw new Error("The updated program did not open its debugging port.");
  })();
  const consoleErrors: string[] = [];
  try {
    let page: Page | undefined;
    await row("U04", "the updated program starts straight into the main window, not into first-run setup", async () => {
      const end = Date.now() + 90_000;
      while (Date.now() < end && !page) {
        page = browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => /^openbot-app:/.test(candidate.url()) && !/#(dock|island)/.test(candidate.url()));
        if (!page) await new Promise((done) => setTimeout(done, 500));
      }
      assert(page, "a window of the program");
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text().slice(0, 160));
      });
      page.on("pageerror", (error) => consoleErrors.push(error.message.slice(0, 160)));
      await page.waitForLoadState("domcontentloaded");
      await new Promise((done) => setTimeout(done, 4_000));
      const firstRun = await page
        .getByRole("dialog", { name: /Where will COSGRAL Workspace run\?|Set up this computer/ })
        .count();
      assert(firstRun === 0, "no first-run dialog: the setup was kept");
      await page.screenshot({ path: join(evidence, "update-u04-main.png") });
      return `window ${page.url()}; no first-run dialog`;
    });
    assert(page, "the window");
    const window_ = page;
    const ev = (expression: string) => window_.evaluate(expression);
    await row(
      "U05",
      "the downloaded CLIs are still there and run: managed copy, same version, no download card",
      async () => {
        const states = list(await ev("window.openbot.subscriptions.listCli()"));
        const seen: string[] = [];
        for (const id of ["codex", "claude"]) {
          const state = asRecord(states.find((item) => item.id === id));
          assert(isString(state.managedVersion), `${id}: a managed version is kept (${String(state.managedVersion)})`);
          assert(state.source === "managed", `${id}: the managed copy is used (${String(state.source)})`);
          assert(
            state.error === null && state.phase === "idle",
            `${id}: idle without error (${String(state.phase)}, ${String(state.error)})`,
          );
          assert(isString(state.version) && state.version.length > 0, `${id}: it runs and reports a version`);
          assert(
            String(state.executable).startsWith(root) && existsSync(String(state.executable)),
            `${id}: file in the profile`,
          );
          seen.push(`${id} ${String(state.managedVersion)} runs (${String(state.version)})`);
        }
        const pending = list(await ev("window.openbot.agent.listPendingRequests()")).filter(
          (item) => item.kind === "draft-preview" && String(asRecord(item.card).title).startsWith("Download"),
        );
        assert(pending.length === 0, "no download card appeared");
        return seen.join("; ");
      },
    );
    await row("U06", "the agents of the profile survived the update", async () => {
      const bots = list(await ev("window.openbot.agent.listBots()"));
      assert(bots.length > 0, "the agent list is not empty");
      const conversation = asRecord(
        await ev(`window.openbot.agent.readConversation(${JSON.stringify(String(bots[0]?.id))})`),
      );
      assert(Array.isArray(conversation.messages), "the conversation of the first agent reads");
      return `${bots.length} agent(s): ${bots
        .map((bot) => String(bot.name))
        .join(", ")
        .slice(0, 80)}; the first conversation reads`;
    });
    await row("U07", "no console errors after the update", async () => {
      assert.deepEqual(consoleErrors, [], "no console errors");
      return "0 console errors";
    });
  } finally {
    await browser.close().catch(() => undefined);
    child.kill();
  }
  const failed = results.filter((result) => !result.ok);
  console.log(`${results.length - failed.length}/${results.length} ok`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
