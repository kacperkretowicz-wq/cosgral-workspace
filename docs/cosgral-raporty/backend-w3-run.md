# Backend W3-BE8: uruchomienie całej aplikacji

Gałąź `team/backend/w3-be8` od integracji `64d69b414`, bez push. Cel właściciela: działająca aplikacja klona. Dotąd program nigdy nie był uruchomiony w całości z silnikiem. Ten raport opisuje pierwsze takie uruchomienie: budowa, start w piaskownicy, ścieżka użytkownika, paczka Windows i skrypty startowe. Kodu OpenBota nowszego niż `a6fe240` nie czytałem.

## Wynik w skrócie

| Krok | Wynik |
|---|---|
| 1. `bun install`, `bun run build` | ✓ bez żadnej poprawki: `install` bez zmian, `build` kod 0 w 29 s (main 1,46 MB, preload 93 KB, renderer 1,76 MB + 299 KB CSS); w bundlu main są pliki aplikacji telefonu `/app` |
| 2. Start w piaskownicy i ścieżka użytkownika | ✓ 19 kroków automatycznych, 0 wpisów w konsoli renderera, w main tylko szum wymieniony niżej; jedna poprawka (sekcje ustawień) |
| 3. Skrypty, paczka, README | ✓ `start-cosgral.cmd`, `start-cosgral-sandbox.cmd`, `README_URUCHOMIENIE.md`; `bun run dist:win` kod 0 w 520 s, instalator 102,9 MB; paczka sprawdzona w piaskownicy |

Pełne uruchomienie: `bun run build`, potem `COSGRAL_SANDBOX_ROOT=<folder> bun run sandbox:e2e` (Node 24, ok. 110 s).

## Krok 1: budowa

`bun install` (727 pakietów, bez zmian) i `bun run build` (electron-vite: main, preload, renderer) przeszły od razu. Błędów typów ani bundlera po scaleniach W1–W3 nie było, więc nic tu nie poprawiałem. Dodatkowo `typecheck:node` i `typecheck:renderer` zielone. Wygenerowany bundle `/app` telefonu (`mobile-app-assets.ts`) jest w bundlu main i serwowany przez serwer telefonu (sprawdzone w kroku 2).

## Krok 2: program w piaskownicy

**Jak:** `scripts/sandbox-e2e.ts` uruchamia prawdziwy Electron (`electron.exe <repo>`) przez Playwright (`_electron`), z osobnymi `USERPROFILE`, `HOME`, `APPDATA`, `LOCALAPPDATA` i `TEMP` oraz atrapą Codex z repozytorium (`channel-codex.cjs`, `OPENBOT_CODEX_PATH`). Program trzyma wszystko w `APPDATA` (profil „COSGRAL Workspace Dev”) i w folderze domowym, więc dane zwykłego OpenBota (`%APPDATA%\OpenBot`) nie są dotykane. Sprawdziłem wcześniej sondą, że `app.getPath("appData")` i `temp` Electrona idą za zmiennymi środowiska, a `home`, `documents` i `downloads` nie (program używa ich tylko jako domyślnych ścieżek okien zapisu, nic tam nie zapisuje). Skrypt zbiera konsolę każdego okna, zdarzenia `pageerror` i `requestfailed` oraz wyjście procesu main.

