# KK W12: konektory Vault, ekran Głos, komunikatory, Mobile Connect, zdalny pulpit, Transfer/Import/Aktualizacje (dla ekranów UI)

Data: 17.11.2026. Gałęzie: `team/kk/w12-vault` (konektory, głos; scalone w integracji `57a747515`) i `team/kk/w12-settings` (reszta). Tylko testy jednostkowe na atrapach, bez Electrona. `agent-service.ts` nietknięty. Materiały 0.71 (zrzuty 016–019, 026, 031–032) tylko do odczytu.

## Wynik w jednej linii

**Dla każdej strony ustawień z listy lider dostał kontrakt, który UI rysuje JEDNYM zapytaniem, z atrapą `window.openbot.*` w stories i testami; czego 0.71 ma, a ta wersja nie, stoi w kontrakcie jako „niedostępne w tej wersji” z powodem.**

| Ekran (zrzut) | `window.openbot.*` | Jedno zapytanie | Zdarzenie |
|---|---|---|---|
| Vault konektory | `vaultConnectors.*` (`listLogins` nowe), `vaultSecrets.*` | `list`, `listLogins({connector})` | `vault-connectors-changed` |
| Głos (013) | `voice.*` (`getOverview`, `openMicrophoneSettings` nowe) | `voice.getOverview()` | `voice-changed` |
| Komunikatory (ustawienia) | `messengers.*` + `messengerDescriptor(kind)` (funkcja kontraktu) | `messengers.list()` | `messengers-changed` |
| Mobile Connect (018) | `mobileConnect.getOverview` (nowe), `mobile.*`, `phone.*` | `mobileConnect.getOverview()` | `phone-access-changed` + zdarzenia `mobile-*` |
| Zdalny pulpit (026) | `remoteDesktop.host.setAskEverySession` (nowe), reszta jak W3; `remoteDesktopSummary(state)` | `host.getState()` | `remote-desktop-host-changed` |
| Computer Use (016) | `computerUse.*` (bez zmian) | `getState()` | `computer-use-changed` |
| Import (031), Transfer (032) | `instanceTransfer.*`; `importSourceCards()`, `TRANSFER_STEPS`, `TRANSFER_NOT_MOVED` | `summary()`, `importSources()` | brak (wynik w odpowiedzi) |
| Aktualizacje (019) | `updatePreferences.*` (`getOverview`, `restartWhenIdle`, `cancelRestartWhenIdle` nowe) | `updatePreferences.getOverview()` | `update-preferences-changed` + stan aktualizacji |

## 1. Vault konektory (pod ekran UI)

- Status połączenia, błędy i kody (`cli-missing`, `cli-signed-out`, `token-rejected`, `locked`, `folder-missing`, `plan`, `unknown`) były już w W11. **Nowe:** `vaultConnectors.listLogins({connector})` daje listę logowań, których agenci mogą użyć (tytuł, strony `hosts`, użytkownik i znacznik kodu tylko gdy lista menedżera je daje: Bitwarden tak, 1Password nie bez odczytu każdego wpisu), posortowaną, do 200, z `truncated`. Nigdy sekretów.
- „Program nie znaleziony”: `vaultConnectorCliName(id)` (`op`/`bw`/`pass-cli`) i `vaultConnectorDownloadPage(id)` (https) do zdania „`op` nie znaleziono” i przycisku pobrania; `setup.cli = "missing"` i kod `cli-missing` już były.
- „Wybór elementu” w sensie karty Needs you „choose” dla logowań z menedżera: karta jest z W2 (`vault-request`, kandydaci to elementy lokalnego Vault); logowania z konektorów agent czyta po adresie strony (`sources()`), więc osobnego wyboru nie ma. Szew z narzędziami agenta nadal po stronie Backendu (`VaultConnectorHub.sources()`).
- Testy: `vault-connectors.test.ts` (+4 na listę), atrapa (+1). Typecheck i Biome zielone.

## 2. Głos (ekran 013)

- `voice.getOverview()` daje całą stronę: stan (modele whisper tiny/base/small z pobieraniem, zgoda, środowisko), głosy Windows, **mikrofon** (`granted`/`denied`/`not-determined`/`restricted`/`unknown` + `canOpenSettings`), **„niedostępne w tej wersji”** z powodem: model Parakeet (inny silnik niż whisper.cpp), dyktowanie w chmurze (wysyłałoby głos), neuronowe czytanie (Supertonic: ciężkie środowisko), głos na żywo przez OpenAI (wysyła głos i odpowiedzi na zewnątrz). `voice.openMicrophoneSettings()` otwiera ustawienia prywatności mikrofonu systemu (Windows, macOS).
- Pobieranie tylko za zgodą (karta w Needs you, jak W3): `downloadModel` → `started | ready | declined`; postęp w `voice-changed`.
- Atrapa `window.openbot.voice` (nie było jej w podglądzie): zgoda, postęp, błąd pobierania, kasowanie, dyktowanie wymaga przełącznika, zgody, środowiska i modelu; ustawienia sprawdzane (tempo 0,5–2, skrót); `simulate.declineNext/progress/failDownload/microphone/speechUnavailable`.
- Testy: `voice-overview.test.ts` 4, `mock-voice.test.ts` 6.

## 3. Komunikatory w ustawieniach

