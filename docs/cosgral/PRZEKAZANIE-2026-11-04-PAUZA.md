# Przekazanie po wstrzymaniu — 4 listopada 2026

Użytkownik nakazał zatrzymać wszystko, zapisać stan i wypchnąć na GitHub.
Cel budowy jest wstrzymany. Nie wznawiać procesów bez nowego polecenia użytkownika.

## Źródła i zapisane zmiany

Repo: `kacperkretowicz-wq/cosgral-workspace`, gałąź `codex/cosgral-workspace`.
Aktualny checkout lokalny:
`C:/Users/kretowicz_k/Documents/Codex/2026-11-04/polacz-sie-z-repo-cosgral-workspace/work/cosgral-workspace`.
Starszy `C:/Users/kretowicz_k/Documents/Codex/cosgral-qa` ma dawne, niezapisane zmiany — nie scalać ani nie resetować ich automatycznie.

Nowe commity tej kontynuacji:

- `b46079aa2`: URL repozytorium także w istniejącym projekcie, przez obecne API workspace.
- `49e2ff63f`: po utworzeniu projektu otwierana jest jego wspólna rozmowa z właściwym prefiksem firmy.
- `2443ef97d`: z rozmowy dostępne są konfiguracja projektu i kreator agenta; poprawiony pusty stan podczas pobierania agentów.
- `c8c1d17ee`: profil człowieka + audyt w jednej transakcji, publikacja po commit wyłącznie do aktywnych firm; katalog użytkowników i własna sesja odświeżane przez realtime.
- `51c335ab3`: żywa dwukontowa próba synchronizacji profilu w istniejącym skrypcie.
- `06c92e0e2`: prywatne pliki odbioru na Windows przez ACL, POSIX nadal właściciel/0600; wyłączne tworzenie przed zapisem sekretów, bez naprawiania ACL podczas odczytu.

## Potwierdzone wyniki

