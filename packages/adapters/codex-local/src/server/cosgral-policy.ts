import fs from "node:fs/promises";
import path from "node:path";

/** Codex creates mounts for protected metadata even when it is absent.
 * Prepare empty targets before the outer RO bind; never follow repo symlinks.
 * The worktree's existing .git file is supplied by prepareCosgralGitView.
 */
export async function prepareCosgralReadOnlyCwd(cwd: string): Promise<void> {
  for (const name of [".agents", ".codex", ".aws"]) {
    const target = path.join(cwd, name);
    await fs.mkdir(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const stat = await fs.lstat(target);
    if (!stat.isDirectory()) throw new Error(`Unsafe COSGRAL sandbox mount target: ${name}`);
  }
}

/** A run-scoped server policy; apply again at the adapter boundary. */
export function cosgralPolicy(config: Record<string, unknown>): Record<string, unknown> {
  if (config.cosgralExecutionRole !== "worker" && config.cosgralExecutionRole !== "coordinator") return config;
  return { ...config, engine: "cli", command: "codex", filesystemScope: "workspace",
    filesystemSandboxCommand: "bwrap", filesystemExtraPaths: [],
    dangerouslyBypassApprovalsAndSandbox: false, dangerouslyBypassSandbox: false,
    args: [], extraArgs: ["--sandbox", "workspace-write",
      "--skip-git-repo-check", "-c", 'approval_policy="never"',
      "-c", "sandbox_workspace_write.network_access=true"] };
}

export function cosgralProcessEnvironment(ambient: NodeJS.ProcessEnv, own: Record<string, string>): Record<string, string> {
  return { ...Object.fromEntries(["PATH", "LANG", "LC_ALL", "TZ"].flatMap(key =>
    typeof ambient[key] === "string" ? [[key, ambient[key]!]] : [])), ...own };
}
