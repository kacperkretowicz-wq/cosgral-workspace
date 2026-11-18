# UI-AV (kolejka #14): animacja unread-first w pasku

## Wynik
Przy zmianie kolejki agentów (Unread first / nowa nieprzeczytana) wiersze przesuwają się **tylko `transform: translateY`** (FLIP). `prefers-reduced-motion: reduce` wyłącza animację i transition.

## Pliki
- `sidebar-row-flip.ts` — capture + play (FLIP)
- `Sidebar.tsx` — `data-agent-id`, efekt po `listRows()`
- `shell.css` — transition 180 ms na `.agent-row`

## Testy
| Plik | Wynik |
|---|---|
| `sidebar-row-flip.test.ts` | 5/5 |
| `Sidebar.activity.test.tsx` | 6/6 |
| Biome | OK |
| typecheck:renderer | OK |

Bez Storybooka / Electrona (brak GO-ui).

## Luki
- Nie w oknie.
- Nie animuje osób/kanałów (tylko agent-row).
- Wejście wiersza (`sidebar-row-in`) osobno od FLIP reorder.
