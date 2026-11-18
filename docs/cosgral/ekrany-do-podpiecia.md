# Ekrany do podpięcia: gotowe kontrakty i silniki bez ekranu w oknie

Stan: 18.11.2026, integracja `codex/cosgral-desktop` @ `b1e28ab8f`. Lista dla UI Designera: kontrakt, atrapa i silnik są, w rendererze brak komponentu, który czyta to API (sprawdzone grepem `window.openbot.<nazwa>` w `src/renderer/src`, bez testów i stories). Godziny UI to moja orientacyjna ocena, nie plan UI.

## Wynik w jednej linii

**Dziewięć ekranów ma gotowe API, atrapę i testy, a nie ma komponentu; razem ok. 35–40 h UI i ok. +6 punktów procentowych parytetu (każdy „częściowo” → „jest” to +0,7 pp).**

Już podpięte (nie ma ich na liście): Vault konektory (`VaultConnectorsPanel`), Biblioteka, Użycie, Harmonogram, menu wiadomości, karty agenta, ustawienia serwera, Zadania.

## Kolejność (największy zysk na godzinę)

| # | Ekran | Gdzie w programie | `window.openbot.*` (wywołania) | Zdarzenie | Funkcje czyste i stałe z kontraktu | Godz. UI |
|---|---|---|---|---|---|---|
| 1 | **Komunikatory** (Telegram, Slack) | Ustawienia → nowa sekcja „Komunikatory” (lub Marketplace → Aplikacje) | `messengers.list`, `.status`, `.connect`, `.disconnect`, `.allowChat`, `.removeChat` | `messengers-changed` | `messengerDescriptor(kind)` (pola tajne, kroki, podpowiedź o numerze rozmowy), `MESSENGER_FAILURE_SENTENCES` | 4–6 |
| 2 | **Logowanie OAuth do MCP** | Panel MCP, wiersz serwera ze statusem „needs-login” | `mcpOAuth.list`, `.status`, `.signIn`, `.cancel`, `.signOut` | `mcp-oauth-changed` | `MCP_OAUTH_STATES`, `MCP_OAUTH_ERROR_SENTENCES` (stałe zdania błędów) | 3 |
| 3 | **Aktualizacje** | Ustawienia aplikacji → „Aktualizacje” | `updatePreferences.getOverview`, `.get`, `.set`, `.restartWhenIdle`, `.cancelRestartWhenIdle` | `update-preferences-changed` | `UPDATE_TRACKS`, `updateTrackChange` (przełącznik toru Stable/Preview) | 3 |
| 4 | **Import i Transfer** | Ustawienia serwera → działy „Import” i „Transfer” | `instanceTransfer.summary`, `.exportAgents`, `.choose`, `.apply`, `.discard`, `.importSources` | (wynik w odpowiedzi) | `importSourceCards()`, `TRANSFER_STEPS`, `TRANSFER_NOT_MOVED` (lista „co nie jedzie”) | 4–5 |
| 5 | **Katalog 18 dostawców + klucze** | Ustawienia serwera → „Providers” i pasek wyboru dostawcy w Nowym agencie | `providerCatalog.list`, `.setKey`, `.clearKey`, `.addKey`, `.removeKey`, `.setKeyEnabled` | `provider-catalog-changed` | `maskProviderKey`; klucze: `keys[]` (maska, włączony, `limitedUntil`), stan „unverified” przy poleceniach ACP | 4 |
| 6 | **Mobile Connect jednym zapytaniem** | Strona Mobile Connect (dziś na starszym API) | `mobileConnect.getOverview` (+ `mobile.startPairing({exposure})`) | `phone-access-changed`, `mobile-changed` | `MOBILE_UNAVAILABLE_FEATURES` (stały link i chmura: „niedostępne” z powodem), `exposureForRoute` | 2–3 |
| 7 | **Głos: przegląd i mikrofon** | Ustawienia → Głos (dziś `VoiceSettings` na starszym API) | `voice.getOverview`, `voice.openMicrophoneSettings` | `voice-changed` | `VOICE_UNAVAILABLE_FEATURES`, `MICROPHONE_STATUSES` | 2–3 |
| 8 | **Marketplace Agents/Skills: układ jak 0.71** | Marketplace (dziś stara lista) | `marketplace.*` (już używane) | `marketplace-changed` | `layoutMarketplace`, `MARKETPLACE_TABS`, `MARKETPLACE_SOURCE_FILTERS`, `marketplaceAction`, `marketplaceItemAvatar`, `marketplacePageState`, `parseMarketplaceQuery` (link GitHub = „niedostępne”) | 4–6 |
| 9 | **Edytor Workflows jak 0.71** | Strona Workflows (dziś stary edytor z mostem) | `workflows.*` + `listVersions`, `getVersion`, `restoreVersion` | `workflows-changed`, `workflow-run-changed` | `workflowPalette`, `workflowTriggerCard`, `addWorkflowNode`, `connectWorkflowNodes`, `createWorkflowHistory`, `checkWorkflowDraft`, `workflowRunState`, `diffWorkflowGraphs`, `describeWorkflowCondition` | 6–8 |
| 10 | Zdalny pulpit: przełącznik „Pytaj na tym komputerze” i plakietka | Strona zdalnego pulpitu | `remoteDesktop.host.setAskEverySession`, `host.getState` | `remote-desktop-host-changed` | `remoteDesktopSummary(state)` (plakietka ready/off/unavailable), `REMOTE_DESKTOP_UNATTENDED` („bez nadzoru: niedostępne” z powodem) | 1–2 |

## Stany do narysowania w każdym ekranie

1. **Ładowanie, błąd z „Spróbuj ponownie”, pusto**: wszystkie wywołania odrzucają obietnicę ze zdaniem po angielsku; ekran pokazuje to zdanie bez zmian.
2. **„Niedostępne w tej wersji”**: pozycje z listy `*_UNAVAILABLE_*` pokazuj przyciemnione z `reason` (nie ukrywaj), żeby nie było martwych przycisków.
3. **Pola tajne** (tokeny komunikatorów, klucze dostawców): tylko do zapisu, czyszczone po wysłaniu, nigdy nie wracają w odpowiedzi (maska zamiast wartości).
4. **Karta zgody** (pobranie modelu głosu, zdalny pulpit): to zwykła karta w „Needs you”, ekran tylko pokazuje, że czeka.

## Czego nie ma i nie planujemy w tych ekranach

Discord (wstrzymany), WhatsApp, stały link i chmura w Mobile, katalog publiczny i link GitHub w Marketplace, tryb zdalnego pulpitu bez nadzoru. Decyzje i koszty: `docs/cosgral/parytet-0.71.md` → „Decyzje” oraz `luki-silnika-071.md`.

## Czego nie sprawdziłem

1. Nie otwierałem ekranów w oknie ani w Storybooku; lista pochodzi z grepa po rendererze i z kontraktów.
2. Godziny UI są szacunkiem z wielkości podobnych ekranów (np. VaultConnectorsPanel).
3. Nazwy wywołań wzięte z interfejsów `*DesktopApi` w kontraktach na `b1e28ab8f`; jeśli UI-N zmieniło kontrakt, sprawdź w `packages/contracts/src/ipc-desktop-apis.ts`.
