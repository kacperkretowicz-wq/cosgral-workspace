// COSGRAL W3: IPC of the agent dock and the Dynamic Island. Both are windows of this computer, so every call acts
// here, whatever server the window shows.

import { IPC_CHANNELS } from "@openbot/contracts/ipc";
import type { DockController } from "./dock-controller";
import { parseAgentRequest } from "./ipc/agent-inputs";
import {
  parseDockAgent,
  parseOpenDockChat,
  parsePinDockAgent,
  parseReorderDock,
  parseSetDockPinHidden,
  parseSetDockSize,
  parseSetDockVisible,
  parseSetIslandEnabled,
  parseShowMainWindow,
} from "./ipc/dock-inputs";
import { handleTrusted } from "./trusted-ipc";

export function registerDockIpc(dock: () => DockController | null): void {
  const controller = (): DockController => {
    const value = dock();
    if (!value) throw new Error("The dock is not ready yet.");
    return value;
  };
  const payload = (input: unknown) => parseAgentRequest(input).payload;
  handleTrusted(IPC_CHANNELS.dockGetState, () => controller().getState());
  handleTrusted(IPC_CHANNELS.dockPin, (input: unknown) => controller().pin(parsePinDockAgent(payload(input))));
  handleTrusted(IPC_CHANNELS.dockUnpin, (input: unknown) => controller().unpin(parseDockAgent(payload(input))));
  handleTrusted(IPC_CHANNELS.dockReorder, (input: unknown) => controller().reorder(parseReorderDock(payload(input))));
  handleTrusted(IPC_CHANNELS.dockSetPinHidden, (input: unknown) =>
    controller().setPinHidden(parseSetDockPinHidden(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.dockSetSize, (input: unknown) => controller().setSize(parseSetDockSize(payload(input))));
  handleTrusted(IPC_CHANNELS.dockSetVisible, (input: unknown) =>
    controller().setVisible(parseSetDockVisible(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.dockOpenChat, (input: unknown) =>
    controller().openChat(parseOpenDockChat(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.dockShowMainWindow, (input: unknown) =>
    controller().showMainWindow(parseShowMainWindow(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.islandGetState, () => controller().getIslandState());
  handleTrusted(IPC_CHANNELS.islandSetEnabled, (input: unknown) =>
    controller().setIslandEnabled(parseSetIslandEnabled(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.islandActivate, () => controller().activateIsland());
  handleTrusted(IPC_CHANNELS.islandDismiss, () => controller().dismissIsland());
}
