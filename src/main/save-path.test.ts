import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultSavePath } from "./save-path";

type FolderName = "downloads" | "documents" | "temp";

/** A stand-in for app.getPath: the folders in `known` answer, every other one throws like Electron does. */
function folders(known: Partial<Record<FolderName, string>>): (name: FolderName) => string {
  return (name) => {
    const folder = known[name];
    if (folder === undefined) throw new Error(`Failed to get '${name}' path`);
    return folder;
  };
}

describe("defaultSavePath", () => {
  it("starts in the Downloads folder when the system knows it", () => {
    const path = defaultSavePath("report.md", folders({ downloads: "D", documents: "Docs", temp: "T" }));
    expect(path).toBe(join("D", "report.md"));
  });

  it("falls back to Documents when Downloads cannot be resolved", () => {
    const path = defaultSavePath("report.md", folders({ documents: "Docs", temp: "T" }));
    expect(path).toBe(join("Docs", "report.md"));
  });

  it("falls back to the temp folder when Downloads and Documents cannot be resolved", () => {
    const path = defaultSavePath("report.md", folders({ temp: "T" }));
    expect(path).toBe(join("T", "report.md"));
  });

  it("returns the bare file name when no folder can be resolved, and never throws", () => {
    expect(defaultSavePath("report.md", folders({}))).toBe("report.md");
  });

  it("skips a folder that answers with an empty path", () => {
    const path = defaultSavePath("report.md", folders({ downloads: "", documents: "Docs" }));
    expect(path).toBe(join("Docs", "report.md"));
  });
});
