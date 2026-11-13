// COSGRAL W3-KK3: what "Always allow" can offer for an open approval card. The program checks it again when the rule is
// saved (src/backend/approval-rules.ts), so this only decides what to show.

import type { AgentApproval } from "@openbot/contracts/ipc";

export type AlwaysAllowChoice =
  | { available: false; reason: string }
  | { available: true; kind: "command"; prefixes: string[] }
  | { available: true; kind: "file-change"; folder: string }
  | { available: true; kind: "permissions"; writes: boolean };

const SHELL_CONTROL = /[;&|<>`\n\r\0]|\$\(|\$\{/;

/** Words of a command, keeping a quoted part together. Null when a quote is left open. */
export function commandWords(command: string): string[] | null {
  const words: string[] = [];
  let word = "";
  let quote: '"' | "'" | null = null;
  for (const char of command.trim()) {
    if (quote) {
      word += char;
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      word += char;
      quote = char;
    } else if (/\s/.test(char)) {
      if (word) words.push(word);
      word = "";
    } else {
      word += char;
    }
  }
  if (quote) return null;
  if (word) words.push(word);
  return words;
}

/** The sets of leading words a command rule can use: two words and up, ending with the whole command. */
export function commandPrefixes(command: string): string[] {
  const words = commandWords(command);
  if (!words) return [];
  if (words.length < 2) return [command.trim()];
  const prefixes: string[] = [];
  for (let count = 2; count <= words.length; count += 1) prefixes.push(words.slice(0, count).join(" "));
  return prefixes;
}

export function alwaysAllowChoice(approval: AgentApproval): AlwaysAllowChoice {
  if (approval.kind === "command") {
    const command = approval.command?.trim() ?? "";
    if (!command) return { available: false, reason: "This request has no command to remember." };
    if (SHELL_CONTROL.test(command)) {
      return { available: false, reason: "A command that chains or redirects can only be allowed once." };
    }
    const prefixes = commandPrefixes(command);
    if (!prefixes.length) return { available: false, reason: "This command cannot be remembered." };
    return { available: true, kind: "command", prefixes };
  }
  if (approval.kind === "file-change") {
    const folder = approval.grantRoot ?? approval.cwd;
    if (!folder) return { available: false, reason: "This request does not say which folder it changes." };
    return { available: true, kind: "file-change", folder };
  }
  if (approval.kind === "permissions") {
    const permissions = approval.permissions;
    if (!permissions) return { available: false, reason: "This request has nothing to remember." };
    if (permissions.network) return { available: false, reason: "Network access can only be allowed once." };
    if (permissions.fileSystem.read.length + permissions.fileSystem.write.length === 0) {
      return { available: false, reason: "This request names no folder." };
    }
    return { available: true, kind: "permissions", writes: permissions.fileSystem.write.length > 0 };
  }
  return { available: false, reason: "This kind of request can only be allowed once." };
}