`messengers.list()` daje jeden wpis na komunikator (Telegram, Slack) ze statusem i listą dozwolonych. Nowe: `messengerDescriptor(kind)` (funkcja kontraktu, stały tekst): etykieta, **pola tajne tylko do zapisu** (`token`, dla Slacka też `appToken`), reguła „tylko rozmowy prywatne, nikt domyślnie”, podpowiedź o numerze rozmowy (Slack: `D…`, kanały nie), kroki konfiguracji. Testy: tokeny nie występują w liście, zdarzeniach ani opisie.

## 4. Mobile Connect (zrzut 018)

`mobileConnect.getOverview()` łączy `mobile.getState`, `phone.getState` i listę: **„Your phones”** (telefony z PIN, blokadą, powiadomieniami, ostatnim adresem; najnowszy pierwszy), **trasy** („Through OpenBot” → u nas: tylko ten komputer / sieć lokalna + Tailscale; wybór przekazać do `mobile.startPairing({exposure})` przez `exposureForRoute`), **niedostępne** z powodem: **stały link** (link bez końca wpuściłby każdego, kto go znajdzie; sparowany telefon i tak zostaje sparowany do usunięcia) i **trasa przez chmurę** (rozmowa szłaby przez serwer). „Add phone” = `mobile.startPairing`. Silnik: czyste złączenie w `buildMobileConnectOverview` (to samo w programie i w podglądzie), IPC `mobile-connect:get-overview` tylko lokalnie, bez sekretów. Testy: atrapa 4.

## 5. Zdalny pulpit (zrzut 026) i Computer Use (016)

- Zdalny pulpit w 0.71 ma kartę „host zainstalowany / Unattended: not available / Active sessions 0/4”, wybór „kto może sterować” i przełącznik „Ask on this computer”. U nas: plakietka z `available`/`enabled` (**`remoteDesktopSummary`**: `ready`/`off`/`unavailable` z powodem, sesje aktywne x maksimum, **„unattended: not available” z powodem** (zawsze potrzebna osoba przy komputerze), czas na odpowiedź 60 s, karty czekające). „Kto może sterować” = polityka widza (`ask`/`allow`/`block`, już jest; u nas nie ma członków). **Nowe: przełącznik „Ask on this computer”**: `host.setAskEverySession({enabled})`, pole `askEverySession`, zapis w ustawieniach hosta, silnik: karta przy KAŻDEJ sesji także dla dozwolonego widza (test integracyjny na prawdziwym hoście i kliencie).
- Atrapa `window.openbot.remoteDesktop` (host + klient + `onFrame`; `simulate.viewerConnects/ownerAnswers/unavailable/frame`), której podgląd nie miał.
- Computer Use: ekran „Computer Use is ready” rysuje się ze `computerUse.getState()` (`available`, `unavailableReason`; Windows nie wymaga dodatkowych uprawnień): **bez zmian**, kontrakt wystarcza.
- Billing (017): celowo poza zakresem.

## 6. Import, Transfer, Aktualizacje (zrzuty 031, 032, 019)

- **Import:** trzy karty z tytułem i opisem (`importSourceCards()`: eksport agentów .zip, Hermes (niedostępne z powodem), inny komputer (→ Transfer)); wybór pliku i podgląd to `choose`/`apply`.
- **Transfer:** trzy kroki (`TRANSFER_STEPS`), dwa przyciski (eksport, import), pod nimi stała lista „co nigdy nie jedzie” (`TRANSFER_NOT_MOVED`: klucze API, logowania i tokeny, Vault, wartości MCP, historia, pliki Biblioteki, preferencje programu); lista agentów z liczbami do eksportu (`summary`).
- **Aktualizacje:** `updatePreferences.getOverview()`: tor („Stable”/„Preview” = przełącznik wersji wstępnych, `updateTrackChange`), wersja i stan (`UpdateStatus`), `canUpdate`, przycisk **„Restart when idle”** (`restartWhenIdle`: wymaga pobranej aktualizacji; czeka, aż żaden agent nie pracuje, i restartuje; `cancelRestartWhenIdle`), przełączniki „pobieraj automatycznie” i „instaluj przy zamknięciu”. **Niedostępne z powodem:** „aktualizacje od członków serwera” (nie ma członków) i „What's new” (brak strony z listą zmian). Silnik: `UpdateService.restartWhenIdle/cancelRestartWhenIdle/restartPending` (testy 3), „idle” = brak agenta w stanie `working`.

## 7. Czego NIE sprawdzono i ograniczenia (uczciwie)

1. **Wszystko w oknie Electrona:** ekrany nie narysowane (to UI), IPC tylko lokalnie sprawdzone testem kanałów i parserów; okna wyboru, ustawień systemu (mikrofon) i restart aktualizacji nie uruchamiane.
2. **Prawdziwe `op`/`bw`**, prawdziwy zdalny pulpit w oknie (jest test integracyjny hosta i klienta na loopbacku), prawdziwe sprawdzanie i pobieranie aktualizacji (w buildzie instalacyjnym).
3. 1Password `listLogins` nie zna użytkownika ani kodu bez odczytu wpisu (celowo: koszt limitu konta usługi).
4. „Restart when idle” liczy „bezczynny” z `working`; agent czekający na kartę nie blokuje restartu.
5. Trasa „przez chmurę”, stały link, członkowie serwera, Parakeet/Supertonic/głos na żywo, Hermes: **świadomie nieobsługiwane**, z powodem w kontrakcie.
6. Test integracyjny zdalnego pulpitu `takes control away…` raz zawiesił się pod obciążeniem komputera; dwa kolejne przebiegi pojedynczo 28/28 (nie związane ze zmianą).
