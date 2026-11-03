// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectConversationPresence } from "./useProjectConversationPresence";

const urlMock = vi.hoisted(() => ({ secure: false }));
vi.mock("../lib/websocket-url", () => ({ buildSameOriginWebSocketUrl: (path: string) => `${urlMock.secure ? "wss" : "ws"}://localhost${path}` }));

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 1;
  send = vi.fn(); close = vi.fn();
  onmessage?: (event: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor(public url: string) { FakeSocket.instances.push(this); }
  snapshot(users = [{ userId: "b", typingUntil: 15000 }], projectId = "p") {
    this.onmessage?.({ data: JSON.stringify({ type: "project.conversation.presence", companyId: "c", projectId, users }) });
  }
}
let root: Root, host: HTMLDivElement;
let current: ReturnType<typeof useProjectConversationPresence>;
function Harness({ projectId = "p" }: { projectId?: string }) {
  current = useProjectConversationPresence("c", projectId, true);
  return <div>{current.connected ? "connected" : "offline"}:{current.users.filter(u => u.typingUntil > Date.now()).map(u => u.userId).join(",")}</div>;
}
beforeEach(() => {
  urlMock.secure = false;
  vi.useFakeTimers(); vi.setSystemTime(10000); vi.stubGlobal("WebSocket", FakeSocket); FakeSocket.instances = [];
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  act(() => root.render(<Harness />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("project presence client", () => {
  it("accepts only its project, expires typing after 5s and keeps presence", async () => {
    const ws = FakeSocket.instances[0];
    expect(ws.url).toContain("projectConversation=p");
    act(() => ws.snapshot(undefined, "other")); expect(current.users).toEqual([]);
    act(() => ws.snapshot()); expect(host.textContent).toBe("connected:b");
    await act(async () => { await vi.advanceTimersByTimeAsync(5002); });
    expect(host.textContent).toBe("connected:"); expect(current.users).toHaveLength(1);
  });
  it("throttles input, debounces stop and clears on empty/blur", async () => {
    const ws = FakeSocket.instances[0];
    act(() => { current.typing(true); current.typing(true); });
    expect(ws.send).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); current.typing(true); });
    expect(ws.send).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(4500); });
    expect(JSON.parse(ws.send.mock.calls.at(-1)![0])).toEqual({ type: "typing", active: false });
    act(() => { current.typing(true); current.typing(false); });
    expect(JSON.parse(ws.send.mock.calls.at(-1)![0]).active).toBe(false);
  });
  it("clears on disconnect, reconnects and closes on project navigation", async () => {
    const ws = FakeSocket.instances[0];
    act(() => ws.snapshot());
    act(() => ws.onclose?.({ code: 1006 }));
    expect(current.users).toEqual([]); expect(current.connected).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(FakeSocket.instances).toHaveLength(2);
    act(() => root.render(<Harness projectId="next" />));
    expect(FakeSocket.instances[1].close).toHaveBeenCalledOnce(); expect(current.users).toEqual([]);
    expect(FakeSocket.instances[2].url).toContain("projectConversation=next");
  });
  it("preserves secure WebSocket transport on HTTPS", () => {
    urlMock.secure = true;
    act(() => root.render(<Harness projectId="secure" />));
    expect(FakeSocket.instances.at(-1)?.url).toMatch(/^wss:/);
  });
  it("does not reconnect a forbidden socket", async () => {
    act(() => FakeSocket.instances[0].onclose?.({ code: 1008 }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(FakeSocket.instances).toHaveLength(1);
  });
});
