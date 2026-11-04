# COSGRAL Workspace – rekomendacje dalszych prac (stan 4 XI 2026, ~04:30 CET)

## Bieżące ustalenia — kontynuacja 4 XI

Użytkownik wznowił budowę 4 XI poleceniem „kontunuuj budowę projektu”. Historyczne zapisy wstrzymania poniżej pozostają opisem wcześniejszych etapów. Użytkownik chce darmowego hostingu bez karty. Rejestracja Oracle zatrzymała się na problemie z kartą; nie utworzono konta ani maszyny. Codespaces może być opcją do pracy w wolnej chwili, ale konfigurację odłożono. Nie uruchamiać go teraz. Codespaces nie zastępuje docelowego hostingu 24/7 i jego zgodność z bwrap nie jest potwierdzona. Nie kupować VPS-a ani nie tworzyć płatnych zasobów bez nowej decyzji użytkownika.

Nowsze przyrosty kodu: formularz URL repozytorium, podłączanie GitHub z panelu autoryzacji, profiler P0 i przygotowany profil systemd. Szczegóły oraz granice odbioru są na końcu dokumentu. Historyczne komunikaty o wstrzymaniu i instrukcje kont poprzedniego hosta nie opisują obecnego stanu.


Gałąź: `codex/cosgral-workspace`. Pełna historia: `COSGRAL-PRZEKAZANIE.md`, cel: `COSGRAL-PROMPT-POSTEP.md` (przekreślone = potwierdzone testami/e2e).

## Najnowsze przekazanie — 4 XI, kontynuacja Windows

Ten rozdział aktualizuje historyczne instrukcje poniżej. Kod zapisano w commitach `f8a21d897` (kontrole Windows), `758d21cbb` (wybór odbiorców ról), `fe5f55aaa` (wydajność redakcji), `a961e2cee` (wyniki i ograniczenia).

- **P0 pozostaje otwarte.** Poprawiono dwa odtwarzalne przypadki kosztownej redakcji; nie dowiedziono, że powodowały pierwotne 110 sekund. Testy redakcji i ścieżki logów: 64 PASS. W próbie z lokalnym kontem Sol przeszedł weryfikację na stabilnym CLI 0.162.1, lecz rzeczywisty run zakończył się EPERM symlinku przed A. B nie osiągnięto. Polityka COSGRAL wymaga obecnie linuksowego bwrap; nie wyłączać izolacji, aby uzyskać pozorny PASS. Powtórzyć A/B na Linuksie i zapisać profil CPU przed zatrzymaniem procesu oraz niezależne pomiary health.
- **Konta a/c/d są historyczną konfiguracją poprzedniego hosta**, nie wymaganiem produktu. Użytkownik zezwolił na użycie jego lokalnego, zalogowanego Codexa. Nie kopiować poświadczeń między użytkownikami. Model testowanych agentów: gpt-6.1-sol, medium. Sesja implementacyjna przeszła z Terra na Sol; zmiana modelu sesji i model uruchamianego agenta to osobne ustawienia.
- **Role:** wybór użytkownika i agenta po nazwie działa; nowy katalog członkostw agentów jest board-only, z kontrolą firmy i nieskopowanego users:manage_permissions. UI 12 PASS; API/DB + OpenAPI 45 PASS i dodatkowy finalny test ról 12 PASS. W przeglądarce utworzono i zastosowano pustą rolę do testowego agenta. Odbiór dwóch zalogowanych osób nadal otwarty.
- **Windows:** stosować krótką ścieżkę repozytorium przy embedded PostgreSQL; długi katalog powodował błąd dostępu do rozszerzenia pg_trgm. Node >=24.11, pnpm 9.15.4. Kontrole CRLF poprawione; token gates, synchronizacja palety/postaci, shared typecheck i mapy przeszły. Nie zaliczono pełnego monorepo test/build/typecheck.
- **Następna praca produktowa:** domknąć podłączanie repozytorium z formularza projektu. Rozpoznano istniejące `ProjectRepositoryInput`, `projectsApi.create` i backendowe `repositoryUrls` z walidacją HTTPS GitHub. Formularz nowego projektu wysyła obecnie tylko wybrane `repositoryIds`. Nie dodano jeszcze pola URL ani nie potwierdzono pełnego procesu prywatnego repo → checkout → praca agenta. Rozwinąć istniejący mechanizm i jego politykę dostępu.
- **Kolejność do wersji do codziennej pracy:** stabilny host Linux + trwały Postgres/sekrety; odbiór P0; pełny onboarding repo i koordynatora/wykonawcy; odbiór dwóch kont na wdrożeniu (realtime, restart, konfiguracja, Tabela/Workflow); potem kolejne runtime'y/konta i pozostały zakres UX, pamięci i integracji.
- **Wykorzystanie gotowych rozwiązań:** ta kontynuacja rozbudowała istniejące moduły Paperclip i jego zależności. Nie importowano kodu Agor, Wemux, Happy ani Agent Teams AI i nie dodano drugiego orkiestratora. Audyt tych kandydatów jest historycznym rozpoznaniem, nie dowodem integracji. W pierwszej kolejności korzystać z już obecnych adapterów, Better Auth, WebSocketów, katalogu połączeń GitHub i mechanizmów workspace. Nowy pakiet dokładać dopiero dla potwierdzonej luki; licencję i aktualną zgodność sprawdzić przed użyciem.

