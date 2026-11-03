# COSGRAL: worktrees i uprawnienia wykonania

Stan: 2026-11-03, zadanie 8. Polityka obejmuje wspólną rozmowę projektu
`cosgral_project_conversation` i jej potomków w tym samym projekcie/firmie.
Serwer rozpoznaje rolę z zapisanej hierarchii, nie z instrukcji lub payloadu wake.
Zwykłe zadania poza tą hierarchią zachowują dotychczasową konfigurację.

## Granice

- Obsługiwany runtime: Linux, `codex_local`, legacy CLI oraz działający `bwrap`.
  ACP, native Runner, inne adaptery i zdalne środowiska są odrzucane przed
  wykonaniem. Nie ma automatycznego osłabienia izolacji. Wybór koordynatora w UI
  nadal sprawdza dostęp/gotowość; sam wybór nie kwalifikuje jego runtime.
- Wykonawca: istniejące execution workspaces, tryb `isolated_workspace`, strategia
  `git_worktree`, gałąź `cosgral/<issue UUID>/<agent UUID>`. Koordynator otrzymuje
  osobny worktree `cosgral-coordinator/<issue UUID>/<agent UUID>`, montowany tylko
  do odczytu. Worktrees zawierają zapisany stan Git; niezacommitowane pliki źródłowego
  checkoutu (w tym lokalny `.env`) nie są przenoszone. Repozytorium i historia Git
  muszą być wolne od sekretów; mechanizm nie klasyfikuje treści śledzonych plików.
- Istniejący workspace musi należeć do tego samego zadania i wykonawcy i mieć
  oczekiwaną gałąź. Inny binding zatrzymuje wykonanie. Obecne checkout/execution
  locks i workspace persistence pozostają właścicielami współbieżności i odzyskiwania.
- Sandbox Codexa: obie role `workspace-write` (zapis repo koordynatora blokuje
  dodatkowy mount tylko do odczytu w `bwrap`), approvals
  `never`. Wyłączone oba warianty bypass; własne komendy, profile i dodatkowe
  argumenty CLI nie mogą nadpisać tej polityki. Powtórne wymuszenie jest w adapterze.
- Zewnętrzna granica procesu to istniejący `filesystemScope: workspace` (`bwrap`).
  Świeży root, własny PID namespace i prywatne `/tmp`; brak montowania katalogu
  domowego operatora, serwera, checkoutów sąsiada i innych agentów. W systemie hosta
  zapisywalny jest własny worktree i staging własnego runtime. Koordynator może
  zapisywać tylko runtime, nie repo. Systemowe biblioteki i instalacja narzędzia
  są tylko do odczytu; instalacja binariów musi być zaufana i pozbawiona sekretów.
- Proces nie dziedziczy środowiska serwera. Dostaje PATH/locale oraz jawnie
  rozwiązaną konfigurację bieżącego agenta/runu, własny token API i dozwolone
  capabilities. Własne poświadczenie dostawcy jest konieczne do użycia modelu.
  Nie kopiuje się konfiguracji operatora, jego sesji ani niepowiązanych logowań.
  Autoryzowane skills są dostarczane istniejącym mechanizmem i dereferencjonowane
  przez istniejący allowlist staging Codex home; staging i prywatny home każdej
  tury są usuwane w finally. Odświeżenie własnego credentials korzysta z obecnego
  mechanizmu same-identity/newer-only copy-back do wybranego źródła.
- Każda tura używa świeżej sesji CLI. Stan zadania/komentarze pozostają w Paperclip;
  nie wznawia się sesji dostawcy z usuniętego stagingu. Backendowe approvals,
  budżety, scope firmy/projektu i prawo do operacji API nadal obowiązują.

To polityka wykonania zadania, nie nowy model autoryzacji wszystkich agentów firmy.
Operator nadal zarządza konfiguracją, przypisaniem, hierarchią i źródłem Git.
Sieć zachowuje istniejącą konfigurację egress; nie jest tu dodawany filtr sieciowy.
Nie należy udostępniać w sieci usług ujawniających pliki/sekrety bez autoryzacji.

## Git i sprzątanie

Proces nie dostaje wspólnego `.git` źródłowego repo: wskaźnik `.git` w standardowym
worktree prowadzi poza zamontowany katalog. Dzięki temu nie może zmienić wspólnych
refs/konfiguracji ani metadanych innych worktrees. Edycja i testy plików działają;
CLI Git wymagające wspólnego gitdir (np. status/commit) pozostają niedostępne.
Dostarczenie zmian i operacje Git wykonuje zaufana warstwa hosta/operator w ramach
istniejącego procesu projektu. Nie dodano brokera operacji Git.

Nie usuwa się katalogu tylko dlatego, że run się skończył: zadanie może mieć
kolejne tury, a wynik może czekać na zachowanie. Istniejący terminal-workspace
cleanup usuwa worktree/gałąź po terminalności drzewa, potwierdzonym dostarczeniu
zmian (merge/ancestry), braku dirty files i retencji (domyślnie jeden dzień).
Niedostarczona/niezacommitowana praca pozostaje do odbioru. Aktywny kanał zachowuje
worktree koordynatora. Awaria/stoppage nie jest dowodem bezpiecznego usunięcia.

## Weryfikacja bez modelu

```sh
PATH=/home/box/tools/bin:$PATH node scripts/cosgral-e2e-delegation.mjs --verify-isolation
```

Uruchamia rzeczywisty Git w jednorazowym repo `/tmp` (tylko tam tworzy fixture
commit), dwa równoległe worktrees, prawdziwe procesy `bwrap`, próby zapisu/odczytu
canary, czyszczenie pojedynczego worktree oraz prawdziwą ścieżkę adaptera z
lokalnym fikcyjnym executable `codex`. Nie uruchamia modelu, API ani serwera.
Brak działającego sandboxa to FAIL, nie SKIP/PASS. Node tests skryptu sprawdzają
propagację błędu tej bramki. Ten wynik nie dowodzi pełnego heartbeat/delegowania,
kwalifikacji produkcyjnego Codex CLI, pracy z prawdziwymi credentials, restartu,
zdalnych runtime ani automatycznego reaper cleanup w żywej bazie.
