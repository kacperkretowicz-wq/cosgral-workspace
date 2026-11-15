# Backend W4-BE: naprawy rdzenia (krok 1 W4) i test połączeń z prawdziwym modelem

Gałąź `team/backend/w4-core` od `codex/cosgral-desktop` @ `29f0f512f` (z przeniesionym WIP `efb273cca`), bez push. Plan: `docs/cosgral/PLAN-W4.md`. Zasada W4: „gotowe” to działanie w prawdziwym oknie. Każda naprawa ma więc test jednostkowy i krok w `sandbox:e2e` (prawdziwy Electron w piaskownicy). Kodu OpenBota nowszego niż `a6fe240` nie czytałem.

## Wynik w skrócie

| # | Zadanie | Wynik | Dowód | Commit |
|---|---|---|---|---|
| 1 | W4-BE2: zadanie w nowym kanale na atrapie kończy się „Failed” | ✓ błąd atrapy, nie silnika. Lider deleguje do członka, zadanie kończy się „Done” | test atrapy 2/2, krok e2e „channel” | `c9e50e560` |
| 2a | Start Codex nieudany → „Thinking”, zablokowane pole, brak Stop | ✓ trzy przyczyny naprawione, karta z powodem i „Try again” | testy 2 + 3, krok e2e „blocked” | `8f7def35d` |
| 2b | „disk I/O error” przy starcie po awarii | ✓ prawdopodobna przyczyna naprawiona: ponowienie otwarcia bazy | test 4/4 | `8f7def35d` |
| 3 | W4-BE1: jedno źródło stanu dostawcy | ✓ brak Claude CLI = „Not installed” w onboardingu, Providers i Usage | testy rejestru 8/8, test silnika, krok e2e „providers” | `32d71efc9` |
| 4 | W4-T2 lekki: test połączeń z prawdziwym modelem | ✓ prawdziwy Codex: 4 z 4 tur przeszły | `sandbox:real-codex` | `eded4b471` |

**`sandbox:e2e`: 22/22 kroków, 0 wpisów w konsoli.** 19 starych kroków plus 3 nowe: kanał, dostawcy, CLI, które nie wstaje.

## 1. Kanał na atrapie kończył się „Failed”

**Przyczyna:** atrapa Codex (`channel-codex.cjs`), nie silnik. Jej lider zawsze przydzielał pracę `members[1]` i `members[2]`. W kanale z mniej niż trzema członkami wywołanie `assign` szło do nikogo, tura rzucała błąd, a silnik słusznie zapisywał „failed”.

**Naprawa:** lider deleguje do członków innych niż właściciel zadania (jednego albo dwóch). Lider bez członków odpowiada od razu. Silnik kanałów bez zmian.

**W prawdziwym oknie:** kanał z liderem i jednym członkiem, jedna wiadomość osoby. Stany głównego zadania: queued → running → waiting → queued → running → done. Zadanie członka kończy się „done” i jest wiadomość z wynikiem (`evidence/channel-outcome.json`).

## 2a. CLI, które nie wstaje, zostawiało agenta w „Working”

Znalazłem trzy przyczyny:
1. **Za krótki limit:** `codex --version` miał 5 s. Przy 1,3 GB wolnego RAM pierwszy start trwał dłużej (antywirus, skrót `.cmd` przez Node), więc program uznawał CLI za zepsute. Złapał to mój pierwszy przebieg e2e tej nocy: „Codex CLI was found but could not be started”, choć kanał chwilę później działał. **Teraz:** 20 s, dwie próby i osobny komunikat o przekroczeniu czasu.
2. **Nic nie ponawiało startu,** a wiadomości „w toku” (np. sprzed awarii) zostawały „starting” lub „running”. Silnik uzgadniał je tylko wtedy, gdy jakieś CLI było gotowe, więc wskaźnik „Working” wisiał bez końca. **Teraz:**
   - gdy żadne CLI nie działa, takie wiadomości kończą się jako przerwane (`interrupted`), nigdy nie są powtarzane (ta sama zasada co po restarcie);
   - karta nad rozmową ma przycisk **Try again**. Woła `agent.retryStart()` (IPC `agent:retry-start`, tylko ten komputer) i uruchamia CLI od nowa ze świeżym limitem restartów.
3. **Komunikaty** kazały restartować program. Teraz mówią „then choose Try again”.

Wysyłanie przy niedziałającym CLI dalej jest odrzucane czytelnym błędem. To zachowanie bazy, zostawiłem je.

**W prawdziwym oknie** (trzecie uruchomienie w `sandbox:e2e`, atrapa wyłączona plikiem-znacznikiem):
- karta „Agent CLI setup required” podaje powód i ma „Try again”;
- żaden wskaźnik „Working” się nie pokazuje;
- po usunięciu znacznika „Try again” przywraca pracę: wiadomość dostaje odpowiedź (`evidence/08-blocked.png`, `09-after-try-again.png`).

## 2b. „disk I/O error” po awarii

**Prawdopodobna przyczyna** (nie odtworzyłem błędu na żądanie):
- po zabiciu procesu Windows zwalnia uchwyty do `openbot.db-wal` i `-shm` z opóźnieniem (proces potomny Electrona, skan antywirusa);
- `PRAGMA journal_mode = WAL` szło przed `busy_timeout`, więc nie czekało na blokadę.

**Naprawa:**
- `busy_timeout` jako pierwsze polecenie;
- otwarcie bazy ponawiane przy błędach I/O, BUSY, LOCKED i CANTOPEN, łącznie ok. 4 s;
- potem komunikat: „poczekaj kilka sekund i uruchom ponownie”. Inne błędy (np. uszkodzony plik) nie są ponawiane.

