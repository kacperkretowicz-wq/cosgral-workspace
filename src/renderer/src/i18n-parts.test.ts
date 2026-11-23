import { waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it } from "vitest";
import { language, setLanguage, tDataParts } from "./i18n";

// Sentences the engine glues together from fixed parts reached the Polish window in English (Providers, agent isolation).
afterEach(() => setLanguage("en"));

async function inPolish() {
  setLanguage("pl");
  await waitFor(() => expect(language()).toBe("pl"));
}

it("translates a 'Label: reason' line part by part", async () => {
  await inPolish();
  expect(
    tDataParts(
      "Not installed: Claude CLI was not found. Install Claude Code, run `claude auth login`, then choose Try again.",
    ),
  ).toBe(
    "Niezainstalowane: Nie znaleziono Claude CLI. Zainstaluj Claude Code, uruchom `claude auth login`, a potem wybierz „Spróbuj ponownie”.",
  );
});

it("translates sentences that were glued together", async () => {
  await inPolish();
  expect(
    tDataParts("Process isolation is only for Windows. Disk tools of this agent are refused below Full access."),
  ).toBe(
    "Izolacja procesów działa tylko na Windows. Narzędzia dyskowe tego agenta są blokowane poniżej pełnego dostępu.",
  );
});

it("leaves unknown parts and the English window as they are", async () => {
  await inPolish();
  expect(tDataParts("Something the dictionary does not know.")).toBe("Something the dictionary does not know.");
  setLanguage("en");
  await waitFor(() => expect(language()).toBe("en"));
  expect(tDataParts("Process isolation is only for Windows.")).toBe("Process isolation is only for Windows.");
});
