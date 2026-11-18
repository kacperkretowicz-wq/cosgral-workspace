# UI-AP — szyna: pin + More (kolejka UI #8)

**Gałąź:** `team/ui/w12-ai`  
**Data:** 18.11.2026

## Wynik

1. Menu **More** (było „More pages”): wiersz = strona + ikona pin (jak 006).
2. Kropka akcentu na przypiętej ikonie w szynie (`data-pinned`).
3. Pin nadal z menu kontekstowego na ikonie.

## Testy

| Co | Stan |
|---|---|
| `PageRail.test` | 6/6 |
| `PageRail.pins.test` | 4/4 |
| Biome | OK |
| `typecheck:renderer` | (w toku / OK) |

Bez Storybooka / Electrona.

## Luki

- Help w szynie jak 0.71 nie dodane.
- Nie w oknie.
