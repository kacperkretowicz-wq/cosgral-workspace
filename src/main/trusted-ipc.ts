import { ipcMain } from "electron";
import { isTrustedRendererUrl } from "./trusted-renderer";

type TrustedListener = (event: { senderFrame?: { url?: string | null } | null }, ...arguments_: unknown[]) => unknown;

/** Where the handlers are registered. Tests swap `register` to call the real handlers without Electron (COSGRAL W5-G2). */
export const ipcRegistry = {
  register: (channel: string, listener: TrustedListener): void => {
    ipcMain.handle(channel, listener);
  },
};

export function handleTrusted<Result>(channel: string, handler: (...arguments_: unknown[]) => Result): void {
  ipcRegistry.register(channel, (event, ...arguments_: unknown[]) => {
    if (!isTrustedRendererUrl(event.senderFrame?.url)) {
      throw new Error("Rejected IPC request from an untrusted renderer.");
    }
    return handler(...arguments_);
  });
}

/** COSGRAL W6-KK3: like {@link handleTrusted}, and the handler also gets the address of the page that asked (its own route). */
export function handleTrustedFrame<Result>(
  channel: string,
  handler: (frameUrl: string | null, ...arguments_: unknown[]) => Result,
): void {
  ipcRegistry.register(channel, (event, ...arguments_: unknown[]) => {
    if (!isTrustedRendererUrl(event.senderFrame?.url)) {
      throw new Error("Rejected IPC request from an untrusted renderer.");
    }
    return handler(event.senderFrame?.url ?? null, ...arguments_);
  });
}
