# Luki bez silnika względem 0.71: koszt i decyzje

Stan: 17.11.2026, integracja `codex/cosgral-desktop` @ `65eb4de06`. Uzupełnienie do `parytet-0.71.md`.
**Godziny to moja ocena (kontrakt + silnik + testy na atrapach, bez prawdziwych kont i Electrona), nie pomiar.** „Lekkie” = testy jednostkowe z fałszywym serwerem na 127.0.0.1. „Ciężkie” = potrzebne okno programu, prawdziwe CLI albo konto.

## Wynik w jednej linii

**Z czterech luk z zlecenia tylko Discord i część Workflows opłaca się robić; Marketplace (instalacja działa, brakuje treści i linku GitHub) dobrze zrobić częściowo, a stały link w Mobile odradzam. Najwięcej parytetu na godzinę dają jednak ekrany do gotowych silników, nie nowe silniki.**

## 1. Cztery luki ze zlecenia

### 1.1 Marketplace Agents i Skills

| Co | Stan | Koszt | Lekkie/ciężkie | Zalecenie |
|---|---|---|---|---|
| Instalacja skilla i agenta, aktualizacja, odmowa dla lokalnego | **działa** (silnik, testy, w oknie W3-T3) | 0 | — | nic do robienia |
| Więcej treści w katalogu (dziś 8 skilli + 5 agentów, własne teksty) | częściowo | ok. 0,7 h na pozycję: 20 skilli + 10 agentów ≈ 20 h | lekkie, żmudne | **tak, ale mało**: 6 skilli i 4 agenty (~7 h), reszta gdy będzie potrzeba |
| Instalacja skilla z linku GitHub (pobranie, limit 200 plików/10 MB, karta zgody z listą plików) | brak, przycisk dziś „niedostępne” z powodem | ok. 8 h (silnik 5, testy na fałszywym serwerze 2, karta 1) | lekkie, ale kod z internetu | **decyzja Twoja**: tylko z kartą zgody, bez uruchamiania skryptów skilla |
| Publikacja własnego / „submit” do katalogu publicznego | brak (wymaga serwera) | 20 h+ | ciężkie | **nie** (zapis agenta jako szablonu lokalnie już jest) |
| Ekran Agents/Skills używa nowego układu (Featured, kategorie, filtry) | kontrakt i atrapa gotowe (KK-H) | UI 4–6 h, nie silnik | lekkie | UI Designer, najpierw to |

**Decyzja do podjęcia:** czy dopisać skille i agenty (7 h) oraz czy dopuścić link GitHub (8 h, tylko za zgodą).

### 1.2 Workflows: silnik uruchomień vs edytor

Silnik uruchamia: wyzwalacz (ręczny lub z rutyny), krok agenta, zgodę (Allow/Deny), wyjście do kanału; jeden przebieg naraz, ostatnie 100 przebiegów. Edytor z 0.71 rysuje więcej rodzajów węzłów, wersje i adnotacje.

| Węzeł / funkcja | Silnik | Koszt | Lekkie/ciężkie | Zalecenie |
|---|---|---|---|---|
| Condition (rozgałęzienie po tekście poprzedniego kroku, bez pętli) | brak | ok. 5 h (kontrakt 1, silnik 3, testy 1) | lekkie | **tak** (najczęściej używane po zgodzie) |
| Prompt (stały tekst do następnego kroku) | brak | ok. 2 h | lekkie | **tak** (tanie) |
| Wersje przepływu + przywrócenie | brak | ok. 5 h | lekkie | **tak** (zabezpiecza przed zepsuciem przepływu) |
| Adnotacje na płótnie (notatki, tekst) | brak | ok. 3 h; rysowanie odręczne 5 h więcej | lekkie | później |
| LLM (wywołanie modelu bez agenta) | brak | ok. 5 h (ten sam wykonawca co pytanie poboczne) | lekkie | później |
| Asset (plik z Biblioteki do kroku) | brak | ok. 5 h (limity rozmiaru, odczyt tylko za zgodą agenta) | lekkie | później |
| Image / Video (generowanie mediów) | brak | 12 h+ każde, zależy od dostawcy i kredytów | ciężkie | **nie** |
| Katalog GitHub, kredyty mediów | brak | 8 h+ (sieć) | ciężkie | **nie** |

