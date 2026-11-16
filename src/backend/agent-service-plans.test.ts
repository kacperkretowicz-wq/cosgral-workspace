// @vitest-environment node
// COSGRAL W6-BE3 (step 2): the plan card on the real AgentService (spec-w6.md 1C, W17-W22; Q8, Q9). A fake Codex proposes a
// plan from inside a held turn; the person approves or rejects; the agent reports steps; nothing is approved by silence.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent, AgentPlan, BrowserControlState, BrowserTab } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AgentService } from "./agent-service";
import { BotStore } from "./bot-store";
import { MailboxStore } from "./mailbox-store";
import { SqlitePlanStore } from "./plan-store";
import { closeTestDatabases, testDatabase } from "./testing/databases";
import { writeFakeCli } from "./testing/fake-cli";
import { notification, ThreadCli } from "./testing/thread-cli";

let root: string;
const services: AgentService[] = [];
const originalCodexPath = process.env.OPENBOT_CODEX_PATH;
const originalClaudePath = process.env.OPENBOT_CLAUDE_PATH;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "openbot-plans-"));
  process.env.OPENBOT_CODEX_PATH = await writeFakeCli(
    join(root, "Codex CLI"),
    "codex",
    `if (process.argv.includes("--version")) process.stdout.write("codex-cli 0.144.1\\n");`,
  );
  process.env.OPENBOT_CLAUDE_PATH = join(root, "missing-claude");
});

afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
  if (originalCodexPath === undefined) delete process.env.OPENBOT_CODEX_PATH;
  else process.env.OPENBOT_CODEX_PATH = originalCodexPath;
  if (originalClaudePath === undefined) delete process.env.OPENBOT_CLAUDE_PATH;
  else process.env.OPENBOT_CLAUDE_PATH = originalClaudePath;
  closeTestDatabases();
  await rm(root, { recursive: true, force: true });
});

async function fixture(cli = new ThreadCli()) {
  const userData = join(root, "user-data");
  const store = new BotStore(userData, join(root, "home"), testDatabase(userData));
  const mailbox = new MailboxStore(userData, store.sharedRoot, testDatabase(userData));
  const service = new AgentService(store, mailbox, fakeBrowser(), null, 30_000, "codex", () => cli);
  services.push(service);
  const events: AgentEvent[] = [];
  service.on("event", (event) => events.push(event));
  await service.initialize();
  await store.getOrCreate("chief");
  return { service, store, cli, events };
}

const steps = [{ title: "Read the file" }, { title: "Write the new file" }];

/** A turn the fake keeps open, so the agent can call its tools inside it. */
async function heldTurn(service: AgentService, cli: ThreadCli, text: string) {
  const before = cli.pending.length;
  cli.hold = true;
  await service.sendMessage({ botId: "chief", text });
  await waitFor(() => cli.pending.length === before + 1);
  const turn = cli.pending[cli.pending.length - 1];
  if (!turn) throw new Error("No held turn.");
  return { threadId: turn.threadId, turnId: turn.turnId };
}

function planEvents(events: AgentEvent[]): AgentPlan[] {
  return events.flatMap((event) => (event.type === "plan-changed" ? [event.plan] : []));
}