Praca nad celem została wstrzymana przez użytkownika na czas przekazania i publikacji zmian w GitHub. Procesy testowe zakończone; produkcji nie wdrażano.

## Priorytety

1. **Zawieszanie pętli zdarzeń serwera w approval e2e** (P0). W odbiorze t18 dwa razy serwer nie odpowiadał ~110 s tuż po `GET /issues/:id/interactions` w scenariuszu B (`scripts/cosgral-e2e-approval.mjs`), sonda health: 109953 ms. Wystąpiło na koncie c; na d przeszło. Zrobić: uruchomić 3199 z `node --cpu-prof` (lub `--inspect` + profil), powtórzyć approval na c, znaleźć synchroniczną operację (podejrzane: synchroniczne fs/git przy worktree, kopiowanie Codex home/auth, redakcja dużych tekstów regexami, `containsInstructionCredential`). Dodać test/sondę opóźnienia pętli.
2. ~~UI własnych ról (§12)~~ – zrobione w t20 (`CompanyRolesPanel` w profilu). Panel umożliwia wybór aktywnej osoby lub agenta po nazwie, z ręcznym wyborem członkostwa jako opcją awaryjną. Przypisanie agenta sprawdzono w przeglądarce lokalnie. Pozostaje: odbiór dwóch kont i decyzja o usuwaniu ról w użyciu (dziś 409).
3. **§7 integracje** – Claude Code / Cursor / Grok / Gemini CLI oraz API (OpenAI/Anthropic/Google/xAI/OpenRouter); uczciwe oznaczanie możliwości narzędzi per runtime (start w t16).
4. **§4 multiplayer** – awatary (upload), kursory na wspólnych widokach, „Obserwuj użytkownika”, sync ustawień agentów na żywo.
5. **§10 pamięć projektu** – pamięć w repo GitHub, podłączanie własnego repo z aplikacji.
6. **§11 hosting** – Netlify (UI) + stały backend + trwała baza (nie /tmp; restart boxa kasuje /tmp, `node_modules` i `dist`).
7. **§14 kryteria 2–4, 12–15 i §16** – instrukcja wdrożenia, lista funkcji, końcowy odbiór.
8. Pozostałe częściowe: §6 import profili Runnera, MCP/CLI/skille per agent, żywe potwierdzenie zmiany modelu; §8 audyty/postęp w jednej historii.

## Zasady pracy

- Konta Codex: **a (kacperdeska12345), c (glassandgo), d (kacperdeska1234); nigdy b** (brak gpt-6.1-sol). Przed użyciem `CODEX_HOME=~/.codex-X codex login status`.
- Model: **gpt-6.1-sol, rozumowanie medium**; uruchamianie `/workspace/cosgral-codex.sh <konto> gpt-6.1-sol <prompt> <tag>`.
- **Maksymalnie 2 e2e z modelem naraz + jeden serwer** (4 naraz → OOM i restart boxa).
- **Rutyna nie odpala Codexa w tym samym drzewie podczas odbioru innego przebiegu** – t18 i t19 trafiły przez to do commitów poprzednich tur (`364ec63b1`, `274187733`) pod nie swoim opisem.
- Push bez force; zielone → `codex/cosgral-workspace`, czerwone → `wip/cosgral-tNN`. Przekreślenia tylko po teście/e2e.
- Po restarcie boxa: `pnpm install --frozen-lockfile`, `pnpm --filter @paperclipai/plugin-sdk... build`; PAPERCLIP_HOME w /tmp jest pusty.

