# BE-Y: „Wyczyść historię kanału” (parytet, wiersz 27) (18.11.2026)

Gałąź `team/backend/w12-y` z `4ddcbb5d3`.

## Wybór i powód
Z listy luk silnika wybrałem **ustawienia kanału (wiersz 27)**, a w nim **kasowanie historii kanału**: człowiek widzi to od razu (przycisk w kanale), 0.71 to ma, a w kodzie nie było nic (kanał miał tylko pamięć, lidera, rutyny). Drugi element wiersza („kompakt”) odłożyłem: wymaga decyzji, co dokładnie ma skracać (kontekst lidera? widok?), a przeglądarka w kanale zależy od hosta przeglądarki. Wiersze Discord, GitHub, głos i telefon-kanały czekają na decyzje właściciela (patrz `pytania-do-wlasciciela.md`).

## Co robi
- `window.openbot.channels.clearHistory({ channelId })` → `{ channelId, removedMessages, removedTasks }`.
- Usuwa wiadomości i zadania kanału (razem ze stanem wykonania i przydziałami). **Zostają:** kanał, członkowie, lider, instrukcje, pamięć kanału, rutyny kanału, inne kanały i wątki agentów.
- **Odmowa**, gdy jakieś zadanie (niezarchiwizowane) jest w kolejce, trwa, czeka albo jest wstrzymane: „This channel has N task(s) in progress or paused. Stop or archive it/them first.” Nic się wtedy nie zmienia. Zatrzymane (cancelled), skończone, nieudane i zarchiwizowane nie blokują.
- **Tekst naprawdę znika:** zdarzenia w dzienniku lokalnej bazy, które niosą treść usuniętych wiadomości i zadań, są kasowane w tej samej transakcji (jak przy zapominaniu pamięci); zdarzenia pamięci, członków i ustawień zostają. Samo zdarzenie `channel.history-cleared` niesie tylko liczby.
- Zdarzenia dla okna: `channels-changed` (jak dotąd) i nowe `channel-history-cleared { channelId }`.

## Notka IPC dla UI/KK
1. Przycisk „Clear history” w ustawieniach kanału (`ChannelView`), za potwierdzeniem (karta confirm albo `window.confirm`; akcja jest nieodwracalna): `await window.openbot.channels.clearHistory({ channelId })`.
2. Błąd odmowy pokazać jako zdanie (`error.message`); jest po angielsku, jak inne komunikaty silnika (`t()` z kluczem tego zdania).
3. Na zdarzenie `channel-history-cleared` dla otwartego kanału opróżnić listę wiadomości i zadań (albo pobrać je na nowo przez `listMessages` / `listTasks`).
4. Zapisanie z atrapą: `mock-openbot.ts` ma `clearHistory` (te same reguły), więc ekran można zbudować w Storybooku.

## Pliki
`packages/contracts/src/ipc-workspace-channels.ts` (typy, guard), `ipc-channels.ts` (kanał IPC), `ipc-conversation.ts` (zdarzenie), `ipc-desktop-apis.ts`, `src/backend/channel-store.ts` (`clearHistory`), `src/main/ipc/channel-inputs.ts`, `src/main/index.ts` (+5 linii), `src/preload/index.ts`, `src/renderer/stories/mock-openbot.ts`.

## Testy (po jednym pliku)
`channel-store.test` 11/11 (4 nowe: usunięcie i zachowanie reszty, brak tekstu w dzienniku, odmowa przy kolejce/wstrzymaniu/stop, restart), `channel-clear-history.test` 2/2 (parser, odpowiedź, zdarzenie), `ipc-workspace-channels.test` 2/2. Biome czysty, `typecheck:contracts/node/renderer` EXIT 0.

## Luki
- Ekranu nie ma (UI/KK); nic w oknie nie sprawdzone.
- Wątki agentów, w których pracowano nad zadaniami kanału, zostają (to historia agentów, nie kanału).
- „Kompakt” i „przeglądarka w kanale” z wiersza 27 nadal bez silnika.
- Pełny `bun run test` nie biegł.
