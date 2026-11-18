# KK W12 (KK-N): ekrany Aktualizacje, OAuth MCP, Komunikatory, Import i Transfer

Data: 18.11.2026. Gałąź `team/kk/w12-screens`. Ekrany w własnych komponentach (tokeny `--cosgral-*`, klasy istniejących paneli), PL/EN w `locales`, testy komponentów po jednym pliku, bez Electrona i Storybooka. Zmiany w cudzych plikach: po jednej linii wejścia (`SettingsModal`, `McpSettings`, `App`, `ServerSettingsPage`).

## Wynik w jednej linii

**Cztery ekrany z listy gotowych silników są teraz w programie: Aktualizacje, logowanie OAuth do MCP, Komunikatory (Telegram i Slack) oraz Import i Transfer; każdy ma stany ładowania, błędu z „Spróbuj ponownie” i pusty, tłumaczenia PL/EN i testy.**

| Ekran | Komponent | Gdzie | `window.openbot.*` | Testy |
|---|---|---|---|---|
| Aktualizacje | `UpdatesPanel` | okno ustawień, w miejsce atrapy z wpisaną wersją „0.1.11” | `updatePreferences.getOverview/get/set/restartWhenIdle/cancelRestartWhenIdle`, `update.check/download/install`, zdarzenia `update-preferences-changed` | 10 |
| Logowanie do serwerów MCP | `McpSignInPanel` | pod listą serwerów MCP (strona Library) | `mcpOAuth.list/signIn/cancel/signOut`, zdarzenie `mcp-oauth-changed` | 6 |
| Komunikatory | `MessengersPanel` | strona Library, pod menedżerami haseł | `messengers.list/connect/disconnect/allowChat/removeChat`, `messengerDescriptor`, zdarzenie `messengers-changed`, `agent.listBots` | 9 |
| Import i Transfer | `InstanceTransferPanel` | działy „Import” i „Transfer” ustawień serwera | `instanceTransfer.summary/exportAgents/choose/apply/discard/importSources` | 9 |

## Co pokazuje każdy ekran

1. **Aktualizacje:** wersja i stan (plakietka), tor Stable/Preview, sprawdzanie, pobieranie, „Restart and install”, automatyczne sprawdzanie i pobieranie (pobieranie wyłączone, gdy wyłączone sprawdzanie), instalacja przy zamknięciu, „Restart when idle” z oczekiwaniem i „Stop waiting”, lista niedostępnych z powodem. Build bez aktualizacji (`unsupported`) pokazuje powód i ukrywa przyciski.
2. **OAuth MCP:** karta serwera ze stanem (wylogowany, czeka na przeglądarkę z odliczaniem 5 minut, kończenie, zalogowany z informacją o odnawianiu, błąd), „Sign in” / „Cancel” / „Sign out” / „Try again”. Błąd to stałe zdanie z programu, nigdy tekst serwera. Panel nie pokazuje się bez `mcpOAuth`.
3. **Komunikatory:** karta na komunikator ze stanem, tokenami tylko do zapisu (pola hasłowe czyszczone po wysłaniu, token nigdy nie wraca), sprawdzeniem kształtu tokenu przed wysłaniem, listą dopuszczonych rozmów (z agentem), listą nieznanych rozmów, które napisały (bez ich treści, z przyciskiem „Allow” wypełniającym formularz), formularzem „Allow this conversation” z podpowiedzią o numerze rozmowy (Slack: tylko `D…`), krokami konfiguracji i stałym zdaniem o błędzie tokenu.
4. **Import i Transfer:** Import: trzy karty (zip, Hermes „niedostępne” z powodem, inny komputer → „Open Transfer”). Transfer: trzy kroki, lista agentów z liczbami, „Export to a .zip file” (wynik z nazwą i rozmiarem albo „Nothing was saved.”), import z podglądem (nic się nie zmienia do potwierdzenia, zajęte imię = kopia z numerem, ostrzeżenia), wynik importu (rutyny wstrzymane), lista „What is never moved”. Niezatwierdzony podgląd jest odrzucany przy zamknięciu strony (`discard`).

## Znalezione i naprawione w trakcie

1. **Wyścig odpowiedzi z wywołania i zdarzenia:** odpowiedź akcji („Sign in”, „Connect”) może być starsza od zdarzenia, które przyszło w międzyczasie, i nadpisać nowszy stan. Panele czytają listę po akcji, a odczyt rozpoczęty przed zdarzeniem jest odrzucany (licznik `serial`). Podobną usterkę (zapis sygnału czytany jeszcze ze starą wartością) znalazł UI Designer przy filtrach; to osobny przypadek. Panel Aktualizacji też bierze tylko najnowszy odczyt.
2. **Atrapa z wpisaną wersją w oknie ustawień** („0.1.11”, przycisk „Check for updates” tylko zmieniający napis) została zastąpiona prawdziwym panelem.

## Testy (jeden plik naraz, `--pool=threads --maxWorkers=1`, maszyna obciążona)

`UpdatesPanel.test` 10/10, `McpSignInPanel.test` 6/6, `MessengersPanel.test` 9/9, `InstanceTransferPanel.test` 9/9, `i18n.test` 9/9 (katalogi PL i EN kompletne, wszystkie literalne klucze tych komponentów), `ServerSettingsPage.test` zielony. `typecheck:renderer` zielony, Biome czysty na moich plikach.

## Czego nie sprawdzono

1. Nic w oknie programu ani w Storybooku; ekrany sprawdzone tylko testami komponentów na atrapach.
2. Prawdziwy Telegram, Slack, logowanie do serwera MCP, pobranie aktualizacji, zapis i odczyt .zip: zależą od kont i okna systemu.
3. `App.test` po dodaniu paneli na stronie Library (cięższy test, maszyna pod obciążeniem); `SettingsModal` bez własnego testu.
4. Wygląd: panele używają istniejących klas (`vault-connector-*`) i stylów okna ustawień; nie oglądałem ich na zrzucie.
5. Komunikatory żyją na stronie Library obok menedżerów haseł; przeniesienie do osobnej sekcji ustawień zależy od decyzji UI Designera.
