# Backend W12 – rutyny kanału (BE-R)

Gałąź `team/backend/w12-r` (z integracji b01e8a060). Rutyna kanału startuje pracę dla całego zespołu o stałej porze: w wyznaczonym czasie program wysyła instrukcję rutyny do kanału jako **wiadomość osoby** („Scheduled: <nazwa>”, potem treść), a lider kanału dostaje ją jak każdą prośbę (zadanie z właścicielem, stanem i wynikiem). Harmonogram jest ten sam co u rutyn agenta (co N minut, codziennie o godzinie, cron; strefa czasowa osoby), liczony tym samym kodem (`nextRunAfter`).

## Notka dla UI: `window.openbot.channelRoutines` (tylko ten komputer)
1. `list({channelId?})` → `ChannelRoutine[]` (najstarsze pierwsze). Pola: `id`, `channelId`, `name`, `prompt`, `schedule`, `timezone`, `paused`, `nextRunAt` (null, gdy wstrzymana), `lastRunAt`, `createdAt`, `updatedAt`.
2. `create({channelId, name, prompt, schedule, timezone?, paused?})` → `ChannelRoutine`. `schedule` jak u rutyn agenta: `{type:"interval", everyMinutes}`, `{type:"daily", time:"HH:MM", weekdays?}`, `{type:"cron", expression}`. Odmowy zwykłym zdaniem: „This channel no longer exists.”, „This channel is archived.”, „This channel has no lead to take the work…”, „A channel has at most 16 routines.”, „Give the routine a name.”, „Say what the lead should do on each run.”, błędy harmonogramu (np. „The time is written HH:MM…”), „The time zone is a name like Europe/Warsaw.”. Reguły czyste są w kontrakcie (`channelRoutineProblem`, `updateChannelRoutineProblem`), więc formularz może sprawdzać na żywo bez wołania programu.
3. `update({routineId, name?, prompt?, schedule?, timezone?, paused?})` → `ChannelRoutine`. Wstrzymanie zeruje `nextRunAt`, wznowienie liczy nowy start od teraz.
4. `delete({routineId})` usuwa rutynę i jej historię.
5. `runNow({routineId})` → `ChannelRoutineRun`: start poza harmonogramem; kolejny planowany start **nie** przesuwa się. Gdy nie da się (kanał w archiwum, brak lidera, poprzedni bieg trwa), odrzuca ze zdaniem powodu.
6. `listRuns({routineId})` → `ChannelRoutineRun[]` (najnowsze pierwsze, do 100). Pola: `at`, `cause` (`schedule` albo `manual`), `outcome` (`started` albo `skipped`), `reason` (dla `skipped`), `messageId`, `taskId`, **`taskState`** (stan zadania teraz: `queued`, `running`, `done`, `failed`…; czytany na żywo, więc historia mówi, jak się skończył każdy bieg; null dla `skipped` albo gdy zadania już nie ma). „Otwórz zadanie” = `tasksView.detail({taskId})`, a „Open as chat” z `messageId` jako kotwicą.
7. Zdarzenie `channel-routines-changed {channelId, routines[]}`: po utworzeniu, zmianie, starcie, pominięciu i usunięciu; lista kanału zastępuje się w całości.

## Reguły biegu
1. **Jeden bieg naraz:** gdy zadanie poprzedniego startu jeszcze trwa (`queued`, `running`, `waiting`), kolejny planowany start jest zapisany jako `skipped` z „The previous run is still going.” (zadanie wstrzymane nie blokuje). Ostatnim biegiem jest ostatni, który naprawdę wystartował.
2. **Pominięcia z powodem:** kanał zarchiwizowany, kanał bez lidera, kanał odrzucił wiadomość (tekst błędu kanału). Pominięcie przesuwa plan i trafia do historii.
3. **Program wyłączony:** po starcie programu start planowany sprzed ponad minuty jest zapisany jako `skipped` („The program was off at the planned time.”) i **nie jest nadrabiany**; plan idzie dalej od teraz.
4. Sprawdzanie co 30 s; timer nie trzyma programu przy życiu.

## Silnik i miejsca zmian
- `src/backend/channel-routines.ts`: `ChannelRoutineStore` (tabele `projection_channel_routines`, `projection_channel_routine_runs`, tworzą się same) i `ChannelRoutineService` na czterech małych portach (kanał, wysłanie wiadomości, stan zadania, zdarzenia), więc test nie potrzebuje programu; `createChannelRoutineService` składa go z magazynu kanałów i silnika kanałów.
- IPC: 6 kanałów lokalnych `channel-routines:list|create|update|delete|run-now|list-runs` (`src/main/channel-routines-ipc.ts`), preload `createChannelRoutinesApi`, atrapa `mock-channel-routines.ts` (z `tick(minuty)` i `setTaskState` do historyjek) podpięta w `mock-openbot`.
- `main/index.ts`: 12 linii (import, zmienna, rejestracja IPC, jedno wywołanie fabryki i `start()`). `agent-service.ts`: bez zmian.

## Luki
1. Ekran (UI): lista rutyn kanału, formularz (reguły z kontraktu), „Run now”, historia ze stanem zadania. Brak.
2. Tylko ten komputer; webhooka dla rutyn kanału nie ma (rutyny agenta mają).
3. Harmonogram „co N minut” liczy od chwili utworzenia lub ostatniego startu (jak u rutyn agenta), nie od pełnej godziny.
4. Rutyna nie przechodzi na innego lidera sama: bieg bierze lidera kanału z chwili startu.
5. Atrapa liczy start „codziennie/cron” jako „jutro o tej porze” (demo); program liczy prawdziwym harmonogramem.

## Sprawdzone (18.11, po zniku znaku GO, po jednym pliku)

| Plik testu | Wynik |
|---|---|
| `packages/contracts/src/ipc-channel-routines.test.ts` | 9/9 |
| `src/backend/channel-routines.test.ts` (prawdziwa baza, fałszywy zegar) | 11/11 |
| `src/renderer/stories/mock-channel-routines.test.ts` | 3/3 |
| `src/main/local-only-ipc.test.ts` | 6/6 (pierwszy bieg: limit czasu `beforeAll` pod obciążeniem, drugi czysty) |

Biome na 8 własnych plikach: zielony. `typecheck:contracts`, `typecheck:node`, `typecheck:renderer`: zielone.
Poprawki z Biome: `noMisleadingReturnType` (2 funkcje kontraktu bez jawnego typu zwrotu), `JSON.parse` bez jawnego `unknown`, `() => undefined` w preload.
Nie sprawdzone: ekran (nie ma), Electron i e2e (brak GO), start harmonogramu w prawdziwym programie.
