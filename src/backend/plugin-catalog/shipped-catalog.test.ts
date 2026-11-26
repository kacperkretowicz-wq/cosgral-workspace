import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalogFolder } from "./catalog-loader";

// The small catalog that ships in the repository (`katalog-pluginow`): every plugin must pass the same checks
// (checksum, shape, safe addresses) as a catalog the owner chooses. After a change, run scripts/build-plugin-catalog.ts.
describe("katalog-pluginow", () => {
  it("loads completely: no plugin is skipped", async () => {
    const catalog = await loadCatalogFolder(join(import.meta.dirname, "../../../katalog-pluginow"));
    expect(catalog.skipped).toBe(0);
    expect(catalog.entries.map((entry) => entry.slug).sort()).toEqual([
      "dokumentacja-bibliotek",
      "myslenie-krok-po-kroku",
      "pamiec-agenta",
    ]);
    expect(catalog.entries.find((entry) => entry.slug === "pamiec-agenta")?.featured).toBe(true);
    for (const entry of catalog.entries) {
      expect(
        entry.apps.every((app) => app.transport === "stdio" && app.auth.every((auth) => auth.kind === "local")),
      ).toBe(true);
    }
  });
});
