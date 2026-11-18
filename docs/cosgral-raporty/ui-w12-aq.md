# UI-AQ — Appearance: skala, czcionka, akcent, skrót (kolejka UI #10)

**Gałąź:** `team/ui/w12-ai`  
**Data:** 18.11.2026

## Wynik

`AppearanceSettings` poza motywem ma: Interface scale, Font, Accent, Send message with (Enter / Ctrl+Enter), Agent steps (show / collapse). Zapis przez `appSettings.update({ appearance })`; DOM już maluje `startAppearance` (KAPI-N).

## Testy

| Co | Stan |
|---|---|
| `AppearanceSettings.test` | 3/3 |
| `i18n.test` | 8/8 |
| Biome | OK |
| `typecheck:renderer` | OK |

Bez Storybooka / Electrona.

## Luki

- `unreadFirst` bez kontrolki (Backend #5 / kolejka).
- Nie w oknie.
