# Backend W11 – karty ustawień agenta (BE-B, część b)

Gałąź `team/backend/w11-agent-cards` (z `codex/cosgral-desktop` 51f626f5c). Tylko kontrakt, atrapa i testy; bez silnika.

## Mapa 14 kart: co już istnieje, co dopisano

| Karta | Dane / API, które już są | Dopisano |
| --- | --- | --- |
| chat-color | – | `AgentPreferences.chatColor` |
| instructions | `AgentSettings.bot` (opis, rola) | licznik w przeglądzie |
| memory | `window.openbot.memory`, `AgentSettings.memory` | licznik |
| skills | `window.openbot.skills`, `AgentSettings.skills` | licznik |
| files | `window.openbot.library` | licznik |
| tables | `window.openbot.tables` | licznik |
| routines | `window.openbot.routines` | licznik |
| usage | `window.openbot.budgets` | linia w przeglądzie |
| publish | brak w OpenBot 0.71 po stronie lokalnej | karta `available: false` ("Not available in this build") |
| permissions | `window.openbot.access` (poziom), `isolation` | linia w przeglądzie |
| advanced | `AgentSettings.tools` | `busyMessage` (kolejka/sterowanie/domyślne aplikacji), `quickAcknowledgement`, `agentStartsNewChats`, `localScripts`, reset sesji |
| folders | `window.openbot.access.setFolders` | licznik |
| notifications | `UpdateAgentSettingsInput.notifications` (wyciszenie), `NotificationMatrix` | `notificationLevel` all / mentions / none |
| backup-models | `providers.getFallbackInfo`, `resetFallbackModels` | licznik |

## Nowe API `window.openbot.agentCards`
- `overview({botId})`: 14 kart zawsze w stałej kolejności, każda z `available`, `count|null`, `summary` (≤120 znaków).
- `getPreferences` / `updatePreferences`: pola pominięte zostają; zdarzenie `agent-preferences-changed` (cały stan).
- `resetSession`: zapomina sesję dostawcy, historia zostaje; zwraca świeży przegląd.
- `effectiveBusyMessage(prefs, appDefault)`: "steer" przy dostawcy, który nie umie sterować, spada do kolejki; `steerSupported` jest faktem dostawcy i nigdy nie pochodzi od osoby (test).

## Testy
- `packages/contracts/src/ipc-agent-cards.test.ts`: 7 testów (14 kart raz, przegląd w kolejności, liczniki/długość, domyślne, odrzucanie złych wejść, `steerSupported` niezmienne, zdarzenie jako `AgentEvent`).
- Typecheck contracts, node, renderer: czysto. Biome: czysto.

## Czego nie zrobiono / ograniczenia
- Silnik: zapis preferencji (plik JSON w folderze danych), zbieranie liczników z istniejących usług, `resetSession` w `agent-service.ts`, wpięcie w `main/index.ts`: kolejny krok (gałąź `w11-agent-cards`, osobny commit).
- Zachowanie "sterowania" w kolejce wiadomości (`busyMessage`) nie jest jeszcze podpięte do `agent-service.ts`.
- Karta "publish": w tej wersji brak funkcji lokalnej; jeśli właściciel chce eksport agenta jako paczka, to osobne zlecenie.
- Domyślna wartość aplikacji dla `busyMessage` (kolejka/sterowanie) nie ma jeszcze pola w `AppSettings`.
