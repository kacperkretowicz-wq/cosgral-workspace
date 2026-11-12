import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * COSGRAL (test support): writes a fake agent CLI that runs a CommonJS Node.js script.
 * POSIX gets an executable script with a node shebang. Windows cannot run shebang
 * scripts, so it gets the script plus a `.cmd` shim, like an npm-installed CLI.
 */
export async function writeFakeCli(directory: string, name: string, script: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  if (process.platform !== "win32") {
    const executable = join(directory, name);
    await writeFile(executable, `#!/usr/bin/env node\n${script}`, { mode: 0o700 });
    await chmod(executable, 0o700);
    return executable;
  }
  const executable = join(directory, `${name}.cmd`);
  await writeFile(join(directory, `${name}.cjs`), script);
  await writeFile(executable, `@echo off\r\n"${process.execPath}" "%~dp0${name}.cjs" %*\r\n`);
  return executable;
}
