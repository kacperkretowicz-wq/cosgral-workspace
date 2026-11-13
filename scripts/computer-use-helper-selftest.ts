// COSGRAL W3: self-test of the real Windows Computer Use helper WITHOUT touching the desktop. Dry-run mode: no mouse
// move, no click, no typing, no window activation. It checks that the C# helper compiles in Windows PowerShell 5.1,
// reads the desktop state (lock, UAC, screen size; no window titles are logged), takes an 8-pixel thumbnail (nothing
// readable) and builds the exact SendInput records for click, scroll, typing and a key combination.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import { WindowsComputerDriver } from "../src/backend/computer-driver-windows";

async function main() {
  const root = process.env.COSGRAL_COMPUTER_SANDBOX;
  assert(root, "Set COSGRAL_COMPUTER_SANDBOX to a sandbox folder");
  await mkdir(root, { recursive: true });
  const driver = new WindowsComputerDriver({ dryRun: true, workDir: join(root, "helper") });
  const started = Date.now();
  try {
    const ping = await driver.request("ping", {});
    const startMs = Date.now() - started;
    const state = await driver.state();
    const windows = await driver.listWindows();
    const thumbnail = await driver.screenshot(8);
    const centerX = state.screen.x + Math.floor(state.screen.width / 2);
    const centerY = state.screen.y + Math.floor(state.screen.height / 2);

    await driver.click(centerX, centerY, "left", 2);
    const click = driver.lastDryRun;
    await driver.scroll(centerX, centerY, 0, -3);
    const scroll = driver.lastDryRun;
    await driver.typeText("Zażółć 1\n");
    const typed = driver.lastDryRun;
    await driver.pressKeys(["ctrl", "s"]);
    const keys = driver.lastDryRun;
    let outside = "";
    try {
      await driver.click(state.screen.x + state.screen.width + 10, centerY, "left", 1);
    } catch (error) {
      outside = error instanceof Error ? error.message : String(error);
    }

    // MOVE | VIRTUALDESK | ABSOLUTE, then left down/up twice.
    assert.deepEqual(
      click.map((input) => (isDynamicRecord(input) ? input.flags : null)),
      [0x0001 | 0x4000 | 0x8000, 0x0002, 0x0004, 0x0002, 0x0004],
    );
    assert.equal(scroll.length, 2);
    assert.equal(typed.length, 18, "8 Unicode characters down/up + Enter down/up");
    assert.equal(keys.length, 4, "ctrl down, s down, s up, ctrl up");
    assert.match(outside, /outside the screen/);
    const summary = {
      ok: true,
      dryRun: true,
      inputSent: false,
      helper: ping,
      startMs,
      desktop: {
        inputDesktop: state.inputDesktop,
        locked: state.locked,
        uacPrompt: state.uacPrompt,
        screen: state.screen,
        foregroundElevated: state.foreground?.elevated ?? null,
      },
      windowCount: windows.length,
      thumbnail: { width: thumbnail.width, height: thumbnail.height, bytes: thumbnail.png.length },
      plans: { click, scroll, typed: typed.length, keys },
      refusedOutsidePoint: outside,
    };
    await writeFile(join(root, "helper-selftest.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await driver.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
