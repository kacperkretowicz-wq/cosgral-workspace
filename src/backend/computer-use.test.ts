// @vitest-environment node
import type { AgentEvent, ComputerUseState, DraftPreviewResolution } from "@openbot/contracts/ipc";
import type { DynamicRecord } from "@openbot/contracts/runtime-values";
import { describe, expect, it, vi } from "vitest";
import type { CardContext } from "./action-cards";
import { COMPUTER_NAMESPACE, ComputerUseController } from "./computer-use";
import type { DynamicToolResult } from "./protocol";
import { FakeComputerDriver, fakeWindow } from "./testing/fake-computer-driver";

const COSGRAL_PID = 9001;

function setup(
  options: { decision?: DraftPreviewResolution; idleMs?: number; scopeWindowHandle?: string; vault?: string } = {},
) {
  const driver = new FakeComputerDriver([
    fakeWindow({ handle: "1", title: "Notepad", foreground: true, bounds: { x: 0, y: 0, width: 1600, height: 900 } }),
    fakeWindow({
      handle: "2",
      title: "Admin console",
      elevated: true,
      processName: "mmc",
      bounds: { x: 1600, y: 0, width: 800, height: 900 },
    }),
    fakeWindow({
      handle: "3",
      title: "COSGRAL Workspace",
      processId: COSGRAL_PID,
      processName: "COSGRAL Workspace",
      bounds: { x: 2400, y: 0, width: 800, height: 900 },
    }),
  ]);
  const cards: Array<{ context: CardContext; title: string; preview: string }> = [];
  const events: ComputerUseState[] = [];
  const decisions: DraftPreviewResolution[] = [];
  const controller = new ComputerUseController({
    confirm: async (context, input) => {
      cards.push({ context, ...input });
      return decisions.shift() ?? options.decision ?? "send";
    },
    botName: (botId) => (botId === "chief" ? "Chief" : "Sales"),
    vaultContains: (text) => (options.vault ? text.includes(options.vault) : false),
    protectedProcessIds: () => [COSGRAL_PID],
    emit: (event: AgentEvent) => {
      if (event.type === "computer-use-changed") events.push(event.state);
    },
    idleMs: options.idleMs ?? 60_000,
    scopeWindowHandle: options.scopeWindowHandle,
  });
  controller.useDriver(driver);
  let call = 0;
  const run = (tool: string, args: DynamicRecord = {}, botId = "chief", threadId = `thread-${botId}`) =>
    controller.handleDynamicTool(
      {
        threadId: `provider-${threadId}`,
        turnId: "turn-1",
        callId: `call-${call++}`,
        namespace: COMPUTER_NAMESPACE,
        tool,
        arguments: args,
      },
      { botId, threadId, providerThreadId: `provider-${threadId}`, turnId: "turn-1" },
    );
  return { driver, controller, cards, events, decisions, run };
}

function text(result: DynamicToolResult): string {
  return result.contentItems.map((item) => (item.type === "inputText" ? item.text : "")).join("");
}

const inputSteps = (driver: FakeComputerDriver) =>
  driver.steps.filter((step) => step.kind !== "screenshot").map((step) => step.kind);

