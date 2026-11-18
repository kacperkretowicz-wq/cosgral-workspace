// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chunkPaths, normalizePath, planFastCheck } from "./check-fast-plan.ts";

const all = () => true;

describe("check:fast plan (BE-U)", () => {
  it("a document-only change needs no check", () => {
    const plan = planFastCheck(["docs/cosgral/PLAN.md", "COSGRAL-CHANGES.md", "docs\\cosgral-raporty\\x.md"], all);
    expect(plan.runUiCheck).toBe(false);
    expect(plan.biomeFiles).toEqual([]);
    expect(plan.typecheck).toEqual([]);
    expect(plan.testFiles).toEqual([]);
    expect(plan.relatedSources).toEqual([]);
    expect(plan.needsFullCheck).toEqual([]);
    expect(plan.notes.join(" ")).toMatch(/only documents changed/);
  });

  it("a main-process file type-checks the node project and runs its related tests, not the screens", () => {
    const plan = planFastCheck(["src/main/channel-routines-ipc.ts", "src/main/local-only-ipc.test.ts"], all);
    expect(plan.typecheck).toEqual(["node"]);
    expect(plan.runUiCheck).toBe(false);
    expect(plan.testFiles).toEqual(["src/main/local-only-ipc.test.ts"]);
    expect(plan.relatedSources).toEqual(["src/main/channel-routines-ipc.ts"]);
    expect(plan.biomeFiles).toHaveLength(2);
  });

  it("a contracts file is seen by every project that reads the contracts", () => {
    const plan = planFastCheck(["packages/contracts/src/ipc-endpoints.ts"], all);
    expect(plan.typecheck).toEqual(["contracts", "node", "renderer", "storybook"]);
    expect(plan.runUiCheck).toBe(false);
  });

  it("a screen file runs check:ui and the renderer and storybook types; a story is not run as a test here", () => {
    const plan = planFastCheck(
      ["src/renderer/src/components/ChannelView.tsx", "src/renderer/src/components/Panel.stories.tsx"],
      all,
    );
    expect(plan.runUiCheck).toBe(true);
    expect(plan.typecheck).toEqual(["renderer", "storybook"]);
    expect(plan.relatedSources).toEqual(["src/renderer/src/components/ChannelView.tsx"]);
    expect(plan.notes.join(" ")).toMatch(/story\/visual/);
  });

  it("a deleted file is not read by Biome or run as a test, but it still type-checks its project", () => {
    const plan = planFastCheck(
      ["src/backend/old.ts", "src/backend/old.test.ts", "src/backend/kept.ts"],
      (path) => path === "src/backend/kept.ts",
    );
    expect(plan.typecheck).toEqual(["node"]);
    expect(plan.biomeFiles).toEqual(["src/backend/kept.ts"]);
    expect(plan.testFiles).toEqual([]);
    expect(plan.relatedSources).toEqual(["src/backend/kept.ts"]);
  });

  it("a change that can reach everything is refused as the whole answer and type-checks every project", () => {
    for (const path of [
      "package.json",
      "bun.lock",
      "tsconfig.node.json",
      "vitest.config.ts",
      "biome.json",
      ".storybook/preview.ts",
    ]) {
      const plan = planFastCheck([path], all);
      expect(plan.needsFullCheck, path).toEqual([path]);
      expect(plan.typecheck, path).toEqual(["contracts", "node", "renderer", "storybook", "api", "mobile-app"]);
    }
  });

  it("warns that a contracts file reaches almost every test, and says how to take a quick look", () => {
    const plan = planFastCheck(["packages/contracts/src/ipc-endpoints.ts"], all);
    expect(plan.notes.join(" ")).toMatch(/--skip-related/);
    expect(planFastCheck(["src/main/x.ts"], all).notes.join(" ")).not.toMatch(/--skip-related/);
  });

  it("package.json is harmless when the caller found that only its scripts changed, and global otherwise", () => {
    const harmless = planFastCheck(["package.json"], all, { ordinary: ["package.json"] });
    expect(harmless.needsFullCheck).toEqual([]);
    expect(harmless.biomeFiles).toEqual(["package.json"]);
    expect(harmless.typecheck).toEqual([]);
    expect(planFastCheck(["package.json"], all).needsFullCheck).toEqual(["package.json"]);
    // The exception is for the named path only.
    expect(planFastCheck(["bun.lock"], all, { ordinary: ["package.json"] }).needsFullCheck).toEqual(["bun.lock"]);
  });

  it("only the projects a path can see are checked: the phone app and the API are separate", () => {
    expect(planFastCheck(["src/mobile-app/main.ts"], all).typecheck).toEqual(["mobile-app"]);
    expect(planFastCheck(["apps/auth-api/src/index.ts"], all).typecheck).toEqual(["api"]);
    expect(planFastCheck(["scripts/check-fast.ts"], all).typecheck).toEqual(["node"]);
  });

  it("counts a path once, in any slash style, and sorts the list", () => {
    const plan = planFastCheck(["src\\backend\\b.ts", "src/backend/b.ts", "./src/backend/a.ts"], all);
    expect(plan.changed).toEqual(["src/backend/a.ts", "src/backend/b.ts"]);
    expect(normalizePath(".\\x\\y.ts")).toBe("x/y.ts");
  });

  it("splits a long list of paths so that no command line goes over the limit", () => {
    const paths = Array.from({ length: 300 }, (_, index) => `src/backend/some-long-file-name-${index}.test.ts`);
    const chunks = chunkPaths(paths, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(paths);
    for (const chunk of chunks) expect(chunk.join(" ").length).toBeLessThanOrEqual(2000);
    expect(chunkPaths([])).toEqual([]);
  });
});