| Krok | Wynik | Dowód |
|---|---|---|
| Start programu bez crasha | ✓ | okno „Welcome to COSGRAL” |
| Onboarding: powitanie → „Where will COSGRAL Workspace run?” → „Set up this computer” (Codex „fixture@cosgral.local Available”, Claude „Not installed”) | ✓ | zrzuty i drzewa dostępności |
| Utworzenie agenta w oknie („New agent” → „Create new agent”) | ✓ | agent „New agent” na liście, nagłówek |
| Wiadomość do agenta, odpowiedź atrapy „Stub: received” widoczna | ✓ | zrzut `04-answer` |
| Wszystkie okna programu kończą ładowanie, żadne nie padło (też okno wyspy) | ✓ | |
| Restart: ten sam profil, bez ekranów pierwszego uruchomienia, agent i historia na miejscu | ✓ | zrzut `05-after-restart` |
| Strony szyny: Schedule, Tasks, Workflows, Usage, Library, Marketplace, Remote desktop, Settings, Agents | ✓ otwierają się, konsola bez błędów | zrzut i drzewo każdej strony |
| Wszystkie odczyty `window.openbot` bez argumentów (61 wywołań) | ✓ 44 odpowiedziały, 17 chce argumentów (odpowiadają „botId is required” itp. albo „team server is not configured”), 0 awarii | `ipc-getters.json` |
| Agent wywołuje narzędzia programu przez most (atrapa tworzy tabelę „Sandbox leads”), tabela widoczna przez `window.openbot.tables` | ✓ | zrzut `07-agent-tools` |
| Telefon: parowanie przez HTTPS z przypiętym odciskiem na **prawdziwym** `AgentService` | ✓ opis niżej | zrzut `06-phone-paired` |
| Restart: serwer telefonu wstaje sam, ten sam certyfikat, odwołane urządzenie nadal odwołane | ✓ | |

**Telefon w prawdziwym programie (to było największe „nie sprawdziłem” z W3-BE6 i W3-BE7):**
- `mobile.startPairing` daje adres `https://127.0.0.1:<port>`, odcisk SHA-256 i link do `/app/` z odciskiem w kodzie.
- Klient z zewnątrz (Node, przypięty odcisk) pobiera `/app/` (HTML z ścisłym CSP) i `/app/app.js`.
- Kartę zgody „Pair a phone…” widać w Needs you i zatwierdza się ją przez API okna; telefon dostaje token.
- Telefon czyta listę agentów, stronę wiadomości **z bazy** (historia z okna), wysyła wiadomość, a prawdziwy `AgentService` odpowiada atrapą (druga odpowiedź „Stub: received”).
- Strumień zdarzeń zaczyna się od numerowanego zdarzenia `needs-you`; `/v1/vault/items` daje 403; po odwołaniu urządzenia następne żądanie dostaje 401.
- Po restarcie programu serwer telefonu działa sam z tym samym certyfikatem (klucz odszyfrowany przez `safeStorage`).

### Poprawka (psuła działanie)

W Ustawieniach lista sekcji pokazywała „voice / mobile / dock / island — unavailable”, choć ich silniki są w programie. `AgentSettingsService` ma hak `tabFeatures`, którego `AgentService` nie podawał (zostało po W3-BE2, zanim te funkcje się scaliły). Dodałem `builtInTabFeatures(platform)` w `agent-settings.ts` (głos tylko na Windows) i podałem go w `agent-service.ts` (+2 linie). Test: `agent-settings.test.ts` 8/8 (nowy najpierw czerwony). W oknie: lista sekcji bez „unavailable”.

### Co zauważyłem i nie poprawiałem (kosmetyka albo cudza część)

| Sprawa | Gdzie | Komu |
|---|---|---|
| Ekran „Welcome to COSGRAL” oraz sekcje „Application settings” i „Voice” w Ustawieniach są bez stylów (surowy HTML, nazwy zdarzeń jak `needs-approval`) | `AppSettingsW3.tsx`, ustawienia głosu | UI |
| Dwa ekrany pierwszego uruchomienia pytają o dostawcę (powitanie W3, potem oryginalne „Set up this computer”) | `App.tsx`, `OnboardingW3Gate` | UI |
| „Read aloud” i „Stop reading” pod odpowiedzią agenta wyglądają jak zwykły tekst | odtwarzanie głosu | UI |
| Strony „Tasks” i „Usage” to „Coming soon”; nie ma jeszcze ekranu Mobile Connect ani dostawców i limitów | W3-UI6 (KK) | UI |
| Ustawienia mają tytuł „Providers & permissions” i opis o uprawnieniach macOS także na Windows | `InitialSetup` | UI |
| Zaraz po restarcie przez kilka sekund karta „Connecting to agent CLIs…”, a pole wiadomości jest wyłączone („Complete agent CLI setup to start”) | start CLI | UI / silnik |
| Okno wyspy ładuje się wolno (drugi renderer, kilka sekund po pierwszej turze agenta). Zamknięcie programu w trakcie tego ładowania wypisuje w main „Unable to load the island window: ERR_FAILED (-2)”; to szum przy zamknięciu, nie awaria | `dock-windows.ts` `#load` | KK (jedna linia: nie wypisywać po `destroy`) |
| Pierwsze „Finish setup” na zupełnie czystym profilu raz trwało dłużej niż 2,5 s (kolejne ok. 1,1 s) | onboarding | — |

