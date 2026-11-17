# Backend W12 – silnik kart agenta (BE-D, krok 1)

Gałąź `team/backend/w12-settings` (z integracji 6752d67a1). Kontrakt `window.openbot.agentCards` jest z W11; tu jest silnik.

## Co działa
- `AgentCardsService` (`src/backend/agent-cards.ts`): preferencje agenta w jednym pliku `agent-preferences.json` obok danych programu (zapis atomowy, uszkodzony plik albo zła wartość = domyślne pole), jedno zdarzenie `agent-preferences-changed` przy realnej zmianie, brak zdarzenia gdy nic się nie zmieniło, `prune` po usunięciu agenta.
- `steerSupported` to fakt dostawcy (`AgentService.canSteer`), nigdy z pliku ani od osoby.
- `overview`: zawsze 14 kart w stałej kolejności; liczniki z `agentCardCounts` (pamięć, skille, pliki agenta, tabele, rutyny, foldery, modele zapasowe, poziom dostępu). Usługa, która zawiedzie, zostawia kartę bez licznika, nie psuje przeglądu. Publikacja: `available:false`.
- `resetSession` → `AgentService.resetProviderSession`: odrzucone w trakcie tury, inaczej dezaktywuje sesję dostawcy aktywnego wątku (następna wiadomość zaczyna świeży kontekst, historia zostaje).
- IPC `agent-cards:*` (4 kanały, tylko ten komputer; w `local-only-ipc.test.ts`).
- Launcher kopii dla probe: `scripts/openbot-probe/launch.ts` (to samo `cleanEnvironment()` co e2e/W5).

## Szew w agent-service.ts (33 linie dodane, nic nie przesunięte)
1. Pole `#busyMode` + `useBusyMessageMode(port)`; port zwraca "queue" lub "steer" dla agenta.
2. W `sendMessage`, po kolejkowaniu: jeśli trwa tura i port mówi "steer", wywołanie `steerQueuedMessage` (błąd = wiadomość zostaje w kolejce, bez skutku ubocznego).
3. `canSteer(botId)` i `resetProviderSession(botId)` (ten sam sprzątający kawałek co `deleteThread`).
W `main/index.ts` ok. 30 linii: tworzenie silnika, port, `bots-changed` → `prune`.

## Testy
`agent-cards.test.ts` 12/12, `agent-card-counts.test.ts` 3/3, `launch.test.ts` 3/3, `agent-service.test.ts -t W12` 2/2 (steer vs queue na prawdziwym serwisie z atrapą Codex; reset odrzucony w trakcie tury), `local-only-ipc.test.ts` zielony, typecheck contracts i node, Biome.

## Nie sprawdzone / ograniczenia
- Domyślna wartość aplikacji dla "kolejka/sterowanie" jest stała ("queue"): `AppSettings` nie ma jeszcze pola.
- Liczniki plików biblioteki: tylko do 500 najnowszych plików (limit listy).
- `quickAcknowledgement`, `agentStartsNewChats`, `localScripts`, `chatColor`, `notificationLevel` są zapisywane i odczytywane, ale agent-service ich jeszcze nie czyta (wpięcie osobno).
- Nie uruchamiano Electrona ani e2e (brak GO).
