# Tester W11 — odbiór UI (T-A / T-B)

**Data:** 17.11.2026 (wznowienie T-B)  
**Gałąź Testera:** `team/tester/w11-odbior` (po merge `codex/cosgral-desktop`)  
**Gałąź UI (odczyt, bez zmian):** `team/ui/w11-ui1` @ `2ccaeac4e`  
**Integracja:** `codex/cosgral-desktop` @ `51f626f5c`  
**Kryteria:** `docs/cosgral/odbior-071.md`  
**Narzędzie:** `scripts/ui-fidelity/` (nakładka na `scripts/openbot-probe/compare.ts`)  
**Odniesienie (poza repo):** `Shared\cosgral-docs\openbot-0.71-ui\main-shell\`

## Metoda

1. Lekki odbiór **statyczny**: kod + CSS + testy UI vs kryteria P0 i vs ścieżki ekstraktora.
2. Brama liczbowa: `scripts/ui-fidelity/run.ts` → `Shared\cosgral-docs\porownanie-ui\GATE.md` gdy dwa przebiegi probe.
3. **Electron / sandbox:e2e:** nie uruchamiane (brak GO dla Testera; GO Backendu do 13:30 już usunięty).

## Wynik per ekran (statyczny) — UI @ `2ccaeac4e`

| Ekran | ID | Verdict | Różnice | Adresat |
|---|---|---|---|---|
| Tokeny `--cosgral-*` | (baza) | **PASS** | `cosgral-tokens.css` + aliasy; zgodne z `tokeny-071.md` (KAPI). Bez px w oknie. | — |
| Pasek boczny + szyna | S-SIDEBAR | **PASS** (kod) | Poprzedni FAIL i18n **naprawiony** (`173425bf8`): `t("Duplicate")`, `t("Copy ready…")`, InitialSetup przez `t()`. Szyna 52/36 w `cosgral.css`. Bazowe `app-shell.css` nadal 54px (nadpisanie pod `.app-frame-with-page-rail`). Menu „+” jest. **Uwaga:** `Sidebar.folders.test.tsx` nadal szuka etykiety PL „Duplikuj” — ryzyko przy jsdom EN. | UI (test folderów) |
| Nowy agent | S-NEW-AGENT | **niejasne** | Formularz + testy jednostkowe OK. Brak pary probe COSGRAL↔`03-new-agent` (±2/±5). | Tester po probe |
| Chrome czatu (część) | S-CHAT | **niejasne** | **Jest:** zakładki wątków (`ThreadTabs` + `threadTabs`), wyszukiwarka z zakładkami (`GlobalSearch` + `search`). **Brak w oddaniu:** pasek modelu, menu załączników, slash/@ (`composer`), „1 step”, akcje/reakcje, rama panelu, drag kart. | UI Designer |
| Zadania / ustawienia / Marketplace | P1 | **niejasne** | Nieoddane na tej gałęzi. | UI / Backend / KK |

**Podsumowanie:** 2 PASS (tokeny, sidebar i18n) · 0 FAIL · 3 niejasne (Nowy agent px, chrome niepełny, P1).

## Narzędzie ui-fidelity

| Plik | Rola |
|---|---|
| `scripts/ui-fidelity/gate.ts` | PASS/FAIL/niejasne; ±2 px / ±5 koloru z `compare.ts` |
| `scripts/ui-fidelity/run.ts` | porównanie drzew + `GATE.md` / `INDEX.md` poza repo |
| `scripts/ui-fidelity/gate.test.ts` | atrapy |
| `scripts/ui-fidelity/README.md` | użycie |

Smoke własne (atrapy): `Shared\cosgral-docs\porownanie-ui\smoke-identical\` → 1 PASS.  
Folder `_smoke` (64 ekrany, 0 różnic): wygląda na porównanie extractu z samym sobą (Backend), **bez** `GATE.md` i bez przebiegu COSGRAL — nie używam jako dowodu parytetu.

## Parytet 0.68 §0.71

Tabela luk zaktualizowana poniżej w `parytet-0.68.md`. **Procent 80,7% bez zmiany** (brak Electrona w tym zadaniu).

## Czego nie sprawdziłem

- Electron, e2e, W5, motyw jasny w oknie.
- Prawdziwego `probe --target cosgral` + gate na żywej app.
- Storybook / pełnego `check`.
- Pixel-diff vs PNG właściciela.
