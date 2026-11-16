// @vitest-environment node
// COSGRAL W8-KK2: the `budgets:*` handlers with a real meter on a temporary database and the window's trust check on.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isBudgetCsv, isBudgetOverview } from "@openbot/contracts/ipc";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BudgetMeter } from "../backend/budget-meter";
import { OpenBotDatabase } from "../backend/openbot-database";
import { registerBudgetsIpc } from "./budgets-ipc";
import { ipcRegistry } from "./trusted-ipc";

type Listener = (event: { senderFrame?: { url?: string | null } | null }, ...args: unknown[]) => unknown;
const handlers = new Map<string, Listener>();
const MAIN = "openbot-app://app/index.html";
const call = async (channel: string, payload: unknown, serverId = "local", url = MAIN) => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return handler({ senderFrame: { url } }, { serverId, payload });
};
let folder = "";
let database: OpenBotDatabase | null = null;
let meter: BudgetMeter | null = null;

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), "cosgral-budgets-ipc-"));
  database = new OpenBotDatabase(join(folder, "data"));
  await database.initialize();
  meter = new BudgetMeter({ database, emit: () => undefined, now: () => new Date("2026-11-16T12:00:00.000Z") });
  ipcRegistry.register = (channel, listener) => {
    handlers.set(channel, listener);
  };
  registerBudgetsIpc(() => meter);
});
afterAll(() => {
  database?.close();
  rmSync(folder, { recursive: true, force: true });
});

const body = {
  scope: { kind: "agent", botId: "chief" },
  period: "month",
  tokenLimit: 1000,
  costLimitUsd: null,
  hardStop: true,
};

describe("budgets IPC (W8-KK2)", () => {
  it("lists, sets, counts and clears a budget", async () => {
    expect(isBudgetOverview(await call("budgets:list", null))).toBe(true);
    const set = await call("budgets:set", body);
    expect(isBudgetOverview(set)).toBe(true);
    meter?.record({ botId: "chief", tokens: 1000, costUsd: null });
    expect(meter?.gate("chief").allowed).toBe(false);
    await call("budgets:clear", { scope: { kind: "agent", botId: "chief" } });
    expect(meter?.gate("chief").allowed).toBe(true);
  });

  it("exports a CSV as text and writes no file", async () => {
    const file = await call("budgets:export-csv", { from: "2026-11-01", to: "2026-11-30" });
    if (!isBudgetCsv(file)) throw new Error("not a budget export");
    expect(file.csv).toContain("chief");
  });

  it("refuses a bad request, another server and an untrusted page before doing anything", async () => {
    await expect(call("budgets:set", { ...body, tokenLimit: -3 })).rejects.toThrow(/token limit/);
    await expect(call("budgets:set", { ...body, hardStop: "yes" })).rejects.toThrow(/true or false/);
    await expect(call("budgets:clear", { scope: { kind: "team" } })).rejects.toThrow(/scope/);
    await expect(call("budgets:export-csv", { from: "x", to: "y" })).rejects.toThrow(/real days/);
    await expect(call("budgets:list", null, "remote-1")).rejects.toThrow(/this computer/);
    await expect(call("budgets:list", null, "local", "https://example.com/")).rejects.toThrow(/untrusted/);
  });
});
