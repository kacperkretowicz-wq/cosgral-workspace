# Backend B1: rdzeń COSGRAL Workspace na Windows (12.11.2026)

Gałąź `team/backend/b1-local-core` (worktree `Shared\cosgral-wt\desktop-backend`), scalona z `codex/cosgral-desktop` @ `f42d104d6`. Czas: ok. 5 h.

## Następny krok

1. **Lider (ok. 20 min):** przegląd i scalenie 4 commitów z tej gałęzi (lista w sekcji 8).
2. **Właściciel (2 min, tylko jeśli chce agenta Claude):** w profilu, w którym działa COSGRAL, uruchomić `claude auth login` i zalogować się w przeglądarce. Bez tego agent Claude pokazuje „sign-in-required”. Sekcja 4.3.
3. **UI Designer:** kontrakt dla B4 jest w sekcji 6. Najważniejsze: flaga `localProfile` (ukryć „Sign out”) i lista braków dla „Needs you”.

## Werdykt

| Cel B1 | Stan | Dowód |
|---|---|---|
| Program działa bez zewnętrznej usługi kont | ✓ profil lokalny właściciela | sekcja 1, run 1–8 |
| `test:backend` na Windows | ✓ **102/102** (przed: 29/96) | sekcja 2 |
| Cały zestaw testów (`bun run test`) | ✓ **455/455** (przed: 367/441) | sekcja 2 |
| Agent Codex odpowiada w czacie | ✓ prawdziwy Codex CLI 0.167.2: „pong” po 5,2 s | run 7 |
| Agent Claude odpowiada w czacie | — brak logowania Claude w profilu piaskownicy | sekcja 4.3 |
| Instalator `dist:win` (NSIS) | ✓ `COSGRAL Workspace-0.2.0-x64.exe`, 169 MB | sekcja 5 |
| Start zbudowanej aplikacji w piaskownicy | ✓ czat działa, zamknięcie czyste | run 8 |
| Instalacja NSIS w piaskownicy | — nie uruchomiona: instalator pisze do rejestru HKCU i menu Start prawdziwego profilu | sekcja 5 |

Przy okazji znalazłem i naprawiłem **4 błędy produkcyjne** (sekcja 3). Dwa z nich blokowały agentów na tym PC: przez spację w ścieżce profilu Windows Codex nie startował, a Claude wyglądał na wylogowanego.

## 1. Konta lokalne: decyzja

**Wybór: lokalny profil właściciela** (`src/main/local-owner-account.ts`), a nie lokalny serwer kont na loopback.

Dlaczego nie lokalny `apps/auth-api`:
- to aplikacja Cloudflare Workers (TanStack Start + D1 + `wrangler`);
- jej zaszyfrowane `.env` wymaga klucza `.env.keys`, którego nie mamy;
- logowanie idzie kodem z e-maila (SMTP);
- byłby to dodatkowy proces do uruchamiania i pilnowania.

Profil lokalny nie ma żadnej z tych zależności.

Jak działa:
- Przy pierwszym starcie powstaje `cosgral-local-owner-v1.json` w `userData`. Zawiera stałe ID (UUID), techniczny e-mail `owner-<8 znaków>@cosgral.local` (unikalny dla instalacji, nigdzie nie wysyłany), nazwę konta Windows i opcjonalny awatar.
- Stan konta to od razu `signed_in` z flagą `localProfile: true` (nowe, opcjonalne pole w `CentralAuthState`, `packages/contracts/src/ipc-app-auth.ts`).
- Ekran logowania znika. Odczyt rozmów, konfiguracja i agenci nie zwracają już błędu „Sign in to COSGRAL Workspace first”.
- Awatar zapisuje się lokalnie i wraca jako `data:` URL (CSP już na to pozwala).
- „Sign out”, kod e-mail i „retry” nic nie psują: profil zostaje zalogowany.
- Uszkodzony plik profilu jest odkładany jako `.corrupt-<czas>`, a profil powstaje od nowa.
- Stara usługa kont (`CentralAuthManager` z 0.1.11) działa nadal, ale tylko po ustawieniu `OPENBOT_AUTH_API_URL`.

Czego profil lokalny nie robi (wymaga usługi w chmurze, wraca w W3 jako LAN/Tailscale z biletami naszego serwera):
- publikacja serwera zespołu przez tunel Cloudflare;
- zaproszenia e-mailem;
- dołączanie do cudzego serwera biletem konta.

Każda z tych akcji zwraca teraz czytelny komunikat zamiast błędu 401.

