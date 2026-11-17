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
