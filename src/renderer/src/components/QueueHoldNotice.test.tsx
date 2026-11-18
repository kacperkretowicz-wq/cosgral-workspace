import { QUEUE_HOLD_REASONS, type QueueSnapshot } from "@openbot/contracts/ipc";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { QueueHoldNotice } from "./QueueHoldNotice";

afterEach(cleanup);

const queue = (patch: Partial<QueueSnapshot>): QueueSnapshot => ({
  botId: "chief",
  paused: false,
  deliveries: [],
  ...patch,
});

it("shows nothing when the queue is not held", () => {
  render(() => <QueueHoldNotice queue={queue({})} />);
  expect(screen.queryByRole("status")).toBeNull();
  render(() => <QueueHoldNotice queue={undefined} />);
  expect(screen.queryByRole("status")).toBeNull();
});

it("offers the budget settings for a budget hold, also from an older server that sends no kind", () => {
  const open = vi.fn();
  render(() => (
    <QueueHoldNotice
      queue={queue({ heldReason: "The daily budget is used up.", heldKind: "budget" })}
      onOpenBudget={open}
    />
  ));
  expect(screen.getByRole("status").textContent).toContain("The daily budget is used up.");
  fireEvent.click(screen.getByRole("button", { name: "Review budget settings" }));
  expect(open).toHaveBeenCalledTimes(1);
  cleanup();
  render(() => <QueueHoldNotice queue={queue({ heldReason: "A budget is used up." })} onOpenBudget={open} />);
  expect(screen.getByRole("button", { name: "Review budget settings" })).toBeTruthy();
});

it("shows the sentence alone, without the budget button, for restart, server and thread limit", () => {
  for (const kind of ["agent-restart", "server-busy", "thread-limit"] as const) {
    render(() => <QueueHoldNotice queue={queue({ heldReason: QUEUE_HOLD_REASONS[kind], heldKind: kind })} />);
    const notice = screen.getByRole("status");
    expect(notice.getAttribute("data-hold-kind")).toBe(kind);
    expect(notice.textContent).toContain(QUEUE_HOLD_REASONS[kind]);
    expect(screen.queryByRole("button", { name: "Review budget settings" })).toBeNull();
    cleanup();
  }
});
