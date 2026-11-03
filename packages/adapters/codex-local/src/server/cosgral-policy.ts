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
