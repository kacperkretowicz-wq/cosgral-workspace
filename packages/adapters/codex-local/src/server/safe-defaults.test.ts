import { describe, expect, it } from "vitest";
import { DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX, resolveCodexLocalCliPolicy } from "../index.js";
import { buildCodexLocalConfig } from "../ui/build-config.js";
import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { buildCodexExecArgs } from "./codex-args.js";

describe("safe Codex local defaults", () => {
  it.each([null, "existing-session"])("keeps direct and resumed runs sandboxed (%s)", (resumeSessionId) => {
    expect(DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX).toBe(false);
    expect(resolveCodexLocalCliPolicy({}).bypass).toBe(false);
    const { args } = buildCodexExecArgs({}, { resumeSessionId });
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args).toContain('sandbox_mode="workspace-write"');
    expect(args).toContain("sandbox_workspace_write.network_access=true");
  });

  it("keeps the adapter UI builder safe when no permission choice is supplied", () => {
    const config = buildCodexLocalConfig({} as CreateConfigValues);
    expect(config.dangerouslyBypassApprovalsAndSandbox).toBe(false);
  });

  it("retains explicit network denial and explicit sandbox selection", () => {
    const { args } = buildCodexExecArgs({ extraArgs: ["--sandbox", "workspace-write", "-c", "sandbox_workspace_write.network_access=false"] });
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args).not.toContain("sandbox_workspace_write.network_access=true");
    expect(args).toContain("sandbox_workspace_write.network_access=false");
  });
});
