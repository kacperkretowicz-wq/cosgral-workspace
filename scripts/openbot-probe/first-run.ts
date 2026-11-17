// Passes the first-run screens of OUR OWN app (started by launch-cosgral.ts with the stand-in CLI) so that `probe.ts --target cosgral`
// starts in the main window: where it runs > "Use this computer" > set up (first agent, "Continue with Codex") > the agent list.
// The app may restart itself after a step (a space is chosen): the loop connects again and acts on whatever screen it finds.
// Heavy (it drives the window): run it only after the leader's GO file, and only against the app started by launch-cosgral.ts.
//
//   node scripts/openbot-probe/first-run.ts --cdp http://127.0.0.1:9340
import { chromium, type Page } from "playwright";

const TOTAL_MS = 240_000;

/** Looks at the window once: acts on the first-run screen it sees; true when the main window (the agent list) is showing. */
async function act(page: Page): Promise<boolean> {
  if ((await page.getByRole("button", { name: /^Assistant, / }).count()) > 0) return true;
  const where = page.getByRole("dialog", { name: "Where will COSGRAL Workspace run?" });
  if (await where.isVisible().catch(() => false)) {
    console.log("step: Use this computer");
    await where.getByRole("button", { name: /Use this computer/ }).click({ timeout: 15_000 });
    return false;
  }
  const setup = page.getByRole("dialog", { name: "Set up this computer" });
  if (await setup.isVisible().catch(() => false)) {
    const button = setup.getByRole("button", { name: "Continue with Codex" });
    if (await button.isEnabled().catch(() => false)) {
      console.log("step: first agent, Continue with Codex");
      await setup
        .getByRole("combobox", { name: "First agent" })
        .selectOption({ index: 1 })
        .catch(() => undefined);
      await button.click({ timeout: 30_000 });
    }
  }
  return false;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const index = args.indexOf("--cdp");
  const cdp = index >= 0 ? (args[index + 1] ?? "") : "http://127.0.0.1:9340";
  const deadline = Date.now() + TOTAL_MS;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const browser = await chromium.connectOverCDP(cdp, { timeout: 15_000 });
      try {
        const pages = browser.contexts().flatMap((context) => context.pages());
        const page = pages.find(
          (candidate) => /^openbot-app:/.test(candidate.url()) && !/#(dock|island)/.test(candidate.url()),
        );
        if (page && (await act(page))) {
          console.log("ok   the main window is showing");
          return;
        }
      } finally {
        await browser.close().catch(() => undefined);
      }
    } catch (error) {
      lastError = error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);
    }
    await new Promise((done) => setTimeout(done, 2_000));
  }
  throw new Error(`The main window did not show in time. ${lastError}`);
}

if (process.argv[1]?.endsWith("first-run.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
