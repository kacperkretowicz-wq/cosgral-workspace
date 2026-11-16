import { isString } from "@openbot/contracts/runtime-values";
export function safeCliError(message: string): string {
  return message
    .replace(/(?:Error: )?Error invoking remote method '[^']*': (?:Error: )?/g, "")
    .replace(/[A-Za-z]:[\\/][^\r\n]*/g, "[CLI path]")
    .replace(/\/(?:Users|home)\/[^\s]*/g, "[CLI path]");
}

export function providerError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : isString(error) ? error : fallback;
  return safeCliError(message) || fallback;
}