## Krok 3: skrypty, paczka, README

**Skrypty (zwykłe `.cmd`, bez zmiany polityki wykonywania; pliki z CRLF, `.gitattributes` +1):**
- `start-cosgral.cmd`: uruchamia program na normalnym profilu użytkownika; buduje go raz, gdy nigdy nie był zbudowany, albo na `--rebuild`; czyta opcjonalny `cosgral-local.cmd` (w `.gitignore`) z `COSGRAL_CODEX_PATH` i `COSGRAL_CLAUDE_PATH`.
- `start-cosgral-sandbox.cmd [folder] [--reset]`: osobny pusty profil Windows w `%LOCALAPPDATA%\COSGRAL-Sandbox` i atrapa Codex (uruchamiana trybem Node samego Electrona, więc bez osobnego Node); `--reset` kasuje tylko folder oznaczony przez ten skrypt.
- Test skryptów: piaskownicowy uruchomiony z nowym folderem (proces główny wstał, profil „COSGRAL Workspace Dev” z bazą powstał, program rozmawia z atrapą przez `app-server --listen stdio://`); `start-cosgral.cmd --rebuild` uruchomiony ze zmiennymi środowiska wskazującymi piaskownicę (żeby nie dotknąć zwykłego profilu): zbudował program w ok. 30 s i go uruchomił. Test wykrył błąd w moim skrypcie (`SHIFT` przesuwa także `%0`, więc ścieżka atrapy była zła), poprawiony przez zapamiętanie folderu przed pętlą argumentów.
- `README_URUCHOMIENIE.md`: jak uruchomić, gdzie są dane, jak zalogować dostawcę (Codex: `codex login`; Claude: `claude auth login`), instalator, test, czego jeszcze nie ma.