## Stan kont (4 XI 2026 ~04:30 CET)

- a: limit do 05:26 (CET).
- c: działa (wcześniej limit do 02:50, minął).
- d: działa.
- b: nie używać.

## Kontynuacja 4 XI — formularz repozytorium

Dodano opcjonalny adres HTTPS GitHub w formularzu nowego projektu, przekazywany jako `repositoryUrls` obok istniejących `repositoryIds`. Serwer nadal odpowiada za walidację, deduplikację i rejestrację workspace. Zapis adresu nie potwierdza dostępu do prywatnego repo ani checkoutu. Odbiór pełnej ścieżki repo → koordynator → wykonawca pozostaje otwarty.

Weryfikacja tej zmiany: formularz 5/5, istniejące testy repozytoriów i trwałości 13/13, typecheck UI, token gates i kontrola map PASS na Node 24.18.0. Pierwsze uruchomienia na globalnym Node 20 nie przeszły inicjalizacji; powtórzenie na wymaganej wersji przeszło. Nie wykonano pełnego monorepo build/test ani odbioru w przeglądarce. Linux dla P0 nadal niepotwierdzony (lokalny WSL nie zwrócił dystrybucji).

Panel autoryzacji GitHub projektu ma bezpośrednie podłączanie konta przez istniejący `ConnectionSetupFlow`, odświeżanie dostępnych autoryzacji/repozytoriów i ponowienie odczytu po błędzie. Zgoda projektu pozostaje osobną decyzją użytkownika. Testy komponentu: 3/3 PASS; token gates PASS. Pełne logowanie GitHub i dostęp rzeczywistego agenta nadal wymagają odbioru.

Końcowo dla panelu: typecheck UI, produkcyjny build UI, kontrola map oraz synchronizacja palety/postaci PASS. Build najpierw uruchomiono omyłkowo z root (błąd ścieżki sw.js); poprawny build z katalogu ui przeszedł z ostrzeżeniami o rozmiarze chunków i konfiguracji Vite. Testy panelu po finalnej zmianie ponownie 3/3 PASS. Nie jest to pełny build monorepo ani odbiór wdrożenia.

## Przygotowanie diagnozy P0 i Oracle

Użytkownik wybrał wdrożenie Oracle zamiast lokalnego WSL; rejestracja konta wymaga jego działania. Instalator WSL zakończył się komunikatem o wymaganym restarcie Windows; restartu nie wykonywano. Nie utworzono jeszcze maszyny Oracle.

Dodano `scripts/cosgral-profile-server.mjs` i instrukcję `P0-PROFILOWANIE.md`: zewnętrzny pomiar health, profil CPU od początku obserwacji, zapis próbek przed oczekiwaniem na Inspector i brak zatrzymywania serwera. Testy na rzeczywistym procesie Node (zdrowy HTTP, blokada CPU, walidacja adresów) 3/3 PASS. Pierwotnego P0 nie odtworzono i nie zamknięto.

## Profil wdrożenia Oracle — przygotowany, nieuruchomiony

Dodano `deploy/cosgral/cosgral.service`, `workspace.env.example`, `scripts/cosgral-host-preflight.mjs` i `ORACLE-WDROZENIE.md`. Profil uruchamia istniejący zbudowany backend/UI jako użytkownik cosgral, z trwałym stanem, PostgreSQL i loopback za proxy HTTPS. Preflight wymaga authenticated, trwałych sekretów i gotowych artefaktów, sprawdza podstawowy bwrap/Git/Codex. Testy walidacji 3/3 PASS. Lokalna próba CLI odmówiła uruchomienia na Windowsie bez konfiguracji (oczekiwany błąd). Nie sprawdzono systemd, ARM, połączenia bazy, modelu ani izolacji pełnego agenta; wymaga to maszyny Oracle. Pełny odbiór P0 i dwóch osób nadal otwarty.

