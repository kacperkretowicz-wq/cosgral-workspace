// COSGRAL: Electron puts "Error invoking remote method '<channel>': Error: " in front of every error the main process throws.
// The window then showed that line to the person, and a screen that translates the program's sentences could not find them (seen in
// the real window, 23.11). The prefix is removed here once, for every call; the sentence itself is kept as it is.

const PREFIX = /^(?:Error: )?Error invoking remote method '[^']*': (?:Error: )?/;

/** The program's own sentence of an IPC error (anything else passes through). */
export function cleanIpcError<T>(error: T): T | Error {
  if (!(error instanceof Error) || !PREFIX.test(error.message)) return error;
  const clean = new Error(error.message.replace(PREFIX, ""));
  clean.name = error.name;
  return clean;
}

/** `ipcRenderer.invoke` with the clean sentence on failure. */
export function invokeClean<T>(invoke: () => Promise<T>): Promise<T> {
  return invoke().catch((error: unknown) => {
    throw cleanIpcError(error);
  });
}