Testy: `src/main/local-owner-account.test.ts`, 8 testów, m.in. „brak żadnego zapytania sieciowego”, „ten sam właściciel po restarcie”, „uszkodzony plik”.

## 2. Testy na Windows

| Zestaw | Przed (12.11, po scaleniu `f42d104d6`) | Po |
|---|---|---|
| `bun run test:backend` | 29/96 | **102/102** (85 s; wcześniej dwa przebiegi 101/101, zanim doszedł test z sekcji 3, pkt 4) |
| `bun run test` (wszystko) | 367/441, 74 błędy w 12 plikach | **455/455**, 59 plików, 436 s, bez niezłapanych błędów |
| `typecheck:node`, `typecheck:renderer`, `typecheck:contracts`, `biome check` (zmienione pliki) | — | 0 błędów |

Przyczyny i naprawy (74 padające testy z logu „przed”, po plikach):

| Plik | Padało | Przyczyna | Naprawa |
|---|---|---|---|
| `agent-service.test.ts` | 29 | atrapa Codex to skrypt `#!/usr/bin/env node`, którego Windows nie uruchomi; do tego `EBUSY` przy sprzątaniu | `src/backend/testing/fake-cli.ts`: na Windows `.cmd` + skrypt Node, w folderze ze spacją (jak prawdziwe ścieżki); zamykanie bazy |
| `mailbox-store.test.ts` | 18 | `EBUSY`: test usuwa folder z otwartą bazą SQLite; 1 test wymaga symlinku pliku (tryb dewelopera) | `src/backend/testing/databases.ts` zamyka bazę przed sprzątaniem; na Windows junction katalogu zamiast symlinku (sprawdzone mutacją: bez kontroli ścieżki test pada) |
| `bot-store.test.ts` | 15 | `EBUSY` | jak wyżej |
| `app-server-client.test.ts` | 3 | atrapa CLI + start przez `shell: true` (sekcja 3) | atrapa `.cmd` + poprawka produkcyjna |
| `claude-client.test.ts` | 1 | atrapa `/bin/sh` + `shell: true` | atrapa Node + poprawka produkcyjna |
| `openbot-database.test.ts`, `remote-desktop-credential-store.test.ts` | 2 | prawa pliku `0600` (Windows nie ma praw POSIX; Node zwraca `0666`) | asercja tylko poza Windows (plik chroni ACL profilu) |
| `app-icon.test.ts`, `dev-services.test.ts`, `reset-dev-state.test.ts` | 3 | ścieżki `/` zamiast `\` | porównanie niezależne od systemu; `reset-dev-state` buduje ścieżki macOS/Linux jako POSIX |
| `central-auth-manager.test.ts` | 1 | okno 100 ms pod obciążeniem pełnego zestawu | okno 2 s, odstępy między próbami nadal sprawdzane |
| `App.test.tsx` | 2 | **nieaktualne asercje z 0.1.11** (padają też w czystej bazie) | przycisk kolejki nazywa się „Delete queued message”, a nie „Cancel…” (tak jak w `QueuePanel` i jego teście). Czat z agentem w 0.1.11 nie pokazuje, że kolega pisze; robią to tylko czat bezpośredni i panel zespołu. Test sprawdza teraz to, co ma w nazwie: wysyłanie stanu „pisze” |

Po naprawach wyszły jeszcze flaki pod obciążeniem: testy agentów trwają tu do 4,6 s przy limicie 5 s, a dwa testy porównywały log atrapy ze zdarzeniem serwisu, zanim ono przyszło. Na Windows limit wynosi teraz 20 s, a czekanie 10 s; testy czekają na warunek, który sprawdzają.

Logi: `Shared\cosgral-data\desktop-backend\logs\b1\test-all-before.log`, `test-backend-final.log`, `test-all-final.log`.

## 3. Błędy produkcyjne znalezione na Windows (naprawione, każdy z testem)

1. **Start CLI przez `shell: true`.** `cmd.exe` dzielił ścieżkę ze spacją. Dowód: próbka z folderem `Codex CLI` zwracała `'…\Codex' is not recognized`, a ta sama ścieżka w cudzysłowie działała. Skutek na tym PC (profil ze spacją w nazwie):
   - Codex App Server kończył się kodem 1;
   - `claude auth status` zwracał błąd, więc Claude wyglądał na wylogowanego.

   Naprawa: `cliCommand()` w `src/backend/cli.ts`. Shimy `.cmd`/`.bat` startują przez `cmd.exe` z cudzysłowami i dosłownymi argumentami, a pliki `.exe` bez powłoki. Argumenty do shimów są sprawdzane (np. `&` jest odrzucane). Red-green: po przywróceniu `shell: true` test Claude znów pada (`account: null`).
2. **Spóźnione wyjście po `stop()`.** Za `codex.cmd` stoi proces Node, który żyje chwilę dłużej niż `cmd.exe`. Klient przekazywał jego wiadomości dalej, a serwis zapisywał je do bazy, nawet zamkniętej. Naprawa: zatrzymany klient ignoruje wyjście. Test: 3/3 czerwone przed poprawką, potem zielone.
3. **Bufor strumienia po `stop()`.** Fragmenty odpowiedzi od zamykanego klienta ustawiały timer zapisu po zatrzymaniu serwisu. Naprawa: `#bufferDelta` nic nie robi, gdy serwis się zatrzymuje.
4. **„Read state failed” po każdym wysłaniu wiadomości** (błąd bazy 0.1.11, widoczny na każdym systemie).
   - Przyczyna: renderer oznacza „przeczytane” do `receipt.messageId`, a rozmowa zna wiadomość użytkownika pod ID dostawy (`delivery.id`).
   - Skutek: gdy agent miał już wątek, w czacie pojawiała się karta błędu.
   - Naprawa: `markConversationRead` przyjmuje ID wysłanej wiadomości i zamienia je na ID dostawy (`MailboxStore.deliveryIdForMessage`).
   - Weryfikacja: run 6 bez błędu, przed poprawką błąd był w run 3 i 5.

