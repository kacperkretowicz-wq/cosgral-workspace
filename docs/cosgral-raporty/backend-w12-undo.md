# Backend W12 – cofnięcie usunięcia wątku (BE-K pkt 1)

Gałąź `team/backend/w12-undo` (z integracji b1e28ab8f).

## Jak działa
`threads.delete` kasuje wątek od razu i na zawsze. Dodane jest drugie wywołanie: **ukrycie na 10 minut**. Wątek znika z listy, ale nic z niego nie jest ruszane (historia, kolejka, karty, plany, przypięcia zostają jak były), więc cofnięcie przywraca **ten sam wątek**, a nie kopię. Po upływie okna wątek jest kasowany zwykłym `threads.delete` (z czyszczeniem pamięci podręcznych programu). Koniec okna jest zapisany w bazie: restart go nie wydłuża, a wątek, któremu czas minął, gdy program był zamknięty, jest kasowany przy starcie.

## IPC dla UI: `window.openbot.threadUndo` (tylko ten komputer)
1. `delete({botId, threadId, confirm: true})` → `{ list, pending }`. Te same odmowy co `threads.delete` (brak `confirm`, trwa tura w wątku, nieznany wątek). `list` = lista agenta bez wątku; `pending` = `{botId, threadId, title, wasActive, deletedAt, expiresAt}`. Z tego okno rysuje „Usunięto „<title>”. Cofnij” z odliczaniem do `expiresAt`.
2. `undo({botId, threadId})` → `ThreadList` (cała lista, jak inne wywołania wątków). Gdy wątek był pokazywany (`wasActive`), znów jest aktywny. Odmowy zwykłym zdaniem: „There is nothing to undo for this thread.”, „The time to undo has passed.”, „An agent has at most 200 threads.” (miejsce zajęte w oknie).
3. `list({botId})` → `PendingThreadDelete[]` (najnowsze pierwsze; tylko te, którym czas jeszcze nie minął). Do odtworzenia paska „Cofnij” po odświeżeniu okna.
4. „Usuń teraz”: istniejące `threads.delete` działa też na wątku, który czeka w oknie.
5. Funkcje czyste w kontrakcie (`ipc-thread-undo.ts`): `pendingDeleteExpired`, `pendingDeleteSecondsLeft(pending, now)` (do odliczania), `undoDeleteProblem`.

## Zdarzenia dla UI
- `thread-deletes-changed` `{botId, pending[]}`: lista wątków do cofnięcia zmieniła się (usunięto, cofnięto, czas minął). Wysyłane po każdym `delete`, `undo` i po skasowaniu na koniec okna.
- `threads-changed` (istniejące) przy ukryciu, cofnięciu i skasowaniu: lista wątków bez ukrytych.

## Reguły
- Ukryty wątek: nie ma go na liście, nie można go wybrać, zmienić nazwy, rozgałęzić ani wysłać do niego (to „Unknown thread.”). Nie liczy się do limitu 200 wątków agenta.
- Usunięcie aktywnego wątku przenosi aktywność na najnowszy inny otwarty wątek albo tworzy nowy pusty (jak `delete`). Cofnięcie przywraca aktywność, ale pusty wątek, który powstał w międzyczasie, zostaje.
- Skasowanie na koniec okna przy trwającej turze (np. wiadomość z kolejki ruszyła w ukrytym wątku) czeka i jest ponawiane co minutę.

## Czego ukrycie nie obejmuje (do wiedzy UI)
- Wyszukiwanie po wszystkich wiadomościach może znaleźć wiadomości ukrytego wątku do końca okna.
- Karty „Needs you” ukrytego wątku nie są zamykane.

## Pliki i miejsca zmian
Kontrakt `packages/contracts/src/ipc-thread-undo.ts`, atrapa w `mock-threads.ts` (`undo`, zegar do testów), `ThreadStore.hide/unhide/listPending/expiredPending` (tabela `projection_thread_pending_delete`, tworzy się sama), `ThreadUndoService` (`src/backend/thread-undo.ts`), `agent-service.ts` **16 linii** (pole, tworzenie, getter `threadUndo`, `start()` po starcie, `dispose()` przy stopie), IPC `thread-undo:delete|undo|list`.

## Testy (napisane w cichym oknie, NIE uruchomione)
`ipc-thread-undo` (4), `mock-threads` (+3), `thread-store-undo` (6, prawdziwa baza), `thread-undo` (7, atrapa magazynu i czasu), `local-only-ipc` (+1 prefiks). Sprawdzone: Biome, typecheck contracts, node, storybook, renderer.
