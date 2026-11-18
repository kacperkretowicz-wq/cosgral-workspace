# BE-Z: okno historii kanału i naprawa ostrzeżenia o wyciekach nasłuchów (18.11.2026)

Gałąź `team/backend/w12-z` z `78d908540` (integracja po scaleniu BE-Y).

## 1. Okno historii kanału („kompakt”)
- `WorkspaceChannel.historyWindow` = 20, 50, 100 albo 200 (stałe `CHANNEL_HISTORY_WINDOWS`, domyślnie `DEFAULT_CHANNEL_HISTORY_WINDOW` = 200, czyli dzisiejsze zachowanie). Silnik zawsze wypełnia pole; brak = 200 (pole jest opcjonalne w typie, żeby nie łamać 24 plików z gotowymi obiektami kanałów).
- Zapis: `window.openbot.channels.update({ channelId, historyWindow: 50 })`. Zła wartość (np. 30, „50”) = odmowa „historyWindow is 20, 50, 100 or 200.” i **nic się nie zmienia**, także inne pola tego samego wywołania.
- Gdzie przechowane: osobna tabela `projection_channel_history_windows` (tworzona przez magazyn kanałów przy pierwszym użyciu połączenia, jak rutyny kanału), więc **bez zmiany centralnego schematu bazy i bez migracji**. Zapis w tej samej transakcji co aktualizacja kanału. Brak wiersza = 200.
- Użycie w silniku: przy starcie zadania agent dostaje ostatnie N wiadomości (`listMessages(..., { limit })`); **wiadomość-prośba zadania nadal jest dopinana na początek**, gdy wypadła z okna. To samo okno ogranicza narzędzie `history`, którym agent może poprosić o historię.
- Zdarzenie `channels-changed` niesie już `historyWindow`.
- Atrapa: `mock-openbot.ts` ma teraz działające `channels.update` (tytuł, instrukcje, izolacja, archiwum, `historyWindow`), więc ekran da się zbudować w Storybooku.

### Notka IPC dla KK (lista wyboru w ustawieniach kanału)
1. Odczyt: `channel.historyWindow ?? 200` (z `channels.list()` i zdarzenia `channels-changed`).
2. Zapis: `channels.update({ channelId, historyWindow })` z wartością z `CHANNEL_HISTORY_WINDOWS` (`@openbot/contracts/ipc`). Etykiety do wymyślenia po stronie UI, np. „Ostatnie 20 / 50 / 100 / 200 wiadomości (domyślnie)” z opisem: „Mniej wiadomości = krótszy kontekst agenta, szybsze i tańsze zadania. Prośba zadania zawsze jest dołączona.”
3. Zmiana działa od następnego zadania; zadania w toku jej nie widzą.

## 2. Kolejka Backend, pozycja 4: `MaxListenersExceededWarning` (preload `agent:event`)
- **Przyczyna:** w `src/preload/index.ts` każde `window.openbot.agent.onEvent(listener)` dodawało własny `ipcRenderer.on("agent:event", ...)`. Okno subskrybuje z wielu komponentów (w renderze ok. 54 wywołań `onEvent`), więc przy 11 jednoczesnych Electron ostrzega o możliwym wycieku pamięci (widoczne w logu e2e jako 4 ostrzeżenia).
- **Naprawa:** `src/preload/agent-event-hub.ts`: jeden nasłuch `ipcRenderer` dla wszystkich subskrybentów (pierwszy dodaje, ostatni usuwa), zdarzenia rozsyłane do zbioru funkcji. Zachowanie dla subskrybentów bez zmian (tylko zdarzenia wybranego serwera, w kolejności). Nowe: subskrybent, który rzuci błąd, nie odcina pozostałych (zwykły emiter by się zatrzymał), a wypisanie błędu idzie do konsoli.
- To nie był wyciek (odsubskrybowanie działało), tylko za dużo nasłuchów naraz; ostrzeżenie znika.

## Testy (po jednym pliku)
`channel-store.test` 14/14 (3 nowe), `channel-engine.test` 12/12 (3 nowe: okno 20 z dopiętą starą prośbą, domyślne 200, narzędzie `history`), `channel-clear-history.test` 3/3 (parser okna), `ipc-workspace-channels.test` 3/3, `agent-event-hub.test` 4/4 (nowy), sąsiednie `channel-history` 8/8, `channel-memory` 4/4, `channel-routines` 11/11, `tasks-view` 4/4, `input-parsers` 22/22. Biome czysty, `typecheck:contracts/node/renderer` EXIT 0.

## Luki
- Ekranu listy „okno historii” jeszcze nie ma (KK).
- Ostrzeżenie o nasłuchach: potwierdzenie w Electronie (znika w logu e2e) po następnym przebiegu Testera.
- Pełny `bun run test` nie biegł; `historyWindow` nie jest ustawiane przy tworzeniu kanału (tylko przez `update`).
