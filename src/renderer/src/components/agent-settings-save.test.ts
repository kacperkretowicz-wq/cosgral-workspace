import { describe, expect, it, vi } from "vitest";
import { saveAgentSettingsStages } from "./agent-settings-save";

describe("agent settings save", () => {
  it("reports a fallback failure after profile save and retries only that stage", async () => {
    const profile = vi.fn().mockResolvedValue(undefined);
    const fallback = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(undefined);
    const first = await saveAgentSettingsStages(profile, fallback, "profile");
    expect(first).toEqual({ failed: "fallback", message: "Offline" });
    const second = await saveAgentSettingsStages(profile, fallback, "fallback");
    expect(second).toEqual({ failed: null, message: "" });
    expect(profile).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(2);
  });
});
