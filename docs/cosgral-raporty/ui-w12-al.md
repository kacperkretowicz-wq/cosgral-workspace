# UI-AL — wspólne stany puste / błąd / niedostępne (Library, Usage, Schedule)

**Gałąź:** `team/ui/w12-ai`  
**Kolejka:** pozycja 4 (UI Designer)  
**Data:** 18.11.2026

## Wynik

Wspólny `CosgralPanelState` (`empty` | `error` | `unavailable`) + style w `kk-panels.css`.

- **Library:** brak API, błąd+Retry, pusta lista
- **Usage:** brak API, błąd+Retry, „Nothing has been counted yet.”
- **Schedule:** brak API, błąd+Retry, puste okno

## Testy

| Co | Stan |
|---|---|
| `CosgralPanelState.test` | 2/2 |
| `UsageReportView.test` | 7/7 |
| `ScheduleOverview.test` | 4/4 |
| `LibraryFilesView.test` | 5/5 |
| `i18n.test` | 9/9 |
| Biome | OK |
| `typecheck:renderer` | OK |

## Luki

1. Inne panele (Marketplace, Plugins) nadal mają własne `*-note` — nie ten ticket.
2. Dostępność fokus/kontrast/`prefers-reduced-motion` = kolejka #5.
3. Nie oglądane w Electronie.

## Następne

Kolejka UI #5: dostępność na nowych ekranach.
