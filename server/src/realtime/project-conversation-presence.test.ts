import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectConversationPresence } from "./project-conversation-presence.js";

function socket() { return { readyState: 1, send: vi.fn<(data: string) => void>(), close: vi.fn() }; }
const latest = (ws: ReturnType<typeof socket>) => JSON.parse(ws.send.mock.calls.at(-1)![0] as string);
afterEach(() => vi.useRealTimers());
describe("ephemeral project presence", () => {
  it("deduplicates tabs, scopes rooms and removes users only on last disconnect", async () => {
    const rooms = createProjectConversationPresence();
    const a = socket(), tab = socket(), b = socket(), other = socket();
    const join = (ws: ReturnType<typeof socket>, user: string, project = "p") => rooms.connect(ws, "c", project, user, async () => true);
    const first = join(a, "a"), second = join(tab, "a"); join(b, "b"); join(other, "outsider", "other");
    await rooms.settled();
    expect(latest(b).users.map((u: { userId: string }) => u.userId)).toEqual(["a", "b"]);
    expect(latest(other).users).toHaveLength(1);
    first.close(); await rooms.settled(); expect(latest(b).users).toHaveLength(2);
    second.close(); await rooms.settled(); expect(latest(b).users).toEqual([{ userId: "b", typingUntil: 0 }]);
  });
  it("throttles typing, ignores spoofed identities and sends a five-second expiry without persistence", async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const rooms = createProjectConversationPresence(); const a = socket(), b = socket();
    const peer = rooms.connect(a, "c", "p", "a", async () => true);
    rooms.connect(b, "c", "p", "b", async () => true); await rooms.settled();
    const before = b.send.mock.calls.length;
    peer.receive(JSON.stringify({ type: "typing", active: true, userId: "b" })); await rooms.settled();
    expect(b.send).toHaveBeenCalledTimes(before);
    vi.setSystemTime(10100); peer.receive('{"type":"typing","active":true}'); await rooms.settled();
    expect(latest(b).users[0]).toEqual({ userId: "a", typingUntil: 15100 });
    vi.setSystemTime(10400); peer.receive('{"type":"typing","active":true}'); await rooms.settled();
    expect(b.send).toHaveBeenCalledTimes(before + 1);
    vi.setSystemTime(11700); peer.receive('{"type":"typing","active":true}'); await rooms.settled();
    expect(latest(b).users[0].typingUntil).toBe(16700);
    vi.setSystemTime(11800); peer.receive('{"type":"typing","active":false}'); await rooms.settled();
    expect(latest(b).users[0].typingUntil).toBe(0);
  });
  it("fails closed for denied joins, revoked recipients and forbidden typing", async () => {
    const rooms = createProjectConversationPresence(); const a = socket(), b = socket(), denied = socket();
    let allowed = true;
    const sender = rooms.connect(a, "c", "p", "a", async typing => !typing);
    rooms.connect(b, "c", "p", "b", async () => allowed);
    rooms.connect(denied, "c", "p", "denied", async () => false); await rooms.settled();
    expect(denied.send).not.toHaveBeenCalled(); expect(denied.close).toHaveBeenCalledWith(1008, "forbidden");
    sender.receive('{"type":"typing","active":true}'); await rooms.settled();
    expect(a.close).toHaveBeenCalledWith(1008, "forbidden");
    allowed = false; sender.close(); await rooms.settled();
    expect(b.close).toHaveBeenCalledWith(1008, "forbidden");
  });
});