- Formularz URL: 1 PASS; nowy projekt/nawigacja: 6 PASS; rozmowa: 29 PASS.
- Zapis profilu i HTTP: 19 PASS; ponowienie pliku z rzeczywistym PostgreSQL i awarią audytu: 3 PASS. Odpowiedź 500 przy awarii audytu, profil i audyt wycofane, brak zdarzeń realtime.
- LiveUpdatesProvider: 110 PASS; UI i serwer typecheck zakończone kodem 0.
- Prywatne pliki/skrypt dwóch kont: 4 PASS na Windows, w tym odrzucenie Everyone Read, brak nadpisania pliku i nieujawnianie błędnego JSON.
- Aktualny produkcyjny build UI: PASS, 1m40s. Ostrzeżenia o ::highlight, importach MarkdownEditor, rozmiarach chunków i czasie pluginów. Nie są dowodem odbioru przeglądarkowego.
- Mapy, token gates i diff-check: PASS. Testy wrappera Vitest: 35 PASS / 5 SKIP (fixture'y POSIX na Windows).
- Wszystkie 6 shardów integracyjnych czatu: 351 + 324 + 293 + 310 + 298 + 257 = **1833 wykonania PASS**. Pominięcia w poszczególnych shardach wynikają z filtrowania. Pełny `test:run` przeszedł następnie do general-server (164 suite'y wydzielone jako serialized), ale został zatrzymany na polecenie użytkownika. Całe monorepo test/build/typecheck NIE jest zaliczone.

## Żywa próba dwóch kont

Dwie osobne tymczasowe instancje authenticated/private, loopback 3198, świeży PostgreSQL, sztuczne konta A/B/C/viewer i testowe sekrety; bez modeli i poświadczeń dostawców.
Prepare skryptu dwóch kont: dwukrotnie PASS, exit 0. Obejmuje zaproszenia, prywatny projekt, jedną rozmowę przy równoległym tworzeniu, odmowy C/anon/viewer, A/B wiadomości (pierwsza próba 200/144 ms, druga 203/139 ms), reconnect z GET bez luk/duplikatów, konfigurację agentów, obecność/typing oraz nazwę/obraz profilu A widoczne przez chroniony katalog B. To sesje API/WebSocket, NIE dwie przeglądarki.

Kontroler drugiej próby zamknął pierwszy proces aplikacji i uruchomił nowy przy tej samej działającej bazie i sekretach. Osiągnięto `ACCEPTANCE_RESTART_READY`, lecz użytkownik wstrzymał pracę przed `verify-after-restart`. Nie zaliczać trwałości historii po restarcie. Sygnał stop zakończył kontroler kodem 0 i `ACCEPTANCE_STOPPED`; tymczasowa baza została posprzątana. Przygotowany skrypt dwóch przeglądarek NIE został uruchomiony.

Wszystkie procesy tej pracy zatrzymane: pełny test przerwany na żądanie, host/kontroler i PostgreSQL zakończone, port 3198 bez listenera. Nie ma wdrożenia produkcyjnego.

## Artefakty lokalne poza Git

`C:/Users/kretowicz_k/Documents/Codex/2026-11-04/pol/work/`:

- `cosgral-tests.log`: pełny zapis do zatrzymania;
- `cosgral-profile-*.log`, `cosgral-private-file-tests.log`, `cosgral-ui-acceptance-build.log`: kontrole zakresu;
- `auth-acceptance-host.mjs`: pierwszy, zakończony host;
- `auth-restart-controller.mjs`, `auth-server-child.mjs`: kontroler PostgreSQL i osobnego procesu aplikacji;
- `two-browser-acceptance.mjs`: NIEURUCHOMIONY scenariusz UI (osobne konteksty Chromium, wiadomości, nazwa, rzeczywisty upload PNG i obraz w drugim kontekście);
- katalogi `auth-acceptance` i `auth-restart-acceptance`: stare wyniki i prywatne pliki kont testowych. Nigdy nie publikować plików credentials, cookies ani kompletnych logów bez przeglądu. Dane baz tych uruchomień nie są już dostępne.

Kontroler odmawia użycia starego katalogu z ready.json. Po wznowieniu użyć świeżego katalogu i nowej bazy. Stare PID-y/ready.json nie świadczą o żywym procesie. Pierwszy start kontrolera miał błąd Windows --import; poprawka pathToFileURL jest już w lokalnym skrypcie. Nie kopiować bez sprawdzenia ścieżek na inną maszynę.

## Dalsza kolejność po wznowieniu

1. Sprawdzić HEAD/status/origin oraz brak starych procesów. Node 24.18.0, pnpm 9.15.4; lokalny tooling pnpm musi poprzedzać globalny shim w PATH.
2. Dokończyć odbiór restartu i dwóch przeglądarek na świeżej instancji. Następnie wyłączyć ją i potwierdzić zamknięcie bazy/portu. Nie zaliczać API/WS jako dowodu renderowania UI.
3. Dokończyć pozostałe grupy pełnego test:run, pełny build i repo-wide typecheck. Kontrole typów wykonywać kolejno: dwie naraz wywołały presję RAM (serwerowy TypeScript 7 dochodził do kilkunastu GB). Przerwanie przez użytkownika nie jest ani PASS, ani dowodem awarii.
4. Linux z bwrap: odtworzyć P0 ~110 s z profilem CPU i niezależnym health. P0 pozostaje otwarte; poprawki redakcji nie dowodzą usunięcia pierwotnej przyczyny. Nie wyłączać izolacji.
5. Żywy checkout prywatnego repo → koordynator → wykonawca oraz trwały hosting i odbiór na dwóch komputerach. Darmowy hosting bez karty nadal nieustalony; Oracle zatrzymało się na rejestracji. Nie tworzyć płatnych zasobów; Codespaces było odłożone.
6. Pozostały zakres oryginalnego promptu: runtime'y/konta, MCP/skille/pluginy per agent, pamięć repo, pełny UX i końcowy odbiór. Oryginalny zakres pozostaje w COSGRAL-PROMPT-POSTEP.md.

Szacunek przekazany użytkownikowi: implementacja około 75%, gotowość do codziennej pracy około 55%. To ocena zakresu, nie zmierzony procent testów ani deklaracja zakończenia.
