# KK W12 (2): sterownik komunikatorów i Slack (Socket Mode)

Data: 17.11.2026. Gałąź `team/kk/w12-messengers` (od integracji `6752d67a1`). Tylko testy jednostkowe na atrapach: atrapa Slacka na `127.0.0.1` (Web API + WebSocket Socket Mode), atrapa agenta, baza w pliku tymczasowym. **Żadnego prawdziwego Slacka, tokenu ani wywołania na zewnątrz.** `agent-service.ts` nietknięty. Discord: nie robiłem w tej rundzie (patrz niżej).

## Wynik w jednej linii

**Gotowe: krok 0 (sterownik: most nie zna już klienta Telegrama, Telegram jest pierwszym sterownikiem, jego 47 testów zielone bez zmian) i Slack (kontrakt + atrapa w osobnym commicie, sterownik Socket Mode, tokeny tylko do zapisu i zaszyfrowane, lista dozwolonych rozmów, limity z mostu, IPC lokalne).**

## 1. Krok 0: sterownik

- `src/backend/messenger-driver.ts`: interfejs `MessengerDriver` (`connect`, `identify`, `receive`, `send`, `close`), wiadomość przychodząca (`InboundMessage`), błąd `MessengerFailure` (rodzaje: `token-refused`, `conflict`, `rate-limited`, `network`, `rejected`; **zawsze stałe zdanie**, nigdy tekst usługi ani sieci).
- `src/backend/telegram-driver.ts` opakowuje istniejącego klienta (`telegram-client.ts` bez zmian poza tym, że `TelegramFailure` dziedziczy po `MessengerFailure`).
- `messenger-bridge.ts`: lista dozwolonych, limity, przekazanie do agenta, odpowiedzi wracają tak samo jak w W10; różnice tylko w tym, skąd bierze sterownik (`drivers` w opcjach, domyślnie Telegram/Slack) i znak w rozmowie to `[Telegram]` albo `[Slack]` z nazwy komunikatora.
- `connect(kind, token, appToken?)`: komunikator z dwoma sekretami trzyma je razem w **jednym** zaszyfrowanym tekście (`projection_messengers.token_enc`).

## 2. Slack

1. Właściciel robi aplikację Slack (Socket Mode włączony), wkleja **token bota** (`xoxb-`) i **token aplikacji** (`xapp-`, zakres `connections:write`). Oba tylko do zapisu: nigdzie nie wracają.
2. Program łączy się **na zewnątrz** (WebSocket): brak adresu, brak serwera, brak webhooka. Przy łączeniu sprawdza oba tokeny (`auth.test`, `apps.connections.open`); zły token nie jest zapisywany.
3. **Domyślnie nikt nie ma dostępu.** Dozwolone są tylko **wiadomości prywatne z botem** (numer rozmowy `D…`); kanały i grupy (`C…`, `G…`) są odrzucane przez parser i ignorowane przy odbiorze (wiadomość z kanału jest tylko liczona). Powód: w kanale każda osoba mogłaby sterować agentem. To decyzja do potwierdzenia przez właściciela, jeśli chce kanały.
4. Wiadomość tekstowa z dozwolonej rozmowy trafia do agenta z dopiskiem `[Slack] `; odpowiedź wraca do **tej samej** rozmowy (`chat.postMessage`, zwykły tekst: `mrkdwn: false`, bez podglądu linków). Agent nie dostaje żadnego narzędzia do Slacka.
5. Ignorowane po cichu: własne wiadomości bota, edycje, usunięcia, pliki, inne boty, komendy, kanały; **każda koperta jest potwierdzana od razu** (inaczej Slack wysyła ją ponownie); powtórzone zdarzenie (to samo `event_id`) jest odrzucane.
6. Slack co jakiś czas prosi o ponowne połączenie (`disconnect`) albo gniazdo pada: program otwiera nowe gniazdo sam i czyta dalej (testy: oba przypadki).
7. Błędy Slacka na rodzaje: `invalid_auth`, `token_revoked`, `missing_scope` i podobne → `token-refused` (pętla się kończy, token zostaje do wymiany); `ratelimited` / HTTP 429 → czekanie tyle, ile mówi `Retry-After`; błędy serwera → `network` (ponawianie 2 s… 60 s); `channel_not_found` itp. → `rejected` (odpowiedź wypada).

Limity z mostu bez zmian: 20 rozmów, 4000 znaków wejścia, 10 wiadomości na minutę na rozmowę, 5 czekających odpowiedzi, 8 części po 4000 znaków, 15 min na odpowiedź.

## 3. Pliki

- Kontrakt: `packages/contracts/src/ipc-messengers.ts` (rodzaj `slack`, `appToken`, kształty tokenów, `isSlackConversationId`, `messengerSecretFields(kind)` żeby okno narysowało pola, `MESSENGER_FAILURE_SENTENCES`); atrapa `src/renderer/stories/mock-messengers.ts` (+ `mock-messengers-slack.test.ts`, 8): commit `7552c2eb5`.
- Silnik: `src/backend/{messenger-driver,telegram-driver,slack-driver}.ts`, `messenger-bridge.ts`, `src/main/messengers-ipc.ts` (1 linia: `appToken`), `src/backend/testing/slack-mock.ts`, testy `messenger-driver.test.ts` (3) i `slack-driver.test.ts` (12).
- Kanały IPC bez zmian (`messengers:*`, 6); `local-only-ipc.test.ts`: odmowy i parser dla Slacka bez echa tokenów.

## 4. Dla UI

Okno komunikatorów ma teraz listę z dwoma wpisami (`telegram`, `slack`). Pola do narysowania daje `messengerSecretFields(kind)`; przy Slacku `connect({kind:"slack", token, appToken})`. Numer rozmowy Slacka to `D…`; nazwa nieznanej rozmowy to numer użytkownika (np. `U01ABC…`): program nie dopytuje Slacka o nazwy, żeby nie potrzebować dodatkowych uprawnień.

## 5. Czego NIE sprawdzono (uczciwie)

1. **Prawdziwego Slacka.** Kształty zdarzeń i odpowiedzi Socket Mode (hello, `events_api`, `disconnect`, `auth.test`, `apps.connections.open`, `chat.postMessage`, kody błędów) pochodzą z opisu zachowania 0.71 i mojej wiedzy o Slacku; potwierdzić na dokumentacji i pierwszym ręcznym teście z kontem testowym (do zrobienia przez właściciela).
2. Potrzebne zakresy aplikacji Slack: co najmniej `chat:write`, `im:history`, `im:read` (bot) oraz zdarzenie `message.im` i `connections:write` (app-level): do potwierdzenia na prawdziwej aplikacji.
3. Uruchomienia w Electronie (czekam na GO).
4. **Discord:** nie zaczęty w tej rundzie; kolejny w kolejce. Gateway wymaga identyfikacji, pulsu (heartbeat), wznawiania sesji i zgody „Message Content Intent”; szacunek bez zmian (ok. 12 h), sterownik pasuje do tego samego interfejsu.
5. Nazw rozmówców Slacka (tylko numer użytkownika).
