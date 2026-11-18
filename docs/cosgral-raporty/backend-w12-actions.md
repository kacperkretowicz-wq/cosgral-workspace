# Backend W12 – akcje na wiadomościach i Zadania (BE-J)

Gałąź `team/backend/w12-actions` (z integracji 79567cdf9).

## 1. Menu wiadomości: `window.openbot.messageMenu.get({botId, threadId?, messageId})`
Akcje już istniały osobno (kopiuj = tylko okno; reakcje = `setMessageReaction`; przypięcie, ponów, edytuj, usuń = `messageActions`; rozgałęzienie = `threads.branch`). Brakowało jednego zapytania, po którym okno rysuje menu bez zgadywania. Odpowiedź:
- `actions[7]` w stałej kolejności (`copy`, `react`, `pin`, `branch`, `retry`, `edit`, `delete`): `enabled`, `reason` (zwykłe zdanie, gdy nie), `needsConfirmation` (usuń zawsze; edytuj, gdy po wiadomości są inne; wtedy wywołanie musi mieć `confirm: true`), `active` (przypięcie: wiadomość jest przypięta, napis „Odepnij”).
- `reactions`: `quick` (pierwszy rząd wyboru), `more` (za „więcej”), `current` (reakcja na wiadomości teraz).
- `pinned`, `threadId`.
Reguły są reguły samych akcji (`messageActionProblem`, `threadBusyProblem`, `editNeedsConfirmation`), więc menu nie proponuje tego, co akcja odrzuci: wiersz, który nie jest wiadomością, nic nie oferuje; edytować można tylko własną wiadomość; ponów/edytuj/usuń wymagają wątku, który jest pokazany, i niezajętego (bez trwającej tury i kolejki); rozgałęzienie czeka na dokończenie odpowiedzi i na wiadomość spoza kolejki oraz wymaga miejsca na jeszcze jeden wątek (limit 200); przypięcie ma limit 50.
- Zdarzenia dla UI (bez nowych): `message-pins-changed` (przypięcia), `conversation` (reakcja i zmiany historii). Menu jest odczytem, nic nie zmienia.
- Silnik: `AgentService.messageMenu` (~25 linii, reszta w kontrakcie), `ThreadStore.hasRoom`; 1 nowy kanał IPC lokalny `message-menu:get`.

Testy: `ipc-message-menu` 9, `mock-message-actions` 8, `agent-service-message-actions -t W12` (prawdziwy serwis: edytuj z potwierdzeniem, przypięcie, reakcja, zajęty wątek, nieznany wątek i wiadomość), `local-only-ipc` 6/6; typecheck contracts, node, renderer, storybook; Biome.

Nie sprawdzone: okno; „kopiuj” nie ma silnika (schowek to rzecz okna).

## 2. Zadania (ekrany 078–087): `window.openbot.tasksView`
Zapisy już były w `window.openbot.channels`: `actOnTask({taskId, action})` (stop, pause, resume, archive, restore) i `reassignTask`. Brakowało odczytów, więc dołożone są dwa (tylko ten komputer, nic nie zmieniają):

**`tasksView.list(query?)`** → `{ items, total, offset, nextOffset, counts }`
- query (wszystko opcjonalne): `scope` `active` (domyślnie) | `archived` | `all`; `states[]`; `channelId`; `ownerBotId`; `query` (tytuł, kanał, nazwa agenta; bez wielkości liter); `limit` (domyślnie 50, max 200); `offset`.
- `items[]` (najnowsza zmiana pierwsza): `task` (jak `ChannelTask`), `channelName`, `channelTitle`, `ownerName` (null, gdy agenta już nie ma), `stepCount`/`stepsDone` (podzadania), `resultPreview` (początek wyniku w jednym wierszu, do 240 znaków; null, gdy wyniku jeszcze nie ma).
- `counts`: `active`, `archived` (po filtrach kanału, agenta i tekstu) i `byState` (w zakresie, bez filtra stanów: liczby na przyciskach filtrów).
- Lista nie wymaga już wołania `listTasks` kanał po kanale.

**`tasksView.detail({taskId})`** → jedno zadanie:
- `request` (wiadomość osoby, która zaczęła zadanie) i `result` (pełny tekst wyniku, wersja, autor), obie mogą być null.
- `steps[]` = podzadania (`parentTaskId`): tytuł, stan, właściciel. `dependencies[]` = zadania, na które zadanie czeka.
- `log[]` (od najstarszego, ostatnie 200): wpisy `assigned` (kto dostał zadanie i dlaczego, zwykłym zdaniem: „Task created.”, „Given to another agent.”, „Resumed by a person.”…) oraz wiadomości kanału tego zadania (`note`, `question`, `reply`, `result`…). `version` i `superseded` przy wynikach i notatkach (notatka postępu dostaje `superseded`, gdy wynik jest już gotowy; okno może ją przyciemnić). `logTruncated` = starsze wpisy ucięto.
- `openAsChat` = `{channelId, anchorMessageId}`: „Open as chat” otwiera ten kanał i przewija do wiadomości z prośbą.
- `actions[6]` (`stop`, `pause`, `resume`, `archive`, `restore`, `reassign`): `enabled` i `reason`, według reguł sklepu kanałów (stop: otwarte; pauza: kolejka/praca/czekanie; wznów: wstrzymane lub zatrzymane; archiwizuj/przywróć wg `archivedAt`; przekaż: nieskończone). Okno nie powinno proponować tego, co zostanie odrzucone. Wywołania zapisu bez zmian: `channels.actOnTask`, `channels.reassignTask`.

Zdarzenia dla UI (bez nowych): `task-changed`, `channel-message`, `channel-message-changed` (po nich okno odświeża listę lub szczegóły).
Silnik: `TasksViewService` (czyta sklep kanałów; log szuka wiadomości zadania do 1000 ostatnich wiadomości kanału, potem ustawia `logTruncated`), 2 nowe kanały IPC lokalne `tasks-view:list`, `tasks-view:detail`; w `main/index.ts` 5 linii.

Testy: `ipc-tasks-view` 13, `mock-tasks-view` 4, `tasks-view` 4 (prawdziwy sklep kanałów w bazie), `local-only-ipc`; typecheck contracts, node, renderer, storybook; Biome.
Nie sprawdzone: okno; wynik zadania jest tekstem wiadomości (bez załączników zadania; kontrakt ich nie ma); „krok” to podzadanie, a nie wpis dziennika modelu.
