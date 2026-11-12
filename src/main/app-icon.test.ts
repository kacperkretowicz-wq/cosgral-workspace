import { describe, expect, it } from "vitest";
import { appIconFileName, readAppVariant, resolveAppIconPath } from "./app-icon";

describe("app icon variant", () => {
  it("defaults to dev for an unpackaged app and production for a packaged app", () => {
    expect(readAppVariant(undefined, false)).toBe("dev");
    expect(readAppVariant(undefined, true)).toBe("production");
  });

  it("accepts explicit dev, preview, and production variants", () => {
    expect(readAppVariant("dev", true)).toBe("dev");
    expect(readAppVariant("preview", false)).toBe("preview");
    expect(readAppVariant("production", false)).toBe("production");
  });

  it("falls back safely for unknown values", () => {
    expect(readAppVariant("staging", false)).toBe("dev");
    expect(readAppVariant("staging", true)).toBe("production");
  });

  it("resolves source and packaged icon paths", () => {
    // COSGRAL: compare as POSIX paths; on Windows the platform join returns backslashes.
    const posixPath = (value: string) => value.replaceAll("\\", "/");
    expect(appIconFileName("preview")).toBe("icon-preview.png");
    expect(
      posixPath(
        resolveAppIconPath({
          variant: "dev",
          isPackaged: false,
          resourcesPath: "/Applications/COSGRAL Workspace.app/Contents/Resources",
          sourceRoot: "/workspace/cosgral",
        }),
      ),
    ).toBe("/workspace/cosgral/build/icon-dev.png");
    expect(
      posixPath(
        resolveAppIconPath({
          variant: "production",
          isPackaged: true,
          resourcesPath: "/Applications/COSGRAL Workspace.app/Contents/Resources",
          sourceRoot: "/workspace/cosgral",
        }),
      ),
    ).toBe("/Applications/COSGRAL Workspace.app/Contents/Resources/icons/icon-production.png");
  });
});