**Decyzja do podjęcia:** czy zlecić Condition + Prompt + wersje (ok. 12 h, lekkie). Reszta później albo wcale. Edytor w oknie używa paletki i karty triggera z kontraktu KK-H (UI Designer).

### 1.3 Mobile: stały link

| Co | Koszt | Ryzyko | Zalecenie |
|---|---|---|---|
| Stały (wielokrotny) link parowania z unieważnianiem i limitem prób | ok. 6 h (magazyn tokenów, unieważnianie, ograniczenie liczby prób, testy) + ekran | Link, który wycieknie (zrzut ekranu, wiadomość), wpuszcza obcego do rozmów z agentami (Vault z telefonu jest zablokowany, ale czaty nie) | **nie** (kod QR z PIN-em i blokadą już jest) |
| Trasa przez chmurę (przekaźnik) | 25 h+, potrzebny serwer | Rozmowy przechodzą przez cudzy serwer | **nie** |

W kontrakcie obie są zapisane jako „niedostępne” z powodem, więc ekran nie ma martwego przycisku. **Decyzja do podjęcia:** potwierdzić „nie”.

### 1.4 Discord (wstrzymany)

| Co | Koszt | Lekkie/ciężkie |
|---|---|---|
| Sterownik na interfejsie komunikatorów (Gateway: łączenie, tętno, wznowienie; REST do wysyłania; tylko rozmowy prywatne; dozwoleni) | ok. 9 h: deskryptor + atrapa 1, sterownik 5, testy na fałszywej bramce 2, raport 1 | lekkie (bez konta); prawdziwy test potrzebuje tokenu bota od właściciela |

Slack miał 290 linii sterownika i 301 linii testów, Discord będzie większy przez Gateway. **Ważne:** Telegram i Slack nie mają jeszcze ekranu w oknie (silnik jest, `window.openbot.messengers` nie jest podpięte w rendererze). Trzeci komunikator bez ekranu to kolejny silnik, którego nikt nie uruchomi.
**Zalecenie:** nie teraz. Najpierw ekran „Komunikatory” (UI 4–6 h), potem Discord, jeśli właściciel go używa. **Decyzja do podjęcia:** wznowić Discorda po ekranie, czy zostawić wstrzymanego.

## 2. Co daje najwięcej parytetu na godzinę (poza tymi czterema)

Wiersze, które mają kontrakt, silnik i testy, a **nie mają ekranu** (w `parytet-0.71.md` stan „częściowo”, E = nie). Ekran robi UI Designer na gotowych kontraktach i atrapach; każdy po zrobieniu zmienia „częściowo” na „jest” (+0,7 punktu procentowego; 9 wierszy razem ok. +5–6 pp).

| Ekran do podpięcia | Kontrakt/atrapa | Orientacyjnie UI |
|---|---|---|
| Komunikatory (Telegram, Slack: status, pola tajne tylko do zapisu, lista dozwolonych) | `messengers`, `messengerDescriptor` | 4–6 h |
| Vault konektory (1Password, Bitwarden, Proton: status, lista logowań) | `vaultConnectors` | 4–5 h |
| Logowanie OAuth do MCP (przycisk, stany, anulowanie) | `mcpOAuth` | 3 h |
| Aktualizacje (tor, restart gdy bezczynny) | `updatePreferences.getOverview` | 3 h |
| Import i Transfer (karty, kroki, lista „co nie jedzie”) | `instanceTransfer`, `importSourceCards` | 4–5 h |
| Katalog 18 dostawców | `providerCatalog` | 4 h |
| Układ Marketplace Agents/Skills; edytor Workflows | KK-H (`ipc-marketplace-screen`, `ipc-workflow-editor`) | 4–6 h i 6–8 h |

## 3. Luki z krótkim kosztem (silnik od zera)

