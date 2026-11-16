// @vitest-environment node
import { type AgentEvent, isSpaceDescription, isSpaceList, SPACE_LIMITS } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { createMockSpaces } from "./mock-spaces";

function setup() {
  const events: AgentEvent[] = [];
  const api = createMockSpaces((event) => events.push(event));
  return { api, events };
}

describe("mock client spaces (W8-KK1)", () => {
  it("starts with the main space only, running and selected", async () => {
    const { api } = setup();
    const list = await api.list();
    expect(isSpaceList(list)).toBe(true);
    expect(list.spaces).toHaveLength(1);
    expect(list.spaces[0]).toMatchObject({ id: "main", main: true, running: true, selected: true });
  });

  it("creates spaces without switching, with unique names, and tells the window", async () => {
    const { api, events } = setup();
    const list = await api.create({ name: "  Client A " });
    expect(isSpaceList(list)).toBe(true);
    expect(list.spaces.map((space) => space.name)).toEqual(["Main", "Client A"]);
    expect(list.runningId).toBe("main");
    expect(events.at(-1)).toMatchObject({ type: "spaces-changed" });
    await expect(api.create({ name: "client a" })).rejects.toThrow(/already has this name/);
    await expect(api.create({ name: "Main" })).rejects.toThrow(/already has this name/);
    await expect(api.create({ name: " " })).rejects.toThrow(/needs a name/);
  });

  it("the number of client spaces is limited", async () => {
    const { api } = setup();
    for (let index = 0; index < SPACE_LIMITS.maxSpaces; index += 1) await api.create({ name: `Client ${index}` });
    await expect(api.create({ name: "One too many" })).rejects.toThrow(/too many/);
  });

  it("rename, archive and restore work for a client space; the main space is protected", async () => {
    const { api } = setup();
    const created = await api.create({ name: "Client A" });
    const id = created.spaces[1]?.id ?? "";
    expect((await api.rename({ id, name: "Client B" })).spaces[1]?.name).toBe("Client B");
    expect((await api.archive({ id })).spaces[1]?.archivedAt).not.toBeNull();
    expect((await api.restore({ id })).spaces[1]?.archivedAt).toBeNull();
    await expect(api.rename({ id: "main", name: "Mine" })).rejects.toThrow(/main space/);
    await expect(api.archive({ id: "main" })).rejects.toThrow(/main space/);
    await expect(api.delete({ id: "main", confirm: true })).rejects.toThrow(/main space/);
    await expect(api.archive({ id: "client-9999" })).rejects.toThrow(/does not exist/);
  });

  it("delete needs a confirmation and is refused for the running or the selected space", async () => {
    const { api } = setup();
    const id = (await api.create({ name: "Client A" })).spaces[1]?.id ?? "";
    await expect(api.delete({ id, confirm: false })).rejects.toThrow(/confirmation/);
    await api.switch({ id, confirm: true });
    await expect(api.delete({ id, confirm: true })).rejects.toThrow(/runs on/);
    await api.switch({ id: "main", confirm: true });
    expect((await api.delete({ id, confirm: true })).spaces).toHaveLength(1);
  });

  it("a switch needs a confirmation, selects the space, and the restart makes it the running one", async () => {
    const { api } = setup();
    const id = (await api.create({ name: "Client A" })).spaces[1]?.id ?? "";
    await expect(api.switch({ id, confirm: false })).rejects.toThrow(/confirmation/);
    const chosen = await api.switch({ id, confirm: true });
    expect(chosen).toMatchObject({ runningId: "main", selectedId: id });
    api.simulate.restarted();
    expect(await api.list()).toMatchObject({ runningId: id, selectedId: id });
  });

  it("an archived space cannot be switched to until it is restored", async () => {
    const { api } = setup();
    const id = (await api.create({ name: "Client A" })).spaces[1]?.id ?? "";
    await api.archive({ id });
    await expect(api.switch({ id, confirm: true })).rejects.toThrow(/archived/);
    await api.restore({ id });
    await expect(api.switch({ id, confirm: true })).resolves.toMatchObject({ selectedId: id });
  });

  it("describe tells what is separate and whether the space has data", async () => {
    const { api } = setup();
    const id = (await api.create({ name: "Client A" })).spaces[1]?.id ?? "";
    const description = await api.describe({ id });
    expect(isSpaceDescription(description)).toBe(true);
    expect(description).toMatchObject({ separateFolder: true, hasData: false, running: false });
    expect(description.isolated).toEqual(["agents", "files", "vault", "browser", "mcp", "memory"]);
    expect(await api.describe({ id: "main" })).toMatchObject({ main: true, hasData: true, sizeBytes: null });
  });
});
