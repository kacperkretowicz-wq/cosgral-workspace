// @vitest-environment node
import { describe, expect, it } from "vitest";
import { agentCardCounts } from "./agent-card-counts";

const sources = {
  memories: (botId: string) => (botId === "chief" ? 12 : 0),
  skills: () => 3,
  files: (botId: string) => (botId === "chief" ? 7 : 0),
  tables: () => 2,
  routines: (botId: string) => (botId === "chief" ? 1 : 0),
  access: () => ({ level: "ask-first" as const, additionalFolders: ["a", "b"], excludedFolders: ["x"] }),
  backupModels: () => 2,
};

describe("agentCardCounts (W12 BE-D)", () => {
  it("counts what each existing service holds, with a short line the card can show", () => {
    const counts = agentCardCounts(sources)("chief");
    expect(counts.memory).toEqual({ count: 12, summary: "12 memories" });
    expect(counts.skills).toEqual({ count: 3, summary: "3 skills" });
    expect(counts.files).toEqual({ count: 7, summary: "7 files" });
    expect(counts.tables).toEqual({ count: 2, summary: "2 tables" });
    expect(counts.routines).toEqual({ count: 1, summary: "1 routine" });
    expect(counts.folders).toEqual({ count: 3, summary: "2 added, 1 excluded" });
    expect(counts.permissions).toEqual({ count: null, summary: "ask-first" });
    expect(counts["backup-models"]).toEqual({ count: 2, summary: "2 backup models" });
  });

  it("uses the singular for one and 'none' for nothing", () => {
    const counts = agentCardCounts({ ...sources, tables: () => 1, skills: () => 0 })("writer");
    expect(counts.tables?.summary).toBe("1 table");
    expect(counts.skills?.summary).toBe("No skills");
    expect(counts.memory?.summary).toBe("No memories");
  });

  it("never throws when a service fails, and leaves the Publish card to the cards engine", () => {
    const failing = agentCardCounts({
      ...sources,
      files: () => {
        throw new Error("boom");
      },
    })("chief");
    expect(failing.publish).toBeUndefined();
    expect(failing.files).toBeUndefined();
    expect(failing.memory?.count).toBe(12);
  });
});
