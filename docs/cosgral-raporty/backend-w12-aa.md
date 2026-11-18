# Backend W12 BE-AA: tablica widoku Zadań (`tasksView.board`)

## Co jest
- Kanał IPC `tasks-view:board` (lokalny, `handleTrusted`), preload `window.openbot.tasksView.board(query?)`.
- Zapytanie: `{ scope?, channelId?, ownerBotId?, query?, perColumn? }` (domyślnie 20 na kolumnę, maks. 50).
- Odpowiedź: `{ columns, counts }`. Kolumny w stałej kolejności:
  - `needs-you` (waiting, done), `working` (running, queued), `paused`, `failed`, `cancelled`.
  - każda: `id`, `states`, `total`, `items`, `hasMore`.
- Kroki (podzadania) liczą się tylko w zadaniu nadrzędnym, nie w kolumnach.
- Ten sam `buildTasksBoard` używa silnik i mock Storybooka.

## Dla UI
`TasksViewScreen.boardGroups` może przejść z grupowania po stronie klienta na `tasksView.board`.

## Testy
- `ipc-tasks-view.test` 18/18, `tasks-view.test` 5/5, `mock-tasks-view.test` 4/4, `local-only-ipc.test` 6/6.
- Biome czysty, `typecheck:contracts|node|renderer` zielone.

## Luki
- Brak paginacji kolumny kursorem (tylko `perColumn` + `hasMore`).
- Nie uruchamiano Electrona/e2e (brak GO).