describe.sequential("the plan card on the service", {
  timeout: process.platform === "win32" ? 30_000 : 10_000,
}, () => {
  it("shows a plan in Needs you, waits, and answers the agent after Approve; then steps move to done", async () => {
    const { service, cli, events } = await fixture();
    const turn = await heldTurn(service, cli, "Migrate my config");
    cli.callTool(turn, "cosgral_cards", "propose_plan", { title: "Migrate", steps });
    await waitFor(() => planEvents(events).length === 1);
    const plan = planEvents(events)[0];
    if (!plan) throw new Error("Expected a plan.");
    expect(plan).toMatchObject({ botId: "chief", phase: "proposed", title: "Migrate", turnId: turn.turnId });
    expect(service.listPendingRequests()).toEqual([{ kind: "plan", plan }]);
    await waitFor(() => service.listActivity().find((row) => row.botId === "chief")?.kind === "waiting");
    const threads = await service.listThreads("chief");
    expect(threads.threads.find((thread) => thread.id === plan.threadId)?.needsYou).toBe(1);
    expect(cli.responses).toEqual([]);

    const approved = await service.respondToPlan({ requestId: plan.requestId, decision: "approve" });
    expect(approved.phase).toBe("approved");
    await waitFor(() => cli.responses.length === 1);
    expect(JSON.stringify(cli.responses[0])).toContain('\\"decision\\":\\"approve\\"');
    expect(service.listPendingRequests()).toEqual([]);

    cli.callTool(turn, "cosgral_cards", "update_plan", { planId: plan.requestId, stepId: "s1", status: "done" });
    cli.callTool(turn, "cosgral_cards", "update_plan", { planId: plan.requestId, stepId: "s2", status: "done" });
    await waitFor(() => cli.responses.length === 3);
    const listed = await service.listPlans({ botId: "chief" });
    expect(listed.map((item) => [item.requestId, item.phase])).toEqual([[plan.requestId, "completed"]]);
    cli.finish();
  });

  it("Reject tells the agent to do none of the steps and keeps the plan", async () => {
    const { service, cli, events } = await fixture();
    const turn = await heldTurn(service, cli, "Delete the old files");
    cli.callTool(turn, "cosgral_cards", "propose_plan", { steps });
    await waitFor(() => planEvents(events).length === 1);
    const id = planEvents(events)[0]?.requestId ?? "";
    await service.respondToPlan({ requestId: id, decision: "reject" });
    await waitFor(() => cli.responses.length === 1);
    expect(JSON.stringify(cli.responses[0])).toMatch(/none of the steps/i);
    cli.callTool(turn, "cosgral_cards", "update_plan", { planId: id, stepId: "s1", status: "in-progress" });
    await waitFor(() => cli.responses.length === 2);
    expect(JSON.stringify(cli.responses[1])).toMatch(/not approved/);
    expect((await service.listPlans({ botId: "chief" }))[0]?.phase).toBe("rejected");
    cli.finish();
  });

  it("an unanswered card expires when its turn ends: nothing is approved by silence", async () => {
    const { service, cli, events } = await fixture();
    const turn = await heldTurn(service, cli, "Do a lot");
    cli.callTool(turn, "cosgral_cards", "propose_plan", { steps });
    await waitFor(() => planEvents(events).length === 1);
    const id = planEvents(events)[0]?.requestId ?? "";
    cli.finish();
    await waitFor(() => service.listPendingRequests().length === 0);
    await waitFor(() => cli.responses.length === 1);
    expect(JSON.stringify(cli.responses[0])).toContain("expired");
    expect((await service.listPlans({ botId: "chief" })).find((item) => item.requestId === id)?.phase).toBe("expired");
  });

  it("refuses an empty plan: the agent gets the reason and no card appears (W22)", async () => {
    const { service, cli, events } = await fixture();
    const turn = await heldTurn(service, cli, "Do something");
    cli.callTool(turn, "cosgral_cards", "propose_plan", { steps: [] });
    await waitFor(() => cli.responses.length === 1);
    expect(JSON.stringify(cli.responses[0])).toMatch(/at least one step/);
    expect(planEvents(events)).toEqual([]);
    expect(service.listPendingRequests()).toEqual([]);
    cli.finish();
  });

  it("keeps plans per thread: another thread has its own list and its own Needs you", async () => {
    const { service, cli, events } = await fixture();
    const turn = await heldTurn(service, cli, "Plan in A");
    cli.callTool(turn, "cosgral_cards", "propose_plan", { steps });
    await waitFor(() => planEvents(events).length === 1);
    const a = planEvents(events)[0]?.threadId ?? "";
    const b = (await service.createThread({ botId: "chief", title: "B" })).activeThreadId ?? "";
    expect(await service.listPlans({ botId: "chief" })).toEqual([]);
    expect((await service.listPlans({ botId: "chief", threadId: a })).map((item) => item.threadId)).toEqual([a]);
    const list = await service.listThreads("chief");
    expect(list.threads.find((thread) => thread.id === a)?.needsYou).toBe(1);
    expect(list.threads.find((thread) => thread.id === b)?.needsYou).toBe(0);
    cli.finish();
  });

  it("deleting a thread takes its plans with it", async () => {
    const { service, cli, events } = await fixture();
    const turn = await heldTurn(service, cli, "Plan then delete");
    cli.callTool(turn, "cosgral_cards", "propose_plan", { steps });
    await waitFor(() => planEvents(events).length === 1);
    const a = planEvents(events)[0]?.threadId ?? "";
    cli.finish();
    await waitFor(() => cli.responses.length === 1);
    await service.createThread({ botId: "chief", title: "Other" });
    await service.deleteThread({ botId: "chief", threadId: a, confirm: true });
    expect(await service.listPlans({ botId: "chief", threadId: a })).toEqual([]);
  });

  // COSGRAL W6-BE5 (review of W6-BE3, L5): Stop on a turn with a plan (W20).
  it("Stop on a turn with an approved plan ends the plan as stopped and leaves the agent idle", async () => {
    const { service, cli, events } = await fixture();
    const turn = await heldTurn(service, cli, "Do the plan");
    cli.callTool(turn, "cosgral_cards", "propose_plan", { steps });
    await waitFor(() => planEvents(events).length === 1);
    const id = planEvents(events)[0]?.requestId ?? "";
    await service.respondToPlan({ requestId: id, decision: "approve" });
    await waitFor(() => cli.responses.length === 1);
    cli.callTool(turn, "cosgral_cards", "update_plan", { planId: id, stepId: "s1", status: "in-progress" });
    await waitFor(() => cli.responses.length === 2);

    await service.interrupt("chief", turn.turnId);
    expect(cli.calls("turn/interrupt")).toHaveLength(1);
    cli.emit(
      "notification",
      notification("turn/completed", { threadId: turn.threadId, turn: { id: turn.turnId, status: "interrupted" } }),
    );
    await waitFor(() => lastPhase(events, id) === "stopped");
    // The step that was running stays as it was (the plan shows how far it got); nothing waits for the person.
    const listed = (await service.listPlans({ botId: "chief" })).find((item) => item.requestId === id);
    expect(listed?.steps.map((step) => step.status)).toEqual(["in-progress", "pending"]);
    expect(service.listPendingRequests()).toEqual([]);
    await waitFor(
      () => !["working", "waiting"].includes(service.listActivity().find((row) => row.botId === "chief")?.kind ?? ""),
    );
    // A stopped plan cannot be approved or reported on any more.
    await expect(service.respondToPlan({ requestId: id, decision: "approve" })).rejects.toThrow(/already decided/);
    cli.callTool(turn, "cosgral_cards", "update_plan", { planId: id, stepId: "s1", status: "done" });
    await waitFor(() => cli.responses.length === 3);
    expect(JSON.stringify(cli.responses[2])).toMatch(/no longer running \(stopped\)/);
  });

  it("Stop on a turn whose plan still waits for the person expires the card and tells the agent nothing is approved", async () => {
    const { service, cli, events } = await fixture();
    const turn = await heldTurn(service, cli, "Ask me first");
    cli.callTool(turn, "cosgral_cards", "propose_plan", { steps });
    await waitFor(() => planEvents(events).length === 1);
    const id = planEvents(events)[0]?.requestId ?? "";
    await service.interrupt("chief", turn.turnId);
    cli.emit(
      "notification",
      notification("turn/completed", { threadId: turn.threadId, turn: { id: turn.turnId, status: "interrupted" } }),
    );
    await waitFor(() => lastPhase(events, id) === "expired");
    await waitFor(() => cli.responses.length === 1);
    expect(JSON.stringify(cli.responses[0])).toContain("expired");
    expect(service.listPendingRequests()).toEqual([]);
  });

  // COSGRAL W6-BE5 (review of W6-BE3, restart): an open card does not come back as open after the program was killed.
  it("after a crash a plan that was open is closed at the next start: proposed expires, approved stops, none can be answered", async () => {
    const userData = join(root, "user-data");
    const database = testDatabase(userData);
    await database.initialize();
    const base: AgentPlan = {
      requestId: "plan-old-1",
      botId: "chief",
      threadId: "thread-before-crash",
      turnId: "turn-before-crash",
      title: "Before the crash",
      summary: null,
      steps: [
        { id: "s1", title: "One", detail: null, status: "done" },
        { id: "s2", title: "Two", detail: null, status: "in-progress" },
      ],
      phase: "approved",
      createdAt: "2026-11-16T10:00:00.000Z",
      decidedAt: "2026-11-16T10:00:05.000Z",
      updatedAt: "2026-11-16T10:00:06.000Z",
    };
    const plans = new SqlitePlanStore(database);
    plans.save(base);
    plans.save({
      ...base,
      requestId: "plan-old-2",
      phase: "proposed",
      decidedAt: null,
      createdAt: "2026-11-16T10:05:00.000Z",
    });
    plans.save({ ...base, requestId: "plan-old-3", phase: "completed", createdAt: "2026-11-16T09:00:00.000Z" });
    closeTestDatabases();

    const { service, events } = await fixture();
    const listed = await service.listPlans({ botId: "chief", threadId: "thread-before-crash" });
    expect(listed.map((item) => [item.requestId, item.phase])).toEqual([
      ["plan-old-2", "expired"],
      ["plan-old-1", "stopped"],
      ["plan-old-3", "completed"],
    ]);
    // The progress that was recorded is kept; the window is told; nothing is left to answer.
    expect(listed.find((item) => item.requestId === "plan-old-1")?.steps.map((step) => step.status)).toEqual([
      "done",
      "in-progress",
    ]);
    expect(
      planEvents(events)
        .map((item) => item.requestId)
        .sort(),
    ).toEqual(["plan-old-1", "plan-old-2"]);
    expect(service.listPendingRequests()).toEqual([]);
    await expect(service.respondToPlan({ requestId: "plan-old-2", decision: "approve" })).rejects.toThrow(
      /already decided/,
    );
    await expect(service.respondToPlan({ requestId: "plan-old-1", decision: "reject" })).rejects.toThrow(
      /already decided/,
    );
  });
});

/** The phase of a plan as the window last heard it. */
function lastPhase(events: AgentEvent[], requestId: string): AgentPlan["phase"] | undefined {
  return planEvents(events)
    .filter((plan) => plan.requestId === requestId)
    .at(-1)?.phase;
}

function fakeBrowser() {
  return {
    onChanged: (_listener: (tabs: BrowserTab[], activeTabId: string | null) => void) => () => undefined,
    onControlChanged: (_listener: (state: BrowserControlState) => void) => () => undefined,
    clearControls: () => undefined,
    endControl: () => undefined,
    handleDynamicTool: async () => ({ success: true, contentItems: [] }),
  };
}

async function waitFor(check: () => boolean | undefined): Promise<void> {
  const deadline = Date.now() + (process.platform === "win32" ? 10_000 : 4_000);
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the fake CLI.");
}
