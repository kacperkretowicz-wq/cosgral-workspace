// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { QueueSnapshot } from "@openbot/contracts/ipc";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MailboxStore } from "./mailbox-store";
import { steerSupport, withSteerSupport } from "./queue-steer";
import { closeTestDatabases, testDatabase } from "./testing/databases";

describe("queue steering support (W3-KK3)", () => {
  it("is available for Codex and Claude and unavailable, with a reason, for ACP", () => {
    expect(steerSupport("codex")).toEqual({ available: true, reason: null });
    expect(steerSupport("claude")).toEqual({ available: true, reason: null });
    const acp = steerSupport("acp");
    expect(acp.available).toBe(false);
    expect(acp.reason).toMatch(/cannot take new input during a turn/);
  });

  it("adds the support to a snapshot without touching the deliveries", () => {
    const snapshot: QueueSnapshot = { botId: "chief", paused: false, deliveries: [] };
    expect(withSteerSupport(snapshot, "acp")).toMatchObject({
      botId: "chief",
      deliveries: [],
      steer: { available: false },
    });
    expect(snapshot.steer).toBeUndefined();
  });
});

describe("queue after a restart (W3-KK3)", () => {
  let root: string;
  let store: MailboxStore;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "cosgral-queue-"));
    store = createMailboxStore(join(root, "user-data"), join(root, "Shared"));
    await store.initialize();
  });
  afterEach(async () => {
    closeTestDatabases();
    await rm(root, { recursive: true, force: true });
  });

  function createMailboxStore(userDataPath: string, sharedRoot: string): MailboxStore {
    return new MailboxStore(userDataPath, sharedRoot, testDatabase(userDataPath));
  }

  async function send(text: string): Promise<string> {
    const receipt = await store.enqueue({ sender: { kind: "user" }, recipientBotIds: ["chief"], text });
    return receipt.deliveries[0]?.id ?? "";
  }

  it("keeps FIFO order, resumes from the first waiting message and never repeats the one that was running", async () => {
    const first = await send("one");
    const second = await send("two");
    const third = await send("three");
    await store.markStarting(first);
    await store.markRunning(first, "turn-1");

    // The program stops here and starts again over the same data.
    const restored = createMailboxStore(join(root, "user-data"), join(root, "Shared"));
    await restored.initialize();

    // The running one is only "unresolved": it must be reconciled, not sent again.
    expect(restored.unresolvedDeliveries().map((context) => context.delivery.id)).toEqual([first]);
    // Nothing new starts while it is unresolved (no second turn next to a possibly running one).
    expect(restored.nextQueued("chief")).toBeFalsy();
    await restored.recoverAsInterrupted(first, "restart");
    expect(restored.nextQueued("chief")?.delivery.id).toBe(second);
    expect(restored.getDelivery(first)?.delivery.status).toBe("interrupted");
    expect(restored.unresolvedDeliveries()).toEqual([]);

    // The next ones go in their order, each exactly once.
    const order: string[] = [];
    for (let next = restored.nextQueued("chief"); next; next = restored.nextQueued("chief")) {
      order.push(next.delivery.id);
      await restored.markStarting(next.delivery.id);
      await restored.markRunning(next.delivery.id, `turn-${order.length + 1}`);
      await restored.markTerminal(next.delivery.id, "completed", null);
    }
    expect(order).toEqual([second, third]);
    const ids = restored.listQueue("chief").deliveries.map((delivery) => delivery.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps a pause across a restart so the queue does not run by itself", async () => {
    await send("held");
    await store.setPaused("chief", true);
    const restored = createMailboxStore(join(root, "user-data"), join(root, "Shared"));
    await restored.initialize();
    expect(restored.listQueue("chief").paused).toBe(true);
    expect(restored.nextQueued("chief")).toBeNull();
  });
});