## 4. Pełny przebieg w piaskownicy

Procedura (skrypty poza repo, w `Shared\cosgral-data\desktop-backend\`):

- `run-sandbox.ps1` ustawia osobne `USERPROFILE`/`HOME` z `AppData\Roaming` i `AppData\Local`, a także `APPDATA`, `LOCALAPPDATA`, `TEMP` i ograniczony `PATH`.
- Usuwa zmienne `CLAUDE*`, `ANTHROPIC*`, `OPENAI*`, `CODEX*`, `OPENBOT*`.
- Uruchamia Electron z `--remote-debugging-port=0`. DevTools nasłuchuje tylko na 127.0.0.1.
- `cdp-drive.mjs` steruje oknem tak jak użytkownik: klik myszą, wpisanie tekstu, Enter. Robi zrzuty i zapisuje e-maile kont jako `<redacted>`.
- Po każdym przebiegu skrypt zamyka okno i sprawdza, czy nie zostały procesy oraz czy prawdziwe `%APPDATA%\COSGRAL Workspace Dev` jest nietknięte.

| Run | Konfiguracja | Wynik |
|---|---|---|
| 1 | bez CLI (stan tego PC) | profil lokalny `signed_in`, ekran konfiguracji, potem główne okno z „Complete agent CLI setup to start”. Status mówi dokładnie: Codex i Claude „not-installed” |
| 2–3 | atrapa Codex + `claude.exe` z SDK | czat działa; znaleziony błąd „Read state failed” (sekcja 3, pkt 4) i wyciek środowiska (sekcja 7) |
| 4–5 | atrapa (unikalne ID, strumień w czasie) | 2 wiadomości, 2 odpowiedzi, poprawna kolejność; potwierdzenie, że błąd „przeczytane” jest w programie, a nie w atrapie |
| 6 | po poprawce „przeczytane” | 2 wymiany, **bez błędów**, kursor „przeczytane” na ostatniej odpowiedzi |
| 7 | **prawdziwy Codex CLI 0.167.2** (`Shared\tools\codex-cli`, ścieżka ze spacją) | stan `available`, „Reply with exactly one word: pong” → **„pong” po 5,2 s**, zapis w bazie, bez błędów |
| 8 | **zbudowana aplikacja** `dist\win-unpacked` + atrapa | profil lokalny, konfiguracja, agent, odpowiedź po 1,5 s, zamknięcie 1,3 s |

We wszystkich przebiegach okno zamknęło się czysto (0,5–2,7 s), nie został żaden proces, a prawdziwe `APPDATA` jest nietknięte.

Dowody: `Shared\cosgral-data\desktop-backend\evidence\b1\run1-no-cli … run8-packaged\`. Każdy folder ma zrzuty PNG, `drive.log`, `cdp-drive-log.json` i `summary.json`. Zrzuty nie trafiły do repo, bo pokazują nazwę konta Windows.

### 4.1 Atrapa Codex

`stub-codex\Codex Stub\codex.cmd` to minimalny Codex App Server po stdio. Każda odpowiedź zaczyna się od „COSGRAL stub (not a model)”. Atrapa sprawdza drogę Windows (start `.cmd` ze ścieżki ze spacją, JSON-RPC, SQLite, UI), ale **nie jest modelem**. Odpowiedź prawdziwego modelu potwierdza dopiero run 7.

### 4.2 Codex: działa

- Codex CLI zainstalowałem tylko w `Shared\tools\codex-cli` (`npm --prefix`, cache w `Shared\tools\npm-cache`). Wersja 0.167.2; minimum programu to 0.144.1.
- **Uwaga o izolacji:** Codex na Windows trzyma logowanie w Menedżerze poświadczeń Windows, wspólnym dla użytkownika. Dlatego w piaskownicy był zalogowany kontem ChatGPT właściciela. Run 7 zrobił na tym koncie jedną krótką turę („pong”).
- Program instalowany normalnie znajdzie Codex w `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe` lub `%APPDATA%\npm\codex.cmd`. Na tym PC żadnej z tych ścieżek nie ma, czyli **Codex nie jest zainstalowany systemowo**. Potrzebna instalacja Codex CLI ≥ 0.144.1. Logowanie już jest.

### 4.3 Claude: czego brakuje

- **Plik wykonywalny jest.** SDK `@anthropic-ai/claude-agent-sdk` 0.3.232 zawiera `claude.exe` 2.1.232. W trybie dev wskazuje go `OPENBOT_CLAUDE_PATH`. W zbudowanej paczce leży w `resources\app.asar.unpacked\…\claude.exe` (304 MB), ale obecny kod szuka Claude tylko w ścieżkach systemowych. Szybka poprawka do zrobienia: zapasowo używać tej binarki.
- **Brakuje logowania.** W piaskownicy `claude auth status --json` zwraca `"loggedIn": false`, a program pokazuje „sign-in-required: Run `claude auth login` to use Claude”. Claude trzyma dane logowania w profilu (`~\.claude`), więc piaskownica ich nie widzi.
- Do odpowiedzi agenta Claude potrzebne jest jedno z dwojga: `claude auth login` w profilu, w którym działa COSGRAL, albo klucz API Anthropic podany w bezpiecznym formularzu (nie w czacie).

## 5. Instalator

- `bun run dist:win`: EXIT 0, ok. 12 min (najdłużej trwa kompresja `claude.exe`). Cache Electron/electron-builder w `Shared\tools\cache` (`ELECTRON_CACHE`, `ELECTRON_BUILDER_CACHE`), bez zapisu w profilu.
- Wynik:
  - `dist\COSGRAL Workspace-0.2.0-x64.exe`: 169 MB, SHA-256 `A22B819CDB5CE4D4B2E5421916360D1210B6211D645CE211EF57A080B4CDF0E5`, bez podpisu (zgodnie z `electron-builder.yml`);
  - do tego `latest.yml` i `.blockmap`.
- Zawartość (`7za l`, tylko odczyt): pakiet 7z LZMA2, 84 pliki, 788 MB po rozpakowaniu. To ta sama zawartość co `dist\win-unpacked` (751 MiB).
- `verify-windows-package.ts`, uruchomiony w piaskownicy przez `verify-package-sandbox.ps1` (oryginalny skrypt dziedziczy profil, a program zapisuje dane agentów w `~`):
  - kontrole statyczne przeszły (PE x64, fuses, licencje);
  - pierwsza instancja startuje;
  - **pada próg „druga instancja kończy się w 3 s”**. Pomiar: druga instancja zawsze kończy się poprawnie, z kodem 0, ale po **7,8–8,0 s** (3/3 próby). Blokada jednej instancji działa, wolny jest start niepodpisanej paczki 751 MB na tym PC. Do zbadania: skanowanie antywirusa, rozmiar `app.asar` (80 MB) z walidacją integralności.
- **Start w piaskownicy:** run 8 (zbudowana aplikacja) działa od początku do końca.
- **Instalacja NSIS: nie uruchomiłem.** Instalator one-click per-user zapisuje wpis odinstalowania w HKCU i skróty w menu Start prawdziwego profilu, a zasady zespołu na to nie pozwalają. Żeby domknąć ten punkt, potrzebna jest jedna z dwóch rzeczy:
  1. zgoda właściciela na instalację w jego profilu;
  2. maszyna wirtualna albo Windows Sandbox (włączenie tej funkcji wymaga admina).

  Polecenie do instalacji: `"COSGRAL Workspace-0.2.0-x64.exe" /S`, a odinstalowanie przez „Aplikacje” w ustawieniach Windows.
- Decyzja dla lidera: `claude.exe` (304 MB) trafia do paczki jako zależność SDK. Jeśli Claude ma używać binarki systemowej, można go wyłączyć z paczki; instalator powinien wtedy zejść z 169 MB do ok. 60 MB (szacunek). Jeśli ma działać od razu po instalacji, trzeba dodać zapasowe użycie tej binarki (sekcja 4.3).

## 6. Kontrakt dla UI (B4: Needs you, przyklejona Decyzja, Chat | Zadania)

Wszystkie zdarzenia agenta idą kanałem `agent:event` jako `ScopedAgentEvent { serverId, event }`. Typy są w `packages/contracts/src/ipc-conversation.ts`, API renderera w `ipc-desktop-apis.ts` (`window.openbot`).

### 6.1 Co baza już wystawia

| Potrzeba UI | Kontrakt dziś | Uwagi |
|---|---|---|
| Agent pracuje / myśli | `turn-started`, `turn-completed {status}`, `conversation-delta` (strumień), `queue-changed` (`QueueSnapshot`: `paused`, dostawy `queued/starting/running/completed/failed/interrupted/cancelled`) | wszystko per `botId` |
| Czeka na Ciebie: pytanie | `prompt {requestId, botId, threadId, turnId, questions[]}`, gdzie pytanie ma `header`, `question`, `isSecret`, `options[]`; odpowiedź: `agent.respondToPrompt` | jedno aktywne pytanie na agenta |
| Czeka na Ciebie: zatwierdzenie | `approval {approval: AgentApproval}`: `kind` `command`/`file-change`/`permissions`, `command`, `cwd`, `reason`, `grantRoot`, `permissions`; odpowiedź: `agent.respondToApproval` (`accept`/`decline`) | |
| Błąd | `error {botId?, code, message}`. Kody: `<provider>_start_failed`, `<provider>_exited`, `<provider>_diagnostic`, `delivery_start_failed`, `interrupt_failed`, `server_request_failed`, `context_compaction_failed`, `delivery_turn_association_failed`, `provider_history_backfill_pending`, `agent_error`, `agent_warning` | kody są wolnym tekstem, bez klasyfikacji |
| Limit | `usage-changed {usage}` i `agent.getUsage()`: okna `usedPercent`, `windowDurationMins`, `resetsAt` | tylko Codex i tylko dla całego konta; Claude nie podaje nic |
| Gotowość CLI | `status {AgentStatus}`: `phase` (`idle`/`starting`/`ready`/`restarting`/`blocked`/`stopped`), `providers[]` (`available`/`sign-in-required`/`not-installed`/`outdated`/`error`, `version`, `message`) | to źródło dla ekranu „czego brakuje” |
| Nieprzeczytane | `agent.listConversationReads()`, `readConversation().readState`, `agent.markConversationRead` | od B1 granica może być ID wiadomości z potwierdzenia wysłania albo ID dostawy |
| Przeglądarka agenta | `browser-changed` (karty z `ownerBotId`), `browser-control-changed` (sesje `acting`/`waiting`) | |
| Konto | `auth:event` `CentralAuthState`; **nowe: `localProfile: true`** | ukryć „Sign out” i techniczny e-mail `owner-…@cosgral.local`; zrzut z run 1 pokazuje oba |
| Powiadomienia systemowe | proces główny sam pokazuje „Needs your input” (prompt), „Needs your approval” (approval) i „Finished working” | per agent, flaga `notifications` |

### 6.2 Czego brakuje (propozycje nazw; zrobię na prośbę lidera)

1. **Lista czekających próśb:** `agent:list-pending-requests` → `PendingRequest[]` (pytania i zatwierdzenia wszystkich agentów). Dziś „Needs you” zna tylko zdarzenia z bieżącej sesji okna; po przeładowaniu albo na drugim urządzeniu (etap M) lista jest pusta. Dane już leżą w procesie głównym (`#pendingPrompts`, `#pendingApprovals`).
2. **Zdarzenia rozwiązania:** `prompt-resolved` i `approval-resolved {requestId, botId}`. Dziś UI czyści kartę sam po swojej odpowiedzi albo po `turn-completed`. Odpowiedź z innego urządzenia lub od kolegi nie zamyka karty.
3. **Jeden stan agenta:** `BotSummary.activity` (`idle`/`working`/`waiting`/`limited`/`error`) plus zdarzenie zmiany. Dziś UI musi składać ten stan z czterech strumieni.
4. **Limit jako stan:** klasyfikowane kody błędów (`usage_limit`, `auth_required`, `cli_missing`) z `resetsAt`.
5. **Kanały i zadania:** w 0.1.11 nie istnieją. Agent ma tylko 3 narzędzia ogólne: `list_agents`, `ask_user`, `send_message`. „Chat | Zadania” potrzebuje nowego kontraktu:
   - `Channel` i `ChannelTask {id, channelId, ownerBotId, state: queued/running/waiting/done/failed/cancelled, requestMessageId, result}`;
   - zdarzenia `channel-changed` i `task-changed`;
   - IPC `list/create/assign/cancel`;
   - narzędzia MCP dla agentów.

   To praca backendu na W1.
6. **Karta podglądu szkicu (wysłać / edytuj / zostaw):** brak typu. `ask_user` ma tylko pytania i opcje.

## 7. Bezpieczeństwo i prywatność

- **Wyciek środowiska w piaskownicy (naprawiony w tym samym zadaniu).** Pierwsze przebiegi dziedziczyły zmienne mojego procesu agenta, w tym `CLAUDE_CONFIG_DIR` zainstalowanego OpenBota. W run 2 wbudowany `claude.exe` wykonał w piaskownicy `--version` i `auth status` na konfiguracji agenta OpenBota i pokazał prawdziwe konto. Zapytania do modelu nie było.
  - Naprawa: `run-sandbox.ps1` czyści `CLAUDE*`, `ANTHROPIC*`, `OPENAI*`, `CODEX*`, `OPENBOT*`; od run 3 Claude w piaskownicy jest „sign-in-required”.
  - E-maile kont usunąłem z logów dowodowych, a sterownik maskuje je od razu przy zapisie.
  - Nie da się sprawdzić, czy te dwa polecenia coś zapisały w katalogu konfiguracji OpenBota, bo moja sesja pisze tam równocześnie. Plików OpenBota nie otwierałem.
- Codex: logowanie jest w Menedżerze poświadczeń Windows (sekcja 4.2), więc piaskownica folderów go nie izoluje. To ważne dla przyszłych testów: prawdziwe tury Codex idą na konto właściciela.
- Serwery: aplikacja nie otwiera portów. DevTools tylko na 127.0.0.1 i tylko w przebiegach testowych.
- Repo: raport nie zawiera ścieżek z nazwą konta Windows ani e-maili, a zrzuty zostały poza repo.

## 8. Commity

| Commit | Zmiana |
|---|---|
| `d31a7e344` | profil lokalny właściciela zamiast zewnętrznej usługi kont |
| `d3c1928ec` | Windows: start CLI bez powłoki, spóźnione wyjście po `stop()`, bufor strumienia, testy Windows |
| `536edf6a7` | „przeczytane” po wysłaniu wiadomości bez błędu |
| (ten raport) | raport B1 |

Każda zmiana pliku z bazy jest w `COSGRAL-CHANGES.md`.

## 9. Nie sprawdzałem / otwarte

- Odpowiedź agenta Claude (brak logowania, sekcja 4.3).
- Instalacja NSIS i odinstalowanie (sekcja 5).
- Próg 3 s dla drugiej instancji w `verify-windows-package.ts` (sekcja 5): zmierzone 7,9 s, przyczyna nieustalona.
- Funkcje zespołu bez chmury (publikacja, zaproszenia, dołączanie): W3.
- „Kolega pisze…” w czacie z agentem nie istnieje w 0.1.11 (sekcja 2). Do listy parytetu Testera, jeśli jest w 0.68.

## 10. Zapisane poza repo

- `Shared\cosgral-data\desktop-backend\`:
  - `logs\b1\` (testy, build, `dist:win`);
  - `evidence\b1\` (8 przebiegów);
  - skrypty `run-sandbox.ps1`, `cdp-drive.mjs`, `cli-probe.cjs`, `verify-package-sandbox.ps1`, `second-instance-probe.ps1`;
  - atrapa `stub-codex\`;
  - piaskownica `sandbox-b1\`.
- `Shared\tools\`: `codex-cli\` (Codex CLI 0.167.2), `npm-cache\`, `cache\electron`, `cache\electron-builder`.
- W worktree tylko pliki ignorowane przez git: `out\` i `dist\` (instalator).
