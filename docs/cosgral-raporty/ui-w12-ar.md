# UI-AR — Loading szkielety w Conversation / Context (kolejka UI #11)

**Gałąź:** `team/ui/w12-ai`  
**Data:** 18.11.2026

## Wynik

1. Podgląd mediów tekstowych: `CosgralLoadingSkeleton` zamiast „Loading…”.
2. Zakładka przeglądarki w trakcie ładowania: pasek szkieletu + `sr-only` Loading.
3. `ContextIndicator`: szkielet zamiast „Loading context information…”.

## Testy

| Co | Stan |
|---|---|
| `i18n.test` | 8/8 |
| Biome | OK |
| `typecheck:renderer` | OK |

Bez Storybooka / Electrona. Osobnego pliku testu Conversation nie ruszałem (ciężki).

## Luki

- Nie w oknie.
- Kolejka UI: #9 Tasks failed/cancelled nadal czeka na Backend.
