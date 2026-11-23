import { isString } from "@openbot/contracts/runtime-values";
/** The sentence of the program without Electron's "Error invoking remote method '<channel>': Error: " in front of it. */
export function withoutIpcPrefix(message: string): string {
  return message.replace(/(?:Error: )?Error invoking remote method '[^']*': (?:Error: )?/g, "");
}

export function safeCliError(message: string): string {
  return withoutIpcPrefix(message)
    .replace(/[A-Za-z]:[\\/][^\r\n]*/g, "[CLI path]")
    .replace(/\/(?:Users|home)\/[^\s]*/g, "[CLI path]");
}

export function providerError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : isString(error) ? error : fallback;
  return safeCliError(message) || fallback;
}
