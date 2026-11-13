// COSGRAL W3-BE1: Computer Use on the REAL Windows desktop, limited to a test window this script opens itself.
// It moves the real mouse and types with the real keyboard, so run it only on purpose, when nobody else uses the
// computer, with COSGRAL_ALLOW_REAL_DESKTOP=yes. The controller runs with a scope: every click must land in the test
// window (checked with WindowFromPoint) and typing needs the test window in front; anything else is refused. The test
// window stays on top and is closed at the end. Steps: bring the window to the front, click into its text box, type
// a line (checked through a file the window writes), then Stop in the middle of a long line.
import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type DynamicRecord, isDynamicRecord } from "@openbot/contracts/runtime-values";
import { WindowsComputerDriver } from "../src/backend/computer-driver-windows";
import { COMPUTER_NAMESPACE, ComputerUseController } from "../src/backend/computer-use";
import type { DynamicToolResult } from "../src/backend/protocol";

const TEST_WINDOW_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.Text = $args[0]
$form.TopMost = $true
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(120, 120)
$form.Size = New-Object System.Drawing.Size(520, 320)
$box = New-Object System.Windows.Forms.TextBox
$box.Multiline = $true
$box.Dock = 'Fill'
$out = $args[1]
$box.Add_TextChanged({ [System.IO.File]::WriteAllText($out, $box.Text) })
$form.Controls.Add($box)
$form.Add_Shown({ [Console]::Out.WriteLine('HWND:' + $form.Handle.ToInt64()); [Console]::Out.Flush() })
[System.Windows.Forms.Application]::Run($form)
`;

async function main() {
  if (process.env.COSGRAL_ALLOW_REAL_DESKTOP !== "yes") {
    console.log("Not run: set COSGRAL_ALLOW_REAL_DESKTOP=yes to control the real desktop (test window only).");
    return;
  }
  const root = process.env.COSGRAL_COMPUTER_SANDBOX;
  assert(root, "Set COSGRAL_COMPUTER_SANDBOX to a sandbox folder");
  await mkdir(root, { recursive: true });
  const title = `COSGRAL test window ${Date.now()}`;
  const textFile = join(root, "test-window-text.txt");
  const windowScript = join(root, "test-window.ps1");
  await writeFile(windowScript, `﻿${TEST_WINDOW_SCRIPT}`, "utf8");
  const window: ChildProcess = spawn(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-STA", "-File", windowScript, title, textFile],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const handle = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The test window did not open.")), 20_000);
    window.stdout?.setEncoding("utf8");
    window.stdout?.on("data", (chunk: string) => {
      const match = /HWND:(\d+)/.exec(chunk);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  const driver = new WindowsComputerDriver({ workDir: join(root, "helper") });
  const controller = new ComputerUseController({
    // The person who sets COSGRAL_ALLOW_REAL_DESKTOP=yes gives the consent for this test.
    confirm: async () => "send",
    botName: () => "Desktop smoke",
    protectedProcessIds: () => [process.pid],
    scopeWindowHandle: handle,
    emit: () => {},
  });
  controller.useDriver(driver);
  let call = 0;
  const run = (tool: string, args: DynamicRecord = {}) =>
    controller.handleDynamicTool(
      {
        threadId: "desktop",
        turnId: "turn",
        callId: `call-${call++}`,
        namespace: COMPUTER_NAMESPACE,
        tool,
        arguments: args,
      },
      { botId: "desktop-smoke", threadId: "desktop", providerThreadId: "desktop", turnId: "turn" },
    );
  const text = (result: DynamicToolResult) =>
    result.contentItems.map((item) => (item.type === "inputText" ? item.text : "")).join("");
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    assert((await run("switch_window", { handle })).success, "The test window came to the front");
    const listed = JSON.parse(text(await run("list_windows")));
    const target =
      isDynamicRecord(listed) && Array.isArray(listed.windows)
        ? listed.windows.find((item) => isDynamicRecord(item) && item.handle === handle)
        : undefined;
    assert(isDynamicRecord(target) && isDynamicRecord(target.bounds), "The test window is listed");
    const bounds = target.bounds;
    const x = Number(bounds.x) + Math.floor(Number(bounds.width) / 2);
    const y = Number(bounds.y) + Math.floor(Number(bounds.height) / 2);
    assert((await run("click", { x, y })).success, "Clicked into the text box");
    assert((await run("type_text", { text: "Hello from COSGRAL" })).success, "Typed the line");
    await sleep(300);
    const first = await readFile(textFile, "utf8");
    assert.equal(first, "Hello from COSGRAL");

    const long = run("type_text", { text: " and more".repeat(30) });
    await sleep(150);
    controller.stop();
    const stopped = await long;
    await sleep(300);
    const second = await readFile(textFile, "utf8");
    assert.equal(stopped.success, false);
    assert.match(text(stopped), /Stopped/);
    assert(second.length < first.length + " and more".length * 30, "Stop ended typing early");
    const outside = await run("click", { x: 1, y: 1 });
    assert.equal(outside.success, false, "A point outside the test window is refused");
    const summary = {
      ok: true,
      realDesktop: true,
      testWindowOnly: true,
      typed: first,
      typedBeforeStop: second.length - first.length,
      outsideRefusal: text(outside),
    };
    await writeFile(join(root, "desktop-smoke.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await controller.close();
    window.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