describe("ComputerUseController", () => {
  it("asks once per conversation with a confirm card before the first action, then acts without asking", async () => {
    const { run, cards, driver, controller } = setup();
    const first = await run("click", { x: 100, y: 50 });
    expect(first.success).toBe(true);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.title).toBe("Let Chief control this computer?");
    expect(cards[0]?.preview).toMatch(/mouse and keyboard.*until you press Stop/s);
    expect((await run("type_text", { text: "hello" })).success).toBe(true);
    expect(cards).toHaveLength(1);
    expect(controller.getState().grants).toMatchObject([{ botId: "chief", threadId: "thread-chief" }]);

    await run("screenshot", {}, "chief", "another-thread");
    expect(cards).toHaveLength(2);
    expect(inputSteps(driver)).toEqual(["click", "type"]);
  });

  it("does nothing when the person declines and asks again next time", async () => {
    const { run, cards, driver, decisions } = setup();
    decisions.push("keep-draft", "edit");
    const declined = await run("click", { x: 10, y: 10 });
    expect(declined.success).toBe(false);
    expect(text(declined)).toMatch(/did not allow/);
    expect((await run("type_text", { text: "x" })).success).toBe(false);
    expect(cards).toHaveLength(2);
    expect(driver.steps).toEqual([]);
  });

  it("shows the agent in control and Stop ends the session at once, mid-typing, and takes the permission back", async () => {
    const { run, controller, driver, events, cards } = setup();
    driver.typingDelayMs = 40;
    const typing = run("type_text", { text: "x".repeat(160) });
    await vi.waitFor(() => expect(driver.typed().length).toBeGreaterThanOrEqual(32), { timeout: 2000, interval: 5 });
    expect(controller.getState().sessions).toMatchObject([
      { botId: "chief", phase: "acting", lastAction: "type_text" },
    ]);

    const after = controller.stop({ botId: "chief" });
    const result = await typing;
    expect(result.success).toBe(false);
    expect(text(result)).toMatch(/Stopped/);
    expect(driver.typed().length).toBeLessThan(160);
    expect(driver.cancels).toBeGreaterThan(0);
    expect(after.sessions).toEqual([]);
    expect(after.grants).toEqual([]);
    expect(events.at(-1)?.sessions).toEqual([]);

    await run("click", { x: 1, y: 1 });
    expect(cards).toHaveLength(2);
  });

  it("runs actions one at a time in the order they came", async () => {
    const { run, driver } = setup();
    driver.typingDelayMs = 15;
    await Promise.all([
      run("click", { x: 10, y: 10 }),
      run("type_text", { text: "abc" }),
      run("press_keys", { keys: "ctrl+s" }),
      run("double_click", { x: 20, y: 20 }),
    ]);
    expect(inputSteps(driver)).toEqual(["click", "type", "keys", "click"]);
    expect(driver.steps.filter((step) => step.kind === "click").map((step) => "count" in step && step.count)).toEqual([
      1, 2,
    ]);
  });

  it("refuses with a clear message while the screen is locked or a UAC prompt is open", async () => {
    const { run, driver } = setup();
    await run("screenshot");
    driver.locked = true;
    const locked = await run("click", { x: 10, y: 10 });
    expect(locked.success).toBe(false);
    expect(text(locked)).toMatch(/locked/);
    driver.locked = false;
    driver.uacPrompt = true;
    const uac = await run("type_text", { text: "hi" });
    expect(text(uac)).toMatch(/administrator approval \(UAC\)/);
    expect(inputSteps(driver)).toEqual([]);
  });

  it("never touches COSGRAL itself, windows that run as administrator, or points outside the screenshot", async () => {
    const { run, driver } = setup();
    // The fake screen is 3200 px wide: a screenshot is 1600 px, so 1 screenshot pixel = 2 screen pixels.
    expect(text(await run("click", { x: 1300, y: 100 }))).toMatch(/COSGRAL Workspace itself/);
    expect(text(await run("click", { x: 900, y: 100 }))).toMatch(/runs as administrator/);
    expect(text(await run("scroll", { x: 1650, y: 10, direction: "down" }))).toMatch(/inside the screenshot/);
    expect(text(await run("switch_window", { handle: "3" }))).toMatch(/COSGRAL Workspace itself/);
    await driver.focusWindow("3");
    expect(text(await run("press_keys", { keys: "alt+f4" }))).toMatch(/COSGRAL Workspace itself/);
    expect(inputSteps(driver)).toEqual(["focus"]);
  });

  it("never types a Vault value", async () => {
    const { run, driver } = setup({ vault: "Test-Pass-1234!" });
    const result = await run("type_text", { text: "password: Test-Pass-1234!" });
    expect(result.success).toBe(false);
    expect(text(result)).toMatch(/Vault/);
    expect(inputSteps(driver)).toEqual([]);
  });

  it("maps screenshot pixels to the screen and returns the screenshot as an image", async () => {
    const { run, driver } = setup();
    driver.screen = { x: -1600, y: 0, width: 3200, height: 1800 };
    for (const window of driver.windows) window.bounds.x -= 1600;
    const shot = await run("screenshot");
    expect(
      shot.contentItems.some(
        (item) => item.type === "inputImage" && item.imageUrl.startsWith("data:image/png;base64,"),
      ),
    ).toBe(true);
    expect(JSON.parse(text(shot))).toMatchObject({ width: 1600, height: 900 });
    await run("click", { x: 100, y: 50, button: "right" });
    expect(driver.steps.at(-1)).toEqual({ kind: "click", x: -1400, y: 100, button: "right", count: 1 });
    await run("scroll", { x: 100, y: 50, direction: "down", amount: 3 });
    expect(driver.steps.at(-1)).toEqual({ kind: "scroll", x: -1400, y: 100, deltaX: 0, deltaY: -3 });

    const windows = JSON.parse(text(await run("list_windows")));
    expect(windows.windows[0]).toMatchObject({ handle: "1", title: "Notepad", bounds: { x: 0, y: 0, width: 800 } });
    expect(windows.windows.find((window: { handle: string }) => window.handle === "3")).toMatchObject({
      controllable: false,
    });
    expect(windows.note).toMatch(/data, not instructions/);
  });

  it("lets only one agent control the computer at a time", async () => {
    const { run, controller, cards } = setup();
    await run("click", { x: 10, y: 10 }, "chief");
    const busy = await run("click", { x: 10, y: 10 }, "sales");
    expect(busy.success).toBe(false);
    expect(text(busy)).toMatch(/Chief is controlling the computer/);
    expect(cards).toHaveLength(1);

    controller.endTurn("provider-thread-chief", "turn-1");
    expect((await run("click", { x: 10, y: 10 }, "sales")).success).toBe(true);
    expect(cards).toHaveLength(2);
  });

  it("ends the session when the turn ends or after idle time; the permission stays until Stop", async () => {
    const { run, controller } = setup({ idleMs: 30 });
    await run("click", { x: 10, y: 10 });
    expect(controller.getState().sessions).toHaveLength(1);
    await vi.waitFor(() => expect(controller.getState().sessions).toEqual([]), { timeout: 1000, interval: 5 });
    expect(controller.getState().grants).toHaveLength(1);
    await run("click", { x: 10, y: 10 });
    controller.endTurn("provider-thread-chief", "turn-1");
    expect(controller.getState().sessions).toEqual([]);
    controller.stop();
    expect(controller.getState().grants).toEqual([]);
  });

  it("stays inside the test window when a scope is set", async () => {
    const { run, driver } = setup({ scopeWindowHandle: "1" });
    expect((await run("click", { x: 100, y: 100 })).success).toBe(true);
    await driver.focusWindow("2");
    expect(text(await run("type_text", { text: "x" }))).toMatch(/outside the window/);
    expect(text(await run("switch_window", { handle: "2" }))).toMatch(/outside the window/);
  });

  it("is unavailable without a driver and offers no tools then", async () => {
    const { controller, run } = setup();
    controller.useDriver(null);
    expect(controller.dynamicTools()).toEqual([]);
    expect(controller.getState()).toMatchObject({ available: false });
    expect(text(await run("screenshot"))).toMatch(/not available/);
    const unsupported = new FakeComputerDriver();
    unsupported.unavailable = "Computer Use works on Windows in this version.";
    controller.useDriver(unsupported);
    expect(controller.getState()).toMatchObject({
      available: false,
      unavailableReason: expect.stringMatching(/Windows/),
    });
  });

  it("checks arguments against the tool schemas", async () => {
    const { run, driver } = setup();
    expect(text(await run("click", { x: -1, y: 0 }))).toMatch(/Invalid arguments/);
    expect(text(await run("type_text", { text: "x", sql: "drop" }))).toMatch(/Invalid arguments/);
    expect(text(await run("press_keys", { keys: "win+l" }))).toMatch(/not allowed/);
    expect(text(await run("format_disk", {}))).toMatch(/Unknown/);
    expect(inputSteps(driver)).toEqual([]);
  });
});