## Zatrzymanie i przekazanie — 4 XI 2026

Użytkownik poprosił zatrzymać wszystkie działania, zapisać stan, wypchnąć go na GitHub i przekazać rekomendacje. Przed publikacją sprawdzono procesy powiązane z repozytorium: nie działa już test, serwer, profiler ani kompilacja uruchomiona w tej pracy. Nie ma wdrożenia ani utworzonej maszyny. Nie wznawiać implementacji ani konfiguracji Codespaces bez prośby użytkownika.

Commit bazowy przed checkpointem: `8da828bcf73915011aca3a272fbd11a3f01cc440` (`Record successful Runner build and backend checks`). Zawiera wynik pełnego produkcyjnego buildu Runnera, osobny typecheck serwera i CLI oraz opis ograniczeń wyżej. Pełny `pnpm -r typecheck` nie został ponownie zaliczony jako jedno polecenie; pełny `pnpm test:run` i monorepo build nadal nie są odebrane.

Przed zatrzymaniem przygotowano lokalne poprawki narzędzi Windows:

- `ensure-workspace-package-links.ts` naprawia tworzenie linków pakietów workspace przez junctions na Windowsie bez wymagania Developer Mode/uprawnień administratora; po poprawce preflight linków przeszedł.
- `run-vitest-stable.mjs` uruchamia Windowsowy Vitest bezpośrednio przez Node, zamiast przez shim `pnpm.cmd`. Nowy `vitest-invocation.mjs` zachowuje dotychczasowe `pnpm exec vitest` na Unixie. Usuwa to błędy `spawnSync pnpm ENOENT` i ograniczenie długości polecenia przy długich filtrach shardów.
- Test `scripts/__tests__/vitest-invocation.test.mjs` przeszedł 2/2, w tym przekazanie długiej listy argumentów, ścieżek ze spacjami i znaków specjalnych. Wcześniejszy test wrappera: 35 PASS, 5 pominiętych testów fixture'ów POSIX na Windowsie; ten wynik był sprzed ostatniej zmiany dispatchera.
- Ostatni przebieg `pnpm test:run` przeszedł preflight i kolekcję shardu czatu: 150/899 testów w shardzie 1/6, filtr zweryfikowany. Przebieg zatrzymano na prośbę użytkownika po starcie Vitest; nie ma wyniku tego shardu ani pełnego zestawu. Nie traktować zatrzymania jako PASS ani jako błędu testów.

Zmiany checkpointu zapisano i wypchnięto na gałąź `codex/cosgral-workspace`. Przy wznowieniu najpierw sprawdzić `git status` i HEAD względem origin, przeczytać `COSGRAL-PROMPT-POSTEP.md` oraz tę rekomendację. Jeśli użytkownik wznowi odbiór Windows, dokończyć `pnpm test:run`, zebrać pełne wyniki bez pomijania shardów, a potem uruchomić pełny monorepo build/typecheck. Nadal osobno wymagają decyzji i środowiska: Linux z bwrap, odtworzenie P0, trwały hosting oraz dwie niezależne sesje użytkowników. Nie twierdzić, że platforma jest gotowa do codziennej pracy.

## Synchronizacja autoryzacji i kontrola całego repozytorium

Panel autoryzacji GitHub projektu korzysta teraz z klucza pod kanonicznym prefiksem szczegółów projektu. Dzięki temu istniejący mechanizm zdarzeń unieważnia go po nadaniu/cofnięciu autoryzacji przez inną osobę. Testy panelu i LiveUpdatesProvider: 111/111 PASS; kontrole tokenów, palety/postaci i map PASS. Odbiór dwóch prawdziwych sesji nadal otwarty.

Pełny typecheck odkrył fałszywe rozjechanie manifestu PRP na Windowsie: wszystkie 84 wejścia po normalizacji CRLF do LF miały dokładnie oczekiwane hashe. Dodano reguły LF w .gitattributes i znormalizowano lokalny checkout, bez regeneracji manifestu ani zmiany semantyki protokołu. check:protocol-manifest po poprawce PASS. Część Rust cargo check pierwszej próby przeszła z ostrzeżeniami; pełna próba zatrzymała się później na manifeście przy przygotowaniu serwera. Trwa ponowienie pełnej kontroli po poprawce; nie zaliczać jej przed zakończeniem.

