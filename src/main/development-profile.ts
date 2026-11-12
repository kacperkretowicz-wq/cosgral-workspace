export type DevelopmentProfile = "app" | "test-client";

export function readDevelopmentProfile(value: string | undefined): DevelopmentProfile {
  return value === "test-client" ? "test-client" : "app";
}

export function developmentUserDataName(profile: DevelopmentProfile): "COSGRAL Workspace Dev Test Client" | "COSGRAL Workspace Dev" {
  return profile === "test-client" ? "COSGRAL Workspace Dev Test Client" : "COSGRAL Workspace Dev";
}

export function shouldAutoStartHost(input: { configured: boolean; enabledOnLaunch: boolean }): boolean {
  return input.configured && input.enabledOnLaunch;
}
