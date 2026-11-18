// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const original = process.env.COSGRAL_TEST_TIMEOUT_SCALE;

afterEach(() => {
  if (original === undefined) delete process.env.COSGRAL_TEST_TIMEOUT_SCALE;
  else process.env.COSGRAL_TEST_TIMEOUT_SCALE = original;
  vi.resetModules();
});

async function load(scale: string | undefined) {
  if (scale === undefined) delete process.env.COSGRAL_TEST_TIMEOUT_SCALE;
  else process.env.COSGRAL_TEST_TIMEOUT_SCALE = scale;
  vi.resetModules();
  return import("./timeouts");
}

describe("scalable suite timeouts (W12 BE-P)", () => {
  it("changes nothing without the variable: Windows and other systems keep their own limits", async () => {
    const { suiteTimeout, TEST_TIMEOUT_SCALE } = await load(undefined);
    expect(TEST_TIMEOUT_SCALE).toBe(1);
    expect(suiteTimeout(30_000, 10_000)).toBe(process.platform === "win32" ? 30_000 : 10_000);
  });

  it("multiplies the limit by the scale", async () => {
    const { suiteTimeout, TEST_TIMEOUT_SCALE } = await load("3");
    expect(TEST_TIMEOUT_SCALE).toBe(3);
    expect(suiteTimeout(30_000, 10_000)).toBe(process.platform === "win32" ? 90_000 : 30_000);
  });

  it("ignores a value that is not a number of at least 1", async () => {
    for (const bad of ["", "abc", "0", "-2", "0.5", "NaN"]) {
      const { TEST_TIMEOUT_SCALE } = await load(bad);
      expect(TEST_TIMEOUT_SCALE).toBe(1);
    }
  });
});
