# UI-AG — kafle paska + 12 maskotek (Nowy agent)

**Gałąź:** `team/ui/w12-ui2`  
**Baza:** `544a6869c` (integracja)  
**Data:** 18.11.2026

## Wynik

1. **Pasek boczny:** kafelek 68px, maskotka **44×44** wypełnia slot (wcześniej slot 40, SVG 36 — „lekki” vs 0.71). Lekkie tło kafli + odstęp 3px.
2. **Nowy agent:** siatka **12 twarzy** (2×6). `flex-wrap: nowrap` chował część masek — zamienione na `grid`.
3. Test: `NewAgentPage.test` — asercja 12× „Choose this face”.

## Testy

| Co | Stan |
|---|---|
| `NewAgentPage.test` | 4/4 (po jednym pliku) |
| Biome (shell.css, new-agent.css, test) | OK |
| `typecheck:renderer` | **nie** — Tester ma GO Electron (`GO-tester-e2e.txt`) |

## Luki

- Menu „+” (lista uboższa niż 0.71) — następny krok kolejki.
- Wygląd kafli w oknie / zrzuty `17-11-h` — po GO Testera.
- Tasks „Otwórz jako czat” / Steps — wg vs-071-g już OK w skrypcie.
