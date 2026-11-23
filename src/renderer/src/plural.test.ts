import { waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";
import { language, setLanguage, tn } from "./i18n";

// Polish has three forms for a count: 1 krok, 2–4 (and 22–24, …) kroki, 5–21 kroków. Seen in the real window as "3 kroków".
describe("tn: Polish plural forms", () => {
  afterEach(() => setLanguage("en"));

  it("counts agent steps with the right Polish form", async () => {
    setLanguage("pl");
    await waitFor(() => expect(language()).toBe("pl"));
    const steps = (count: number) => tn(count, "{count} step", "{count} steps");
    expect([1, 2, 3, 4, 5, 12, 21, 22, 25].map(steps)).toEqual([
      "1 krok",
      "2 kroki",
      "3 kroki",
      "4 kroki",
      "5 kroków",
      "12 kroków",
      "21 kroków",
      "22 kroki",
      "25 kroków",
    ]);
  });

  it("keeps English one/other", async () => {
    setLanguage("en");
    await waitFor(() => expect(language()).toBe("en"));
    expect([1, 3].map((count) => tn(count, "{count} step", "{count} steps"))).toEqual(["1 step", "3 steps"]);
  });
});
