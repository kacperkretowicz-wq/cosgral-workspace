export type SaveStage = "profile" | "fallback";
export async function saveAgentSettingsStages(
  profile: () => Promise<unknown>,
  fallback: () => Promise<unknown>,
  start: SaveStage,
): Promise<{ failed: SaveStage | null; message: string }> {
  if (start === "profile") {
    try {
      await profile();
    } catch (e) {
      return { failed: "profile", message: e instanceof Error ? e.message : "Unknown error" };
    }
  }
  try {
    await fallback();
  } catch (e) {
    return { failed: "fallback", message: e instanceof Error ? e.message : "Unknown error" };
  }
  return { failed: null, message: "" };
}