## 3. Jedno źródło stanu dostawcy

Onboarding czytał stany CLI z silnika (`AgentStatus.providers`). Providers i Usage czytały rejestr, który znał tylko limity, i mówiły „Available”.

**Teraz:**
- silnik przekazuje każdą zmianę stanów do rejestru (jedna linia w `#setStatus`);
- `listUsage` zwraca CLI, które nie jest dostępne, jako `unavailable`, ze słowami pickera („Not installed”, „Sign in required”, „Checking”…) i powodem z silnika;
- limity działają dalej, gdy CLI jest dostępne.

**W prawdziwym oknie:** status Claude to `not-installed`, w Usage Claude jest `unavailable`, „Not installed: Claude CLI was not found…”, a Codex `ok`.

## 4. Test połączeń z prawdziwym modelem

**Bezpieczeństwo:**
- stan logowania sprawdziłem poleceniem `codex login status`, które wypisuje tylko „Logged in using ChatGPT”;
- pliku logowania nie czytałem ani nie kopiowałem;
- program działał w piaskownicy, a Codex brał logowanie z istniejącego `CODEX_HOME` (domyślny folder Codex właściciela) na miejscu;
- zmienną `CLAUDE_CONFIG_DIR` z mojego środowiska usunąłem przed startem, bo wskazuje konto dostawcy OpenBota, a jego dane mają zostać nietknięte.

| Tura | Wynik | Czas |
|---|---|---|
| Start, pierwsze uruchomienie z prawdziwym Codex CLI 0.167.2 | ✓ stan „ready”, modele gpt-5.6-luna/terra/sol | 38 s |
| 1. Rozmowa („odpowiedz jednym słowem: OK”) | ✓ „OK” | 6 s |
| 2. Karta pytania (narzędzie `ask_user`, odpowiedź przez API okna) | ✓ karta, potem „OK” | 4 s |
| 3. Karta zgody (`cosgral_cards.confirm`, decyzja Send) | ✓ karta, potem „OK” | 5 s |
| 4. Kanał z liderem | ✓ zadanie „done”, wynik „OK” | 5 s |

0 błędów konsoli. Wynik z czasami jest poza repo, w piaskownicy (`real-codex.json`); zawiera e-mail konta, więc nie trafia do repozytorium.

**Claude:**
- CLI **jest** zainstalowane: `%USERPROFILE%\.local\bin\claude.exe`, wersja 2.1.325. Program sprawdza to miejsce sam.
- Jest też logowanie właściciela w domyślnym folderze Claude. Sprawdziłem tylko, że plik istnieje, nie czytałem go.
- Tury z Claude nie robiłem, bo zadanie mówiło „opisz”.
- Jak podłączyć: uruchomić COSGRAL normalnie (bez nadpisanego `CLAUDE_CONFIG_DIR`). Na ekranie „Set up this computer” Claude powinien pokazać „Available”. Jeśli pokaże „Sign in required”, właściciel uruchamia u siebie `claude auth login`.
- W piaskownicy trzeba by dać `OPENBOT_CLAUDE_PATH` i `CLAUDE_CONFIG_DIR` wskazujący folder Claude właściciela, analogicznie do `CODEX_HOME`.

**Ollama:** nie ma jej na tym komputerze (brak w `PATH` i w `%LOCALAPPDATA%\Programs\Ollama`, nic nie słucha na porcie 11434). Endpointy OpenAI-compatible i Ollama to W5.

## Weryfikacja

| Sprawdzenie | Wynik |
|---|---|
| `typecheck:node`, `typecheck:renderer` | kod 0 |
| `biome` na plikach gałęzi | 0 błędów |
| Nowe i zmienione testy (po jednym pliku) | `channel-codex` 2/2, `cli-timeout` 3/3, `cli` 10/10, `database-open-retry` 4/4, `openbot-database` 4/4, `provider-registry` 8/8, cały `agent-service.test.ts` 67/67 |
| `bun run build` | kod 0 |
| `sandbox:e2e` | 22/22, 0 wpisów w konsoli |
| `sandbox:real-codex` | 5/5 kroków (start + 4 tury) |

## Czego nie sprawdziłem

- **„disk I/O error” na żądanie:** błędu nie odtworzyłem (u KK zdarzył się 1 raz na 2). Naprawa celuje w najbardziej prawdopodobną przyczynę i jest sprawdzona testem logiki ponowień. Prawdziwy przebieg „zabij proces i od razu uruchom” warto dodać do odbioru KK.
- **Karta zgody na polecenie (approval):** przy pełnym dostępie Codex nie pytał o zgodę na komendę. Sprawdziłem kartę potwierdzenia (`confirm`), nie kartę „approval” dla komendy.
- **Tury z Claude i z innym dostawcą zapasowym:** tylko stan i opis.
- **Inne rzeczy:**
  - wygląd przycisku „Try again”: oglądałem jeden zrzut w ciemnym motywie;
  - pełny `bun run test` i `bun run check`;
  - instalator.
- **Skutki testu Codex:**
  - Codex zapisał swoje pliki sesji (4 krótkie rozmowy) w folderze Codex właściciela, bo `CODEX_HOME` był używany na miejscu;
  - test zużył 4 krótkie tury z subskrypcji.

## Zostawione w systemie

Piaskownice poza repo w `Shared\cosgral-sandbox\{w4-e2e1…w4-e2e4, w4-real-codex}`.
