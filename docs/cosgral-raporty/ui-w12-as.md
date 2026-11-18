# UI-AS (kolejka #9): tablica Zadań — kolumny Failed / Stopped

## Wynik
Tablica Active używa `tasksView.board` (kontrakt BE-AA): 5 kolumn `needs-you`, `working`, `paused`, `failed`, `cancelled`. Liczniki z `column.total`. Filtr / archiwum / szukaj nadal przez `list`.

## Pliki
- Kontrakt: `ipc-tasks-view.ts` (+ testy board), kanał `tasks-view:board`
- Silnik / preload / IPC: `board()`
- Mock + próbki failed/cancelled (aktywne)
- `TasksViewScreen` + testy (5)
- i18n: „More in the full list.”

## Testy
| Plik | Wynik |
|---|---|
| TasksViewScreen.test | 5/5 |
| ipc-tasks-view.test | 18/18 |
| local-only-ipc.test | 6/6 |
| Biome (zmienione) | OK |
| typecheck:renderer | OK |

Bez Storybooka / Electrona / pełnego check (brak GO-ui).

## Luki
- Nie w oknie; BE-AA nie jest jeszcze na tipie integracji `4f21fbfe7` — ta gałąź niesie kontrakt+IPC żeby UI się typowało i mock działał.
- Paginacja kolumny: tylko notka „More in the full list.” + `hasMore` (bez kursora).
- „Waiting” jako nazwa kolumny paused → „Paused” (zgodnie z BE).
