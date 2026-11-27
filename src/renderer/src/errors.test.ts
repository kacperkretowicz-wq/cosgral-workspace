import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vitest";
import { errorText, translateErrorMessage } from "./errors";
import { setLanguage } from "./i18n";

afterEach(() => {
  setLanguage("en");
  flush();
});

function inPolish() {
  setLanguage("pl");
  flush();
}

describe("errorText", () => {
  it("shows the engine sentence as it is in English and drops Electron's prefix", () => {
    expect(
      errorText(new Error("Error invoking remote method 'x:y': Error: This agent no longer exists."), "Fallback."),
    ).toBe("This agent no longer exists.");
  });

  it("translates known engine sentences and sentence templates in Polish", () => {
    inPolish();
    expect(errorText(new Error("This agent no longer exists."), "Nie udało się.")).toBe("Ten agent już nie istnieje.");
    expect(errorText(new Error("name is required."), "Nie udało się.")).toBe("Pole „name” jest wymagane.");
    expect(errorText(new Error("title has at most 80 characters."), "Nie udało się.")).toBe(
      "Pole „title” może mieć najwyżej 80 znaków.",
    );
    expect(translateErrorMessage("Choose at most 5 files.")).toBe("Wybierz najwyżej 5 plików.");
  });

  it("never shows an unknown English sentence alone in Polish", () => {
    inPolish();
    expect(errorText(new Error("Something odd happened inside."), "Nie udało się zapisać.")).toBe(
      "Nie udało się zapisać. (szczegóły: Something odd happened inside.)",
    );
  });

  it("uses the fallback for things that are not errors", () => {
    expect(errorText("boom", "Nie udało się.")).toBe("Nie udało się.");
    expect(errorText(new Error("  "), "Nie udało się.")).toBe("Nie udało się.");
  });
});
