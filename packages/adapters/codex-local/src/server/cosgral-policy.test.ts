import { describe, it, expect } from "vitest";
import { cosgralPolicy, cosgralProcessEnvironment } from "./cosgral-policy.js";
import { buildCodexExecArgs } from "./codex-args.js";
describe("COSGRAL enforced CLI permissions", () => {
  it.each(["worker", "coordinator"])("cannot bypass confinement through flags or custom command (%s)", role => {
    const config = cosgralPolicy({ cosgralExecutionRole: role, engine: "acp", command: "/tmp/evil",
      extraArgs: ["--yolo"], dangerouslyBypassSandbox: true, filesystemExtraPaths: ["/"] });
    const { args } = buildCodexExecArgs(config, { resumeSessionId: "existing" });
    expect(args).not.toContain("--yolo");
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args).toContain("workspace-write");
    expect(config.filesystemScope).toBe("workspace");
    expect(config.command).toBe("codex");
    expect(config.engine).toBe("cli");
  });
  it("only delivers own resolved capabilities, excluding server and other-agent credentials", () => {
    expect(cosgralProcessEnvironment({ PATH: "/usr/bin", OTHER_AGENT_TOKEN: "not-for-this-run", DATABASE_URL: "private" },
      { PAPERCLIP_API_KEY: "own-run", CODEX_HOME: "/own" })).toEqual({ PATH: "/usr/bin", PAPERCLIP_API_KEY: "own-run", CODEX_HOME: "/own" });
  });
  it("preserves unrelated adapter behavior", () => {
    const config = { engine: "acp" }; expect(cosgralPolicy(config)).toBe(config);
  });
});
