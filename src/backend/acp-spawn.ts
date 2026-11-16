// COSGRAL W6-BE5: starts an ACP agent program. On Windows a `.cmd` or `.bat` file (the shim npm puts in the PATH for Gemini CLI)
// cannot be started by Node directly (spawn EINVAL), so it is started through cmd.exe in the form that keeps a path with spaces
// whole (checked on a shim in a folder with a space in its name). Anything else is started directly.

import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

export interface AcpSpawnTarget {
  file: string;
  args: string[];
  windowsVerbatimArguments: boolean;
}

export function acpSpawnTarget(
  command: string,
  args: readonly string[],
  platform: NodeJS.Platform = process.platform,
  comSpec: string | undefined = process.env.ComSpec,
): AcpSpawnTarget {
  if (platform !== "win32" || !/\.(cmd|bat)$/i.test(command)) {
    return { file: command, args: [...args], windowsVerbatimArguments: false };
  }
  const parts = [command, ...args];
  if (parts.some((part) => /["%\r\n\0]/.test(part))) {
    throw new Error(
      "This command cannot be started through cmd.exe: its path or arguments contain a quote, a percent sign or a line break.",
    );
  }
  return {
    file: comSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${parts.map((part) => `"${part}"`).join(" ")}"`],
    windowsVerbatimArguments: true,
  };
}

export function spawnAcpAgent(
  command: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): ChildProcessWithoutNullStreams {
  const target = acpSpawnTarget(command, args);
  return spawn(target.file, target.args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    windowsVerbatimArguments: target.windowsVerbatimArguments,
    ...(env ? { env } : {}),
  });
}
