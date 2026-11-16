// COSGRAL W8-KK1: the `spaces:*` IPC (this computer only): list, create, rename, archive, restore, delete, switch and
// describe the client spaces. Every request is parsed by the contract first; delete and switch need `confirm: true`.
// A switch saves the choice and restarts the program on the chosen space (running turns stop first); the restart itself
// is the caller's (main), so this file never touches the engine.

import {
  type AgentEvent,
  IPC_CHANNELS,
  parseConfirmedSpaceInput,
  parseCreateSpaceInput,
  parseRenameSpaceInput,
  parseSpaceInput,
  type SpaceList,
} from "@openbot/contracts/ipc";
import type { SpaceStore } from "../backend/space-store";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { handleTrusted } from "./trusted-ipc";

export interface SpacesIpcOptions {
  store: () => SpaceStore | null;
  /** Tells every window the list changed. */
  emit: (event: AgentEvent) => void;
  /** Stops the agents and servers and restarts the program (it starts on the chosen space). */
  restart: () => Promise<void>;
}

export function registerSpacesIpc(options: SpacesIpcOptions): void {
  const local = (input: unknown) => {
    const request = parseAgentRequest(input);
    if (request.serverId !== "local") throw new Error("Client spaces are managed on this computer only.");
    return request.payload;
  };
  const keeper = (): SpaceStore => {
    const value = options.store();
    if (!value) throw new Error("COSGRAL Workspace is still starting.");
    return value;
  };
  const changed = (list: SpaceList): SpaceList => {
    options.emit({ type: "spaces-changed", ...list });
    return list;
  };
  handleTrusted(IPC_CHANNELS.spacesList, (input: unknown) => {
    local(input);
    return keeper().list();
  });
  handleTrusted(IPC_CHANNELS.spacesCreate, (input: unknown) => {
    const request = parseCreateSpaceInput(local(input));
    return changed(keeper().create(request.name));
  });
  handleTrusted(IPC_CHANNELS.spacesRename, (input: unknown) => {
    const request = parseRenameSpaceInput(local(input));
    return changed(keeper().rename(request.id, request.name));
  });
  handleTrusted(IPC_CHANNELS.spacesArchive, (input: unknown) => {
    const request = parseSpaceInput(local(input));
    return changed(keeper().archive(request.id));
  });
  handleTrusted(IPC_CHANNELS.spacesRestore, (input: unknown) => {
    const request = parseSpaceInput(local(input));
    return changed(keeper().restore(request.id));
  });
  handleTrusted(IPC_CHANNELS.spacesDelete, (input: unknown) => {
    const request = parseConfirmedSpaceInput(local(input), "delete");
    return changed(keeper().delete(request.id));
  });
  handleTrusted(IPC_CHANNELS.spacesSwitch, (input: unknown) => {
    const request = parseConfirmedSpaceInput(local(input), "switch");
    const store = keeper();
    const before = store.list();
    if (request.id === before.runningId && request.id === before.selectedId) return before;
    const list = changed(store.select(request.id));
    // The answer goes out first; the restart follows. Choosing the running space again (undoing a choice) restarts nothing.
    if (request.id !== list.runningId) {
      setTimeout(() => {
        options.restart().catch((error: unknown) => console.error("Unable to restart on the chosen space:", error));
      }, 150);
    }
    return list;
  });
  handleTrusted(IPC_CHANNELS.spacesDescribe, (input: unknown) => {
    const request = parseSpaceInput(local(input));
    return keeper().describe(request.id);
  });
}
