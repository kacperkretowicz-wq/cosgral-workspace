# UI-AM — dostępność nowych ekranów (fokus, kontrast, reduced-motion)

**Gałąź:** `team/ui/w12-ai`  
**Kolejka:** pozycja 5 (UI Designer)  
**Data:** 18.11.2026

## Wynik

Nowy arkusz `styles/ui-recent-a11y.css` (import w `styles.css`):

1. **Fokus:** `:focus-visible` na launcherze czatu, zakładkach panelu, kafelkach agenta, portach/polach przepływów, Retry w `CosgralPanelState`.
2. **Kontrast:** hero Tasks — solidny kolor zamiast gradientu w light + `prefers-contrast: more`; ostrzejszy tekst podpowiedzi Prompt/Condition; grubsza ramka błędu panelu.
3. **Ruch:** `prefers-reduced-motion` wyłącza hover-slide launchera i animacje empty/arrive; `forced-colors` — widoczne obramowania i Highlight focus.

## Testy

| Co | Stan |
|---|---|
| `ui-recent-a11y.test` | 2/2 |
| `ChatSidePanelLauncher.test` | 4/4 (focus klawiatury) |
| Biome | OK |
| `typecheck:renderer` | OK |

## Luki

1. Pełny axe / Storybook kontrast — bez GO.
2. Nie oglądane w Electronie.
3. Kolejka UI Designer wyczerpana (1–5 zrobione); dalsze pozycje od lidera / uzupełnienia kolejki.

## Następne

Czekam na nowe pozycje w `KOLEJKA-ZADAN.md` (sekcja UI) albo scalenie przez lidera.
