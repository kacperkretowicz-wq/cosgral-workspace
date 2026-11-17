import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type ClickCandidate,
  clickedName,
  clickPriority,
  clickVerdict,
  groupStyles,
  isInsideRepo,
  screenFolder,
  screenSignature,
  startsAWord,
} from "./policy.ts";

const candidate = (name: string, extra: Partial<ClickCandidate> = {}): ClickCandidate => ({
  tag: "button",
  role: "button",
  name,
  href: null,
  disabled: false,
  ...extra,
});

describe("what the probe may click (B1)", () => {
  it("never clicks anything that signs in, pays, sends, installs, updates, deletes, shares, links out or leaves", () => {
    const names = [
      "Sign in with Google",
      "Continue with GitHub",
      "Wyślij kod logowania",
      "Zaloguj się",
      "Upgrade to Pro",
      "Kup teraz",
      "Delete agent",
      "Usuń agenta",
      "Clear history",
      "Zresetuj ustawienia",
      "Update",
      "Zaktualizuj",
      "Install CLI",
      "Pobierz",
      "Send message",
      "Share link",
      "Quit OpenBot",
      "Wyjdź",
      "Accept and continue",
      "Allow access",
      "Use my AI subscription",
      "Użyj mojej subskrypcji AI",
      "Copy code",
      "Terms of use",
      "Warunki korzystania",
      "Privacy policy",
      "Polityka prywatności",
      "Help center",
      "Next language",
      "Następny język",
      "Disconnect account",
    ];
    for (const name of names) expect(clickVerdict(candidate(name)).allowed, name).toBe(false);
  });

  it("clicks the plain navigation of a program", () => {
    for (const name of [
      "Agents",
      "Agenci",
      "Settings",
      "Ustawienia",
      "Search",
      "Szukaj w OpenBot",
      "Collapse sidebar",
      "Next",
      "Dalej",
      "Skip",
      "New agent",
    ]) {
      expect(clickVerdict(candidate(name)).allowed, name).toBe(true);
    }
  });

  it("matches the start of a word only, with letters of any language", () => {
    expect(startsAWord("zaloguj się", "zaloguj")).toBe(true);
    expect(startsAWord("please update now", "update")).toBe(true);
    expect(startsAWord("sender", "send")).toBe(true); // a word that starts with it: refused, on purpose (the safe side)
    expect(startsAWord("resend", "send")).toBe(false);
    expect(startsAWord("unlink", "link")).toBe(false);
  });

  it("refuses addresses that leave the program, disabled things, things without a name, and settings that are not screens", () => {
    expect(
      clickVerdict(candidate("Read more", { tag: "a", role: "link", href: "https://example.com/x" })).allowed,
    ).toBe(false);
    expect(clickVerdict(candidate("Mail us", { tag: "a", role: "link", href: "mailto:a@b.c" })).allowed).toBe(false);
    expect(clickVerdict(candidate("Agents", { tag: "a", role: "link", href: "#/agents" })).allowed).toBe(true);
    expect(clickVerdict(candidate("Next", { disabled: true }))).toEqual({ allowed: false, reason: "disabled" });
    expect(clickVerdict(candidate("   ")).allowed).toBe(false);
    expect(clickVerdict(candidate("Notifications", { role: "switch" })).allowed).toBe(false);
    expect(clickVerdict(candidate("Analytics", { role: "checkbox" })).allowed).toBe(false);
  });

  it("tries forward in a wizard first, then navigation, then the rest", () => {
    const rank = (name: string, extra: Partial<ClickCandidate & { inNav: boolean }> = {}) =>
      clickPriority({ ...candidate(name, extra), inNav: extra.inNav ?? false });
    expect(rank("Dalej")).toBeLessThan(rank("Agents", { inNav: true }));
    expect(rank("Agents", { inNav: true })).toBeLessThan(rank("Something else"));
    expect(rank("Something else")).toBeLessThan(rank("English", { role: "radio" }));
    expect(rank("Settings", { role: "tab" })).toBe(1);
  });
});

