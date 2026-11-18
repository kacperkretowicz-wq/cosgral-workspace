# UI-AW (kolejka #15): a11y po sondzie T-AJ

## Wynik
Sonda T-AJ (`taj-a11y`): **css/focus/motion ok** — brak FAIL do naprawy. Wzmocnienie arkusza `ui-recent-a11y.css` pod P0/P1 z odbioru (Tasks board, Appearance, rail, sidebar, Marketplace): więcej `:focus-visible`, szerszy `prefers-contrast: more`, `forced-colors`, `reduced-motion` też na FLIP wierszy.

## Dowód sondy
`Shared\cosgral-sandbox\taj-a11y\evidence\a11y-probe.json`: focusVisible 65, reducedMotion 29, contrast 1 → po tej zmianie więcej reguł contrast/focus na nowych selektorach.

## Testy
| Plik | Wynik |
|---|---|
| `ui-recent-a11y.test.ts` | 2/2 |
| Biome | OK |
| typecheck:renderer | OK |

Bez Storybooka / Electrona / axe (brak GO-ui).

## Luki
- Nie w oknie (sonda Testera już ok na tipie bez UI-AT/UI-14).
- Teach/Voice w menu+ nadal disabled (silnik).
- axe / Storybook kontrast — nie w tym przebiegu.
