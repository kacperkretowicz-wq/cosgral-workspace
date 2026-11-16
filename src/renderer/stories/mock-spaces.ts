// COSGRAL W8-KK1: the client spaces for Storybook and the preview. Demo data only. The same rules as the program: the
// main space cannot be archived, renamed away or deleted; the running space cannot be archived or deleted; a name is
// unique; deleting and switching need `confirm: true`; a switch changes `selectedId` and the program would restart.
// `simulate.restarted` plays the restart (the selected space becomes the running one).

import {
  type AgentEvent,
  MAIN_SPACE_ID,
  MAIN_SPACE_NAME,
  normalizeSpaceName,
  SPACE_ISOLATED_PARTS,
  SPACE_LIMITS,
  type SpaceDescription,
  type SpaceList,
  type SpaceSummary,
  type SpacesDesktopApi,
  spaceNameProblem,
} from "@openbot/contracts/ipc";

export interface MockSpaces extends Required<SpacesDesktopApi> {
  simulate: { restarted: () => void };
}

interface Stored {
  id: string;
  name: string;
  createdAt: string;
  archivedAt: string | null;
}

export function createMockSpaces(
  emit: (event: AgentEvent) => void,
  seed: Array<{ id: string; name: string }> = [],
): MockSpaces {
  let clock = Date.parse("2026-11-16T12:00:00.000Z");
  let counter = 0;
  const now = () => {
    clock += 1000;
    return new Date(clock).toISOString();
  };
  const spaces: Stored[] = [
    { id: MAIN_SPACE_ID, name: MAIN_SPACE_NAME, createdAt: now(), archivedAt: null },
    ...seed.map((entry) => ({ ...entry, createdAt: now(), archivedAt: null })),
  ];
  let runningId = MAIN_SPACE_ID;
  let selectedId = MAIN_SPACE_ID;

  const find = (id: string): Stored => {
    const space = spaces.find((candidate) => candidate.id === id);
    if (!space) throw new Error("This space does not exist.");
    return space;
  };
  const list = (): SpaceList => ({
    runningId,
    selectedId,
    problem: null,
    spaces: [...spaces]
      .sort((a, b) => (a.id === MAIN_SPACE_ID ? -1 : b.id === MAIN_SPACE_ID ? 1 : a.name.localeCompare(b.name)))
      .map(
        (space): SpaceSummary => ({
          id: space.id,
          name: space.name,
          main: space.id === MAIN_SPACE_ID,
          createdAt: space.createdAt,
          archivedAt: space.archivedAt,
          running: space.id === runningId,
          selected: space.id === selectedId,
        }),
      ),
  });
  const publish = (): SpaceList => {
    const snapshot = list();
    emit({ type: "spaces-changed", ...snapshot });
    return snapshot;
  };
  const others = (id: string) => spaces.filter((space) => space.id !== id).map((space) => space.name);
  const notMain = (space: Stored, what: string) => {
    if (space.id === MAIN_SPACE_ID) throw new Error(`The main space cannot be ${what}.`);
  };
  const notRunning = (space: Stored, what: string) => {
    if (space.id === runningId || space.id === selectedId)
      throw new Error(`The space the program runs on cannot be ${what}.`);
  };

  return {
    list: async () => list(),
    create: async (input) => {
      if (spaces.length - 1 >= SPACE_LIMITS.maxSpaces) throw new Error("There are too many spaces: remove one first.");
      const problem = spaceNameProblem(input.name, others(""));
      if (problem) throw new Error(problem);
      counter += 1;
      spaces.push({
        id: `client-${String(counter).padStart(4, "0")}`,
        name: normalizeSpaceName(input.name),
        createdAt: now(),
        archivedAt: null,
      });
      return publish();
    },
    rename: async (input) => {
      const space = find(input.id);
      notMain(space, "renamed");
      const problem = spaceNameProblem(input.name, others(space.id));
      if (problem) throw new Error(problem);
      space.name = normalizeSpaceName(input.name);
      return publish();
    },
    archive: async (input) => {
      const space = find(input.id);
      notMain(space, "archived");
      notRunning(space, "archived");
      space.archivedAt = now();
      return publish();
    },
    restore: async (input) => {
      find(input.id).archivedAt = null;
      return publish();
    },
    delete: async (input) => {
      const space = find(input.id);
      if (input.confirm !== true)
        throw new Error("Deleting a space needs a confirmation: it removes the space's data for good.");
      notMain(space, "deleted");
      notRunning(space, "deleted");
      spaces.splice(spaces.indexOf(space), 1);
      return publish();
    },
    switch: async (input) => {
      const space = find(input.id);
      if (input.confirm !== true)
        throw new Error("Switching the space needs a confirmation: the program restarts and the running turns stop.");
      if (space.archivedAt) throw new Error("An archived space cannot be used: restore it first.");
      selectedId = space.id;
      return publish();
    },
    describe: async (input): Promise<SpaceDescription> => {
      const space = find(input.id);
      return {
        id: space.id,
        name: space.name,
        main: space.id === MAIN_SPACE_ID,
        archived: space.archivedAt !== null,
        running: space.id === runningId,
        separateFolder: true,
        isolated: [...SPACE_ISOLATED_PARTS],
        hasData: space.id === runningId || space.id === MAIN_SPACE_ID,
        sizeBytes: space.id === MAIN_SPACE_ID ? null : 0,
      };
    },
    simulate: {
      restarted: () => {
        runningId = selectedId;
        publish();
      },
    },
  };
}
