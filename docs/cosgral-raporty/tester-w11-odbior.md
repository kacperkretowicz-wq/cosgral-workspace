# Tester W11 — odbiór UI (T-A / T-B)

**Data:** 17.11.2026  
**Gałąź Testera:** `team/tester/w11-odbior`  
**Gałąź UI (odczyt, bez zmian):** `team/ui/w11-ui1` @ `05e61cb7f`  
**Integracja bazowa po merge:** `codex/cosgral-desktop` @ `d92b91cca`  
**Kryteria:** `docs/cosgral/odbior-071.md`  
**Narzędzie:** `scripts/ui-fidelity/` (nakładka na `scripts/openbot-probe/compare.ts`, BE `c360eed15`)  
**Odniesienie (poza repo):** `Shared\cosgral-docs\openbot-0.71-ui\main-shell\`

## Metoda

1. Lekki odbiór **statyczny**: kod + CSS + testy/stories UI vs kryteria P0 i vs `aria.yml` / układ z ekstraktora (ścieżki, nie treść w repo).
2. Brama liczbowa: `compare.ts` + `ui-fidelity` → `Shared\cosgral-docs\porownanie-ui\GATE.md` gdy istnieją dwa przebiegi probe.
3. **Electron / sandbox:e2e:** nie uruchamiane (brak `GO-*.txt` w `Shared\cosgral-sandbox`).

## Wynik per ekran (statyczny)

| Ekran | ID | Verdict | Różnice | Adresat |
|---|---|---|---|---|
| Tokeny `--cosgral-*` | (baza) | **PASS** (kod) | Alias `--openbot-*` → `--cosgral-*` w `styles.css`; ciemny/jasny w W11-UI1. Bez pomiaru px w oknie. | — |
| Pasek boczny + szyna | S-SIDEBAR | **FAIL** | (1) Hardcodowane PL: `Duplikuj` w `Sidebar.tsx` (~984) i powiązane testy — przy domyślnym EN = mieszanka języków (S-SIDEBAR-L3). (2) `Kopia gotowa…` hardcod PL w `App.tsx`. (3) Szyna: `--page-rail-width: 52px` + przyciski 36px w `cosgral.css` (zgodne z commit message UI); w `app-shell.css` nadal bazowe **54px** — nadpisanie tylko pod `.app-frame-with-page-rail` (ok, ale łatwo o regresję). Menu „+” / `sidebar-new-menu` obok wyszukiwarki: jest. Hover na `.page-rail-button`: jest. Foldery / Needs you: wcześniejsze testy. | **UI Designer** |
| Nowy agent | S-NEW-AGENT | **niejasne** | Formularz w kodzie: kolor, twarz, nazwa, opis, model+effort, ≤3 sugestie, Create (disabled bez nazwy) — pokrywa S-NEW-AGENT-L1/F2 w testach jednostkowych. Układ CSS: kolumna ~420px, tokeny. Brak przebiegu `--target cosgral` → nie ma liczb ±2/±5 vs `main-shell\03-new-agent`. Folder `01-new-agent` w ekstraktorze ma napisy harmonogramu (błąd mapowania B1) — do pary używać `03-new-agent`. | UI Designer (px w oknie); Tester (probe) |
| Chrome czatu | S-CHAT | **niejasne** | Nie w zakresie oddania W11-UI1 @ `05e61cb7f` (kolejka UI-B). | UI Designer |
| Zadania / ustawienia / Marketplace | P1 | **niejasne** | Brak nowych ekranów na tej gałęzi UI. | UI Designer / Backend / KK |

**Podsumowanie statyczne:** 1 PASS (tokeny), 1 FAIL (sidebar i18n), 1 niejasne (nowy agent bez probe), reszta P0/P1 nieoddana.

## Narzędzie ui-fidelity

| Plik | Rola |
|---|---|
| `scripts/ui-fidelity/gate.ts` | PASS/FAIL/niejasne; tolerancje z `compare.ts` |
| `scripts/ui-fidelity/run.ts` | woła `compare.ts`, pisze `GATE.md` poza repo |
| `scripts/ui-fidelity/gate.test.ts` | testy jednostkowe na atrapach |
| `scripts/ui-fidelity/README.md` | użycie |

`compare.ts` wzięty z BE-A (`c360eed15`) na tę gałąź (lider jeszcze nie scalił do integracji w momencie pracy). Pełny przebieg na dwóch drzewach probe: **nie** — brak extractu COSGRAL i GO.

## Parytet 0.68 §0.71

Sekcja dodana w `docs/cosgral/parytet-0.68.md`. **Procent 80,7% nie zmieniany** (brak dowodu w prawdziwym oknie w tym zadaniu).

## Czego nie sprawdziłem

- Electron, `sandbox:e2e`, tryb W5, motyw jasny w oknie.
- `probe.ts --target cosgral` na działającej aplikacji.
- Pixel-diff vs PNG właściciela.
- Storybook / pełny `check`.
- Gałęzi UI nowszej niż `05e61cb7f` (jeśli UI dopisał chrome czatu po tym SHA).