Ponowiona pełna kontrola przeszła UI i zatrzymała przygotowanie serwera na katalogu capabilities: parser nagłówka JSON nie obsługiwał CRLF. Dodano obsługę CRLF z testem; testy katalogu 5/5 PASS. Dwa kolejne pozornie nieaktualne wygenerowane pliki miały wyłącznie różnice końców linii; potwierdzono zgodność treści z HEAD, dodano reguły LF. check-capability-inventory po poprawce PASS. Pełny typecheck nadal niezaliczony; wymaga kolejnego przebiegu po tych poprawkach. Zmiany tej kontynuacji zapisano lokalnie; publikacja po dalszej weryfikacji.

Dalszy przebieg kontroli Windows: wykryto CRLF także w protocol-coverage.json i dwóch JSON-ach generated; porównano treść z HEAD bez różnic semantycznych i dodano reguły LF. Kontrole protocol coverage, semantic contracts i semantic action catalog przeszły. Naprawiono dynamiczny import w check-runner-workflow-traceability.mjs (pathToFileURL zamiast bezpośredniej ścieżki Windows); kontrola potwierdziła 44 findings / 12 workflows / 1 exclusion. Ponowiona kontrola serwera dotarła do cargo build --release dla paperclip-runnerd; na tym punkcie zapisu proces nadal kompiluje. Nie oznaczać typecheck/server build jako PASS przed wynikiem końcowym. Zmiany nadal lokalne.

## Wynik kontroli po poprawkach Windows

Produkcyjny Runner zbudował się poprawnie (`cargo build --release`, 9m51s, ostrzeżenia). Przeszły następnie replay goldens, semantic catalog, zapis stempla buildu i przygotowanie vendora. Kontrola typów serwera zakończyła się kodem 0. Osobna kontrola CLI paperclipai także zakończyła się kodem 0. UI, pozostałe pakiety i cargo check przeszły w poprzednich etapach tego odbioru. Pierwotne pełne wywołania pnpm -r typecheck były czerwone z opisanych przyczyn; po poprawkach domknięto wadliwą ścieżkę serwera i CLI osobno, bez ponawiania całego monorepo jednym poleceniem. Pełny test:run i pełny monorepo build nadal nieodebrane. Testy zmienionych powierzchni: 111 UI oraz 5 katalogu możliwości PASS. Nie zalicza to P0, runtime Linux, dwóch kont ani wdrożenia.

## Wznowienie budowy — 4 XI, bieżący odbiór Windows