**Paczka Windows (`bun run dist:win`, electron-builder 26, NSIS, x64):**
- Kod 0 w 520 s. Wynik: `dist\COSGRAL Workspace-0.2.0-x64.exe` (102,9 MB), `latest.yml`, `dist\win-unpacked\`. Budowanie offline dzięki pamięci podręcznej zespołu (`ELECTRON_CACHE`, `ELECTRON_BUILDER_CACHE` w `Shared\tools\cache`). Instalator jest **niepodpisany** (SmartScreen ostrzeże), co jest w konfiguracji.
- Program z `win-unpacked` w piaskownicy (z osobną atrapą Codex): startuje, onboarding, agent, czat z odpowiedzią atrapy, parowanie telefonu przez TLS (`transport: "tls"`), 0 wpisów w konsoli. Dane: `%APPDATA%\COSGRAL Workspace` i `%USERPROFILE%\COSGRAL Workspace` (wspólny folder roboczy z wersją z kodu, osobna baza).
- Do tego testu zmieniłem nazwę `resources\app-update.yml` w mojej kopii `win-unpacked` (przywróciłem po teście; instalator nie był zmieniany): zainstalowany program sprawdza aktualizacje w publicznych wydaniach repozytorium z `electron-builder.yml` (`publish`), czyli łączy się z GitHubem. W piaskownicy to wyłączyłem, zgodnie z zasadą „bez sieci”.

### Znalezisko dla KAPI (paczka)

W `electron-builder.yml` fuse `runAsNode` jest wyłączony, a most narzędzi dostawcy ACP uruchamia `process.execPath` z `ELECTRON_RUN_AS_NODE=1` (`acp-client.ts`). W spakowanym programie ten proces nie będzie węzłem Node, więc narzędzia programu dla agentów ACP prawdopodobnie nie zadziałają. Codex i Claude tego mostka nie używają, więc ich nie dotyczy. Potwierdziłem tylko mechanizm (w teście paczki atrapa oparta o `ELECTRON_RUN_AS_NODE` na spakowanym `exe` nie wstała, co zmusiło mnie do użycia zwykłego Node); samego agenta ACP w paczce nie uruchamiałem.

## Logowanie dostawcy: stan na tym komputerze

- Program używa logowania istniejącego CLI (nie kopiuje tokenów) i szuka `codex` / `claude` w `PATH` i w znanych miejscach; zmienne `OPENBOT_CODEX_PATH` / `OPENBOT_CLAUDE_PATH` mają pierwszeństwo.
- Na tym komputerze `codex` i `claude` **nie są w `PATH`**. Codex CLI jest w folderze narzędzi zespołu (`Shared\tools\codex-cli`, pakiet `@openai/codex` ^0.167.2), a w profilu właściciela istnieje plik logowania Codex (sprawdziłem tylko istnienie, nie treść). Claude CLI nie jest zainstalowany.
- Żeby użyć prawdziwego Codex: w `cosgral-local.cmd` ustawić `COSGRAL_CODEX_PATH` na `codex.cmd` z tego folderu (albo dodać go do `PATH`), uruchomić `start-cosgral.cmd` i sprawdzić, że na ekranie „Set up this computer” Codex ma „Available”. Gdyby nie miał, potrzebne jest `codex login` właściciela.

## Czego nie sprawdziłem

- **Prawdziwego dostawcy (Codex lub Claude) i prawdziwej tury z modelem.** Wszystko poszło przez atrapę Codex. Nie uruchamiałem `codex:doctor` ani CLI na zwykłym profilu właściciela (zgoda dotyczyła piaskownicy), więc nie wiem, czy logowanie Codex jest aktualne.
- **Instalatora NSIS „na sucho”:** nie instalowałem go ani nie odinstalowywałem (zapisałby do zwykłego profilu i rejestru). Sprawdziłem tylko, że się buduje i że `win-unpacked` działa.
- **Aktualizacji w zainstalowanym programie** (wyłączone w teście), oraz tego, czy repozytorium z `publish` ma wydania.
- **Zwykłego `start-cosgral.cmd` na zwykłym profilu:** sprawdziłem go tylko ze zmiennymi środowiska wskazującymi piaskownicę.
- **Funkcji, które wymagają człowieka lub sprzętu:** Computer Use na prawdziwym pulpicie, zdalny pulpit między dwoma komputerami, mikrofon i głośniki (głosy Windows widać w ustawieniach, nie czytałem na głos), kamera i oczy agenta, prawdziwy telefon i odczyt QR aparatem, tryb sieci lokalnej (okno Zapory).
- **Głębokich ścieżek stron:** strony Marketplace, Workflows, Library, Schedule i Remote desktop sprawdziłem tylko pod kątem otwarcia bez błędu i odczytów API; nie instalowałem pozycji z Marketplace, nie uruchamiałem przepływu ani rutyny, nie dodawałem wpisu do Vault z okna.
- **Pełnego `bun run test`**, `typecheck:storybook`, `typecheck:api`. Uruchomiłem testy plików, które zmieniłem (`agent-settings.test.ts` 8/8), `typecheck:node` i `typecheck:renderer` (oba kod 0) oraz Biome na zmienionych plikach.
- **Innych komputerów i wersji Windows.** Wszystko na jednym komputerze z Windows 10 Pro.
- **Playwright pod Bunem:** `_electron.launch` pod Bunem nie kończy uzgodnienia (przekroczenie czasu), więc skrypt trzeba uruchamiać Node (`bun run sandbox:e2e` robi to przez `node`).
- Przy pierwszych próbach zatrzymałem własne procesy Electrona po identyfikatorze; nie zatrzymywałem cudzych. Folder piaskownic (`Shared\cosgral-sandbox`, poza repozytorium) zostaje do wglądu razem z zrzutami w `evidence` (zawierają nazwę konta Windows, dlatego nie ma ich w repozytorium).
