import { describe, expect, it } from "vitest";
import { MESSAGE_REACTIONS, MORE_MESSAGE_REACTIONS } from "./ipc-conversation";
import { MESSAGE_ACTION_LIMITS, type MessageActionSubject } from "./ipc-message-actions";
import {
  buildMessageMenu,
  isMessageMenu,
  MESSAGE_MENU_ACTION_IDS,
  MESSAGE_MENU_HISTORY_THREAD_PROBLEM,
  type MessageMenuFacts,
} from "./ipc-message-menu";

const target = { botId: "chief", threadId: "t-1", messageId: "m-1" };

function facts(
  message: MessageActionSubject & { reaction?: MessageMenuFacts["message"]["reaction"] },
  patch: Partial<MessageMenuFacts> = {},
): MessageMenuFacts {
  return {
    message,
    pinned: false,
    pinCount: 0,
    threadShown: true,
    historyProblem: null,
    laterMessages: 0,
    branchRoom: true,
    ...patch,
  };
}

const person = { author: "user", source: "user", status: "completed" } as const;
const answer = { author: "assistant", status: "completed" } as const;
const byId = (menu: ReturnType<typeof buildMessageMenu>) =>
  Object.fromEntries(menu.actions.map((action) => [action.id, action]));

describe("message menu rules (W12 BE-J)", () => {
  it("lists the seven actions once each in order and offers everything but edit on an answer of the agent", () => {
    const menu = buildMessageMenu(target, facts(answer));
    expect(menu.actions.map((action) => action.id)).toEqual([...MESSAGE_MENU_ACTION_IDS]);
    expect(menu.actions.filter((action) => !action.enabled).map((action) => action.id)).toEqual(["edit"]);
    expect(menu.reactions).toEqual({ quick: [...MESSAGE_REACTIONS], more: [...MORE_MESSAGE_REACTIONS], current: null });
    expect(isMessageMenu(menu)).toBe(true);
    expect(buildMessageMenu(target, facts(person)).actions.every((action) => action.enabled)).toBe(true);
  });

  it("offers nothing on a row that is not a message, with the same reason the actions give", () => {
    const menu = buildMessageMenu(target, facts({ author: "system" }));
    expect(menu.actions.every((action) => !action.enabled && action.reason === "This row is not a message.")).toBe(
      true,
    );
    expect(isMessageMenu(menu)).toBe(true);
  });

  it("allows edit only on the person's own message, and asks for confirmation only when messages follow", () => {
    expect(byId(buildMessageMenu(target, facts(answer))).edit).toMatchObject({
      enabled: false,
      reason: "Only your own messages can be edited.",
    });
    const own = byId(buildMessageMenu(target, facts(person, { laterMessages: 0 })));
    expect(own.edit).toMatchObject({ enabled: true, needsConfirmation: false });
    expect(byId(buildMessageMenu(target, facts(person, { laterMessages: 3 }))).edit.needsConfirmation).toBe(true);
    expect(own.delete.needsConfirmation).toBe(true);
    expect(own.retry.needsConfirmation).toBe(false);
  });

  it("refuses to change history while the thread is busy, but still lets copy, react, pin and branch work", () => {
    const busy = byId(
      buildMessageMenu(
        target,
        facts(person, {
          historyProblem: "This thread is busy. Stop the agent or wait for it to finish before changing the history.",
        }),
      ),
    );
    for (const id of ["retry", "edit", "delete"] as const) expect(busy[id]).toMatchObject({ enabled: false });
    expect(busy.retry.reason).toContain("busy");
    for (const id of ["copy", "react", "pin", "branch"] as const) expect(busy[id].enabled).toBe(true);
  });

  it("refuses history changes in a thread that is not the shown one", () => {
    const other = byId(buildMessageMenu(target, facts(person, { threadShown: false })));
    expect(other.edit.reason).toBe(MESSAGE_MENU_HISTORY_THREAD_PROBLEM);
    expect(other.branch.enabled).toBe(true);
  });

  it("waits for an answer that is still streaming and for a message that is still in the queue", () => {
    const streaming = byId(buildMessageMenu(target, facts({ ...answer, status: "streaming" })));
    expect(streaming.branch.reason).toBe("Wait until the answer has finished.");
    expect(streaming.retry.enabled).toBe(false);
    const queued = byId(buildMessageMenu(target, facts({ ...person, delivery: { status: "queued" } })));
    expect(queued.branch.reason).toContain("still in the queue");
    expect(queued.edit.enabled).toBe(false);
  });

  it("marks a pinned message, lets it be unpinned when the limit is reached, and refuses a new pin then", () => {
    const pinned = byId(
      buildMessageMenu(target, facts(answer, { pinned: true, pinCount: MESSAGE_ACTION_LIMITS.pinsPerThread })),
    );
    expect(pinned.pin).toMatchObject({ enabled: true, active: true });
    const full = byId(buildMessageMenu(target, facts(answer, { pinCount: MESSAGE_ACTION_LIMITS.pinsPerThread })));
    expect(full.pin).toMatchObject({ enabled: false, active: false });
    expect(full.pin.reason).toContain("can be pinned");
  });

  it("says when an agent has no room for one more thread, and shows the reaction that is on the message", () => {
    const menu = buildMessageMenu(target, facts({ ...answer, reaction: "🎉" }, { branchRoom: false }));
    expect(byId(menu).branch).toMatchObject({ enabled: false });
    expect(byId(menu).branch.reason).toContain("threads");
    expect(menu.reactions.current).toBe("🎉");
  });

  it("refuses a menu that lacks an action, has them out of order, or is enabled with a reason", () => {
    const menu = buildMessageMenu(target, facts(answer));
    expect(isMessageMenu({ ...menu, actions: menu.actions.slice(1) })).toBe(false);
    expect(isMessageMenu({ ...menu, actions: [...menu.actions].reverse() })).toBe(false);
    const [first, ...rest] = menu.actions;
    expect(isMessageMenu({ ...menu, actions: [{ ...first, reason: "no" }, ...rest] })).toBe(false);
    expect(isMessageMenu({ ...menu, actions: [{ ...first, enabled: false, reason: null }, ...rest] })).toBe(false);
    expect(isMessageMenu({ ...menu, reactions: { ...menu.reactions, current: "x" } })).toBe(false);
  });
});