describe("where the probe writes (B1)", () => {
  it("refuses a folder inside the repository, however it is written", () => {
    const repo = join("C:", "work", "repo");
    expect(isInsideRepo(join(repo, "out"), repo)).toBe(true);
    expect(isInsideRepo(repo, repo)).toBe(true);
    expect(isInsideRepo(join(repo, "scripts", "..", "out"), repo)).toBe(true);
    expect(isInsideRepo(join("C:", "work", "other", "out"), repo)).toBe(false);
    expect(isInsideRepo(join("C:", "work", "repo-docs", "out"), repo)).toBe(false);
    expect(isInsideRepo(join(repo, "..", "out"), repo)).toBe(false);
  });
});

describe("naming and grouping (B1)", () => {
  it("names a screen folder from its number and heading, safely", () => {
    expect(screenFolder(3, "Sprawdź skrzynkę odbiorczą")).toBe("03-sprawdz-skrzynke-odbiorcza");
    expect(screenFolder(12, "")).toBe("12-screen");
    expect(screenFolder(1, "../../etc/passwd")).toBe("01-etc-passwd");
    expect(screenFolder(1, "x".repeat(200)).length).toBeLessThanOrEqual(51);
    // What was clicked tells apart screens that share a heading.
    expect(screenFolder(25, "New agent", 'button "Ustawienia" on 04-x')).toBe("25-new-agent-ustawienia");
    expect(screenFolder(26, "Zadania", 'button "Zadania" on 04-x')).toBe("26-zadania");
    expect(screenFolder(27, "New agent", "Escape")).toBe("27-new-agent");
    expect(clickedName('tab "Pliki" on 01')).toBe("Pliki");
    expect(clickedName(null)).toBeNull();
  });

  it("calls a screen the same when only numbers, spacing or the mark of a choice differ", () => {
    const a = screenSignature("app://x/index.html", '- radio "Polski" [checked]\n- text: 12:01');
    const b = screenSignature("app://x/index.html", '- radio "Polski"   \n- text: 13:45');
    const c = screenSignature("app://x/index.html", '- radio "English"\n- text: 13:45');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(screenSignature("app://y/index.html", '- radio "Polski"')).not.toBe(
      screenSignature("app://x/index.html", '- radio "Polski"'),
    );
  });

  it("groups elements of the same kind and look, counts them and keeps a few examples", () => {
    const look = { color: "rgb(1, 2, 3)", fontSize: "14px" };
    const groups = groupStyles([
      { kind: "button", label: "One", look },
      { kind: "button", label: "Two", look },
      { kind: "button", label: "Two", look },
      { kind: "button", label: "Three", look },
      { kind: "button", label: "Four", look },
      { kind: "heading", label: "Title", look },
      { kind: "button", label: "Other", look: { ...look, fontSize: "16px" } },
    ]);
    expect(groups[0]).toMatchObject({ kind: "button", count: 5 });
    expect(groups[0]?.examples).toEqual(["One", "Two", "Three"]);
    expect(groups).toHaveLength(3);
    expect(
      groupStyles(
        Array.from({ length: 10 }, (_, index) => ({ kind: "x", label: "", look: { a: String(index) } })),
        4,
      ),
    ).toHaveLength(4);
  });

  it("lets the probe press the stand-in sign-in of OUR OWN app, and nothing else that signs in", () => {
    expect(clickVerdict(candidate("Continue with Codex")).allowed).toBe(false);
    expect(clickVerdict(candidate("Continue with Codex"), "cosgral").allowed).toBe(true);
    expect(clickVerdict(candidate("Continue with Google"), "cosgral").allowed).toBe(false);
    expect(clickVerdict(candidate("Sign in"), "cosgral").allowed).toBe(false);
    expect(clickVerdict(candidate("Continue with Codex", { disabled: true }), "cosgral").allowed).toBe(false);
  });
});