Sprawdzono czysty checkout i zgodność lokalnego HEAD z origin: `da6aedcf1fd51a54c021adaf7b7ce339ff43204f`. Testy wrappera po ostatniej zmianie dispatchera (`node --test scripts/__tests__/vitest-invocation.test.mjs scripts/__tests__/run-vitest-stable-shard.test.mjs`) zakończyły się kodem 0: 35 PASS, 5 SKIP (fixture'y POSIX na Windows), zero błędów. Nie dowodzą działania pominiętych scenariuszy.

Wznowiono pełny `test:run` na Node 24.18.0 i pnpm 9.15.4 z lokalnego katalogu tooling. Oba katalogi bin muszą poprzedzać globalne shimy w PATH: pierwsza próba z globalnym pnpm zatrzymała się przed testami, żądając reinstalacji modułów bez TTY. Reinstalacji nie wykonano; ponowienie z właściwym PATH przeszło preflight i uruchomiło shard czatu 1/6 (150/899 testów). W chwili tego zapisu proces nadal działa; brak wyniku shardu i całego zestawu. Nie uruchamiać drugiego pełnego przebiegu, dopóki obecny proces nie zakończy się. Log obserwacji znajduje się w katalogu roboczym tego czatu, poza repozytorium.

## Rozbudowa onboardingu istniejącego projektu — 4 XI

Dodano formularz `AddProjectRepositoryUrl` w `ProjectRepositories`: dołączanie źródła przez URL także po utworzeniu projektu, przez istniejące `projectsApi.createWorkspace` z zakresem firmy i typem git_repo. Zapis odświeża listę i oba klucze szczegółów projektu; błąd zachowuje adres do poprawy/ponowienia. Obecny routing serwera zachowuje read/workspace-write, walidację i audyt. Formularz informuje o autoryzacji prywatnych repo. Nie jest to dowód checkoutu ani pracy modelu. Test komponentu odrzucenie → ponowienie → sukces PASS (1/1); token gates i mapy PASS. Typecheck UI rozpoczęty, jeszcze bez wyniku końcowego; pełny test:run nadal działa na pierwszym shardzie. Zmiany pozostają lokalne do dalszego odbioru.

Odbiór przyrostu onboardingu: UI typecheck zakończył się kodem 0. Produkcyjny build z katalogu ui zakończył się kodem 0 (Vite 1m15s). Ostrzeżenia: selektory ::highlight, mieszane importy MarkdownEditor, rozmiary chunków i czas pluginów. Komponent 1/1, token gates, mapy i diff-check PASS. To odbiór zmienionego UI, bez pełnego monorepo PASS i bez żywego checkoutu/modelu. Pełny test:run uruchomiony wcześniej nadal działa.

## Pierwszy shard i przejście do rozmowy — 4 XI

Pełny przebieg zaliczył shard czatu 1/6: 351 PASS / 1482 SKIP (1833 zgłoszone wykonania; filtr kolekcji: 150/899 wpisów źródłowych). Pominięcia wynikają z filtrowania shardu; nie zaliczać ich do PASS. Rozpoczął się shard 2/6. Cały przebieg nadal bez wyniku końcowego.

Po pomyślnym utworzeniu projektu dialog otwiera teraz jego rozmowę przez firmowy router. Błąd zapisu pozostawia formularz i nie wywołuje przejścia. Testy formularza i dialogu: 6/6 PASS; rzeczywisty MemoryRouter potwierdza `/COS/projects/created-project/conversation`. Pierwsza próba ujawniła brak issuePrefix w starej fiksturze firmy (3 FAIL + 3 błędy); fiksturę uzupełniono i powtórzenie jest zielone. Nie jest to dowód dwóch sesji ani działania modelu.
Końcowe kontrole zmiany nawigacji: tsc -b w ui, token gates, mapy i git diff --check PASS. Nie ponawiano produkcyjnego buildu po tej zmianie; poprzedni build dotyczył przyrostu b46079aa2.

## Nawigacja onboardingu z rozmowy — 4 XI

Rozmowa udostępnia bezpośrednio konfigurację projektu (repozytoria/autoryzacja) i istniejący kreator agenta. Skrót tworzenia jest ukryty przy canManageCoordinator=false; docelowy kreator i backend nadal rozstrzygają uprawnienie tworzenia agentów w firmie. Nie przypisuje automatycznie nowego agenta do projektu. Pusty roster nie jest już deklarowany podczas pobierania ani błędu listy. Istniejące testy ProjectConversation: 29/29 PASS; UI tsc -b, token gates, mapy i diff-check PASS. Nie dodawano osobnych testów powtarzających treść odnośników. Żywy onboarding prywatnego repo/wykonawcy i odbiór dwóch osób pozostają otwarte.

## Synchronizacja profilu uczestnika — 4 XI, w toku

Wykryto brak publikacji po zmianie nazwy/awatara człowieka. PATCH profilu zapisuje teraz profil i audyt w jednej transakcji; po commit publikuje user.profile_updated w aktywnych firmach użytkownika, bez treści profilu. UI unieważnia katalog danej firmy i sesję tylko przy zmianie własnego profilu. Testy HTTP/profilu: 19 PASS (w tym rzeczywisty PostgreSQL: aktywne/nieaktywne członkostwo i brak danych profilu w zdarzeniu). UI LiveUpdatesProvider: 110 PASS. Typecheck serwera i UI uruchomione, brak wyniku końcowego na tym zapisie. Zmiany lokalne; pozostają próba rollbacku przy awarii audytu, pełne kontrole i dwie realne przeglądarki. Pełny test:run zaliczył shard 2/6 (324 PASS, 1509 SKIP) i rozpoczął 3/6; całość nadal nieodebrana.

Odbiór synchronizacji profilu, kolejny zapis: próba PostgreSQL z triggerem odrzucającym audyt PASS — odpowiedź 500, profil bez zmian, brak wpisu audytu i brak zdarzeń. Plik user-profile-routes 3/3 PASS, kod 0. UI tsc -b PASS, kod 0; mapy, token gates i diff-check PASS. Kontrola typów serwera nadal działa (natywny TypeScript 7); nie jest zaliczona. Dwie równoległe kontrole typów spowodowały presję pamięci, więc kolejne ciężkie kontrole wykonywać sekwencyjnie. Nie zatrzymano ani nie powielono uruchomionego test:run; trwa 3/6. Odbiór profilu pozostaje lokalny do wyniku serwera.

Końcowy wynik synchronizacji profilu: kontrola typów serwera zakończyła się kodem 0, UI również kod 0. Testy HTTP/profilu 19 PASS, dodatkowe ponowienie user-profile-routes z rollbackiem 3 PASS; UI invalidation 110 PASS. Mapy, token gates i diff-check PASS. Potwierdzono audyt i brak publikacji przy rollbacku, bez dwukontowego odbioru przeglądarkowego. Zmiana gotowa do checkpointu. Pełny test:run zaliczył shard 3/6 (293 PASS, 1540 SKIP) i uruchomił 4/6; całość nadal niezaliczona.

## Żywy odbiór dwóch kont przez API/WebSocket — 4 XI

Na osobnej instancji authenticated/private, loopback 3198, z tymczasowym PostgreSQL i testowymi sekretami uruchomiono prepare skryptu cosgral-e2e-two-accounts: exit 0, wszystkie asercje PASS. Osobne rzeczywiste rejestracje/sesje A/B/C/viewer, bootstrap, zaproszenia, prywatny projekt, osiem równoczesnych prób utworzenia jednej rozmowy; C/anon bez dostępu do WebSocket, viewer odczytuje i nie pisze. A→B 200 ms, B→A 144 ms; reconnect uzupełnia GET bez luk/duplikatów. Konfiguracja agentów A/B, join/leave/typing i kontrola dostępu PASS.

Dodano do prepare żywą próbę profilu: A zmienia nazwę/obraz, B otrzymuje content-free event i odczytuje poprawny profil przez chroniony katalog. PASS. Użyto testowego adresu obrazka, bez pobierania grafiki. To nie odbiór dwóch przeglądarek, nie działanie modelu i nie restart. Faza verify-after-restart obecnie wymaga POSIX-owych kontroli prywatności plików (getuid/mode); na Windows nie omijać tej ochrony. Tymczasowy host nadal uruchomiony dla kontynuacji odbioru; dane i poświadczenia poza repo. Skrypt kontrolny i logi znajdują się w work tego czatu, nie w publikowanych źródłach.

## Prywatne pliki odbioru na Windows — 4 XI

Skrypt dwóch kont korzysta z private-acceptance-file: POSIX zachowuje właściciela/mode 0600, Windows sprawdza właściciela i ACL (wyłącznie bieżący użytkownik, SYSTEM, administratorzy). Nowy plik powstaje pusty przez wx; przed zapisem treści otrzymuje prywatny ACL. Istniejących plików nie nadpisuje ani nie naprawia podczas odczytu. Obce/publiczne ACL i katalogi są odrzucane, błędny JSON nie ujawnia zawartości. Ścieżki używają basename/fileURLToPath także w testach.

Testy Windows końcowo 4/4 PASS (w tym rzeczywisty ACL z Everyone Read jako odmowa, wyłączność i redakcja błędnego JSON). Pierwsze próby były czerwone: odziedziczone szerokie ACL słusznie odrzucone, PowerShell 5 dziedziczył niezgodny PSModulePath z hosta 7, a negatywna fixture Set-Acl wymagała SeSecurityPrivilege. Tworzenie plików jawnie ustawia ACL, helper używa własnych systemowych modułów PS, fixture odmowy dodaje Everyone przez icacls; żadnego sprawdzania nie pominięto. Nie wykonano jeszcze verify-after-restart ani próby POSIX nowego helpera. Stan aktualizuje wcześniejsze ograniczenie getuid na Windows. Pełny test:run zaliczył shard 4/6 (310 PASS, 1523 SKIP), uruchomił 5/6.