| Luka | Koszt | Zalecenie |
|---|---|---|
| Rutyny kanału | ok. 6 h | później |
| Wstrzymania wątku: restart agenta, serwer zajęty, limit wątków | ok. 5 h | tak, jeśli wątki mają trafić do odbioru okna |
| Cofnij usunięcie wątku | ok. 3 h | tak (tanie, widoczne) |
| Sterowniki innych dostawców (Grok, Cursor, OpenRouter, DeepSeek…) | ok. 8 h katalog→ACP, **ciężkie** (polecenia niezweryfikowane, potrzebne CLI) | tylko za zgodą właściciela na pobranie CLI |
| Vault: pokaż/skopiuj sekret osobie, import CSV | 4 h | **nie** (wartości są świadomie tylko do zapisu) |
| Harmonogram (kalendarz), Biblioteka (siatka), Użycie (wykresy) | w toku u Backendu (BE-H) | nie dubluję |

## 4. Proponowana kolejność (moja)

1. Ekrany do gotowych silników (sekcja 2): ok. 35–40 h UI, **+5–6 pp** parytetu bez ryzyka.
2. Workflows: Condition + Prompt + wersje (12 h).
3. Marketplace: 6 skilli + 4 agenty (7 h), potem link GitHub (8 h) tylko jeśli właściciel chce.
4. Wątki: wstrzymania + cofnięcie usunięcia (8 h), jeśli odbiór okna W6 ma to wymagać.
5. Discord po ekranie komunikatorów. Mobile stały link: nie.

## Czego nie sprawdziłem

1. Godziny nie są pomiarem; największa niepewność: Discord (zachowanie prawdziwej bramki), link GitHub (limity i bezpieczeństwo pobierania), Condition (zasady rozgałęzień a walidacja grafu).
2. Nie uruchamiałem programu ani testów; stan silników z czytania kodu integracji i raportów.
3. Koszty UI to orientacja z wielkości podobnych ekranów, nie plan UI Designera.

## Ustawienia kanału: „nowa rozmowa” i „kompakt” z 0.71 (Backend, BE-Y2, 18.11.2026)

Opis 0.71 wymienia w ustawieniach kanału: pamięć, izolowaną pamięć, „kto używa przeglądarki”, „nowa rozmowa”, „kompakt”, kasowanie historii, rutyny. Co z tego wynika z naszego kodu:

| Pozycja 0.71 | Stan u nas | Dowód w kodzie |
|---|---|---|
| Pamięć kanału, izolacja, rutyny | **jest** (silnik i ekrany) | `channel-store.ts`, `ipc-isolation`, `channel-routines.ts` |
| Kasowanie historii | **jest** (BE-Y: `channels.clearHistory`), ekranu brak | `ChannelStore.clearHistory` |
| „Nowa rozmowa” | **bezprzedmiotowe z założenia**: każde zadanie kanału startuje nową, tymczasową rozmowę dostawcy (`thread/start` z `ephemeral: true` w `ChannelAgentRunner.#run`), więc agent nigdy nie przenosi kontekstu między zadaniami | `src/backend/channel-agent-runner.ts` (`ephemeral: true`) |
| „Kompakt” | **bez odpowiednika, ale jest sensowna wersja**: agent dostaje przy każdym zadaniu ostatnie 200 wiadomości kanału (`CHANNEL_LIMITS.historyPage`) jako dane; długi kanał = dużo kontekstu = wolniej i drożej. Wersja „kompakt” = **okno historii** per kanał (np. 20 / 50 / 100 / 200 ostatnich wiadomości) | `channel-engine.ts` (`listMessages(channel.id)` bez limitu), `channel-store.ts` (`historyPage: 200`) |
| „Kto używa przeglądarki” | zależy od hosta przeglądarki (karty mają właściciela wątku i agenta); osobne ustawienie kanału nie istnieje | `browser-host.ts` (`ownerThreadId`, `ownerBotId`) |

**Propozycja dla lidera:** nie dublować „nowej rozmowy” (nic do zrobienia). „Kompakt” zrobić jako **okno historii kanału** (pole w ustawieniach kanału, domyślnie 200 = dzisiejsze zachowanie, tylko mniej = tańsze zadania). Koszt ok. 3 h (kontrakt, magazyn bez zmiany schematu tabel albo z jedną kolumną, silnik, testy, atrapa), ekran: jedna lista wyboru. Do ustalenia z liderem: czy okno ma zawsze zawierać wiadomość-prośbę zadania (tak: już dziś jest dopinana na początek).
