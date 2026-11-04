# COSGRAL: worktrees i uprawnienia wykonania

Stan: 2026-11-03, zadania 8 i 10. Polityka obejmuje wspólną rozmowę projektu
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

Proces nie dostaje wspólnego `.git`, konfiguracji repozytorium, refs ani metadanych
innych worktrees. Host przygotowuje w prywatnym runtime płytki widok Git:
odłączony własny HEAD, kopię własnego indeksu i prywatny pack zawierający tylko
obiekty bieżącego drzewa HEAD oraz bloby własnego indeksu. Nie montuje wspólnego
magazynu objects: ten ujawniłby także niepowiązane commity i bloby innych agentów.
Wskaźnik `.git` i ten widok są montowane tylko do odczytu. `git status`, `git diff`
i odczyt własnego HEAD/indeksu działają; zmiany indeksu, commitów i refs wykonuje
warstwa hosta/operator. Historia sprzed płytkiego HEAD nie jest dostępna.
Przygotowanie packa ma limit czasu 30 s i ograniczony rozmiar listy obiektów;
przekroczenie kończy turę błędem, bez słabszej izolacji. Pack powstaje na każdą turę,
więc koszt rośnie z wielkością bieżącego drzewa, nie z liczbą cudzych gałęzi.

`TMPDIR`, `TEMP`, `TMP` i ścieżki scratch Paperclip wskazują istniejący podkatalog
`tmp` własnego staged runtime. Jest zapisywalny także dla koordynatora i usuwany
w `finally` razem z runtime. Nie montuje się hostowego `/tmp/paperclip-run-*` ani
innych katalogów `/tmp`. Prywatne `/tmp` sandboxa pozostaje odizolowane.

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
lokalnym fikcyjnym executable `codex`. Próba adaptera sprawdza zapis `.sandbox-init`
w TMPDIR, prawdziwy `git status` i odczyt HEAD/indeksu, odmowę zapisu indeksu
oraz brak dostępu do unikalnego bloba drugiego worktree i wspólnej konfiguracji. Nie uruchamia modelu, API ani serwera.
Brak działającego sandboxa to FAIL, nie SKIP/PASS. Node tests skryptu sprawdzają
propagację błędu tej bramki. Ten wynik nie dowodzi pełnego heartbeat/delegowania,
kwalifikacji produkcyjnego Codex CLI, pracy z prawdziwymi credentials, restartu,
zdalnych runtime ani automatycznego reaper cleanup w żywej bazie.

## Dobór wykonawcy i decyzje człowieka (zadanie 10)

Koordynator otrzymuje na każdą turę projekcję agentów tej samej firmy: nazwę,
kompetencje, skonfigurowany model, status, reportsTo, liczbę otwartych zadań
(backlog/todo/in_progress/in_review/blocked) i aktywnych (bez backlog; obie liczby
bez samego kanału rozmowy), queued/running,
limit współbieżności, wolne sloty, dostęp do projektu oraz budżet/wydatki.
Nie otrzymuje surowej konfiguracji ani env. Kompatybilność `codex_local`/Linux
nie oznacza sprawdzonego logowania lub lokalnego środowiska: dispatch nadal
weryfikuje runtime. Limit dostawcy i rzeczywisty koszt konta są nieznane.
Od t15 roster zawiera też jawnie wersjonowany koszt referencyjny API znanych
modeli; to nie jest potwierdzenie opłat na koncie.
Dobór bierze pod uwagę rodzaj pracy, kompetencje, obciążenie i dostępność;
niezależne zadania mogą działać równolegle w istniejących limitach, zależne
kolejno. Budżet 0 oznacza brak skonfigurowanego limitu miesięcznego. Snapshot
nie przyznaje nowych praw do przypisania zadania.

Zadanie wymagające zgody człowieka jest **propozycją `suggest_tasks`** w rozmowie,
a nie równocześnie utworzonym wykonywalnym zadaniem. To trwałe oznaczenie bramki.
Istniejące interactions przechowują oczekującą decyzję. Akceptacja tworzy zwykłe
przypisane zadania todo atomowo; odrzucenie nie tworzy zadania. Zwykłe istniejące
zadanie nie zyskuje takiej bramki od samego tekstu w tytule lub etykiety — należy
najpierw użyć propozycji, zgodnie z instrukcją koordynatora. Dla decyzji bez nowego
zadania służy `request_confirmation`, z kontynuacją `wake_assignee` i obowiązkiem
odczytu zapisanej decyzji przed zależną pracą. Istniejące approvals operacji
zarządzanych nadal obowiązują; karta ich nie zastępuje.

Serwer wymusza `human_only` na obu rodzajach kart w wspólnej rozmowie. Nie
adresuje ich do pojedynczego agenta/użytkownika; oba uprawnione konta mogą
zdecydować, widz tylko czyta. Zwykły komentarz nie jest zgodą i nie zastępuje
potwierdzenia. Proponowane zadania pozostają w tym projekcie/drzewie. UI używa
istniejącego resolvera kart i zdarzeń `issue.thread_interaction_*` do odświeżenia
u obu użytkowników, z obsługą błędów i ponawiania. Nie dodano osobnego
orkiestratora, protokołu zatwierdzania, pollingu ani migracji.

## Dobór przez API i wznowienie po decyzji (zadanie 13)

Przed utworzeniem zadania albo propozycji koordynator wywołuje
`POST /api/issues/:conversationId/executor-selection` z `{title, description?,
role?, model?, preferredAgentId?}`. Dostęp ma uprawniony operator albo przypisany
koordynator z uwierzytelnionym runem. Serwer sprawdza tę samą politykę
`tasks:assign` dla projektu, rodzica i kandydata, której używa tworzenie zadania.
Bierze wyłącznie agentów firmy z dostępem do projektu, zdrową hierarchią,
statusem idle/running, zgodnym lokalnym CLI, wolnym slotem i niewyczerpanym budżetem.
Koordynator nie wybiera siebie. Ranking: jawnie wskazana rola (100), liczba
wspólnych słów zadania i roli/kompetencji (po 10), zgodny wskazany model (1),
następnie referencyjny koszt modelu, liczba otwartych zadań, aktywnych zadań,
runów i rosnące ID. Otwarte obejmują backlog/todo/in_progress/in_review/blocked
w całej firmie, bez rozmów projektu; aktywne nie obejmują backlog. Runy to
queued/running. Gotowość lifecycle musi być ready. Pełny slot albo wyczerpany
budżet wykluczają także jawny wybór; pauza nadal wyklucza.

Koszt to jawny koszyk porównawczy standardowego API: 1 mln tokenów wejścia bez
cache + 1 mln wyjścia, z wersjonowanego cennika w `codex-pricing.ts`. Nie ocenia
zapotrzebowania zadania na tokeny, rzeczywistego rachunku ani subskrypcji. Nie
pobiera cennika z sieci. Model spoza cennika: „brak danych o koszcie”. Gdy choć
jeden uprawniony kandydat o równym dopasowaniu nie ma ceny, porównanie kosztu
wyłącza się dla całej tej grupy (spójne sortowanie bez zgadywania). To prosta
reguła słownikowa, nie semantyczna ocena kompetencji. Osobnego limitu otwartych
zadań nie ma w modelu agenta; nie tworzymy fikcyjnego limitu ani quota dostawcy.

Wskazany `preferredAgentId` ma pierwszeństwo wśród dostępnych, uprawnionych
kandydatów. Niedostępny jawny wybór zwraca 422, bez cichej zamiany. Bez dopasowania
serwer stosuje ten sam ranking kosztu referencyjnego i obciążenia, a remis
rozstrzyga stałym porządkiem ID.
Brak kandydata również daje 422. Wynik `{agentId, reason, commentId}` zapisuje
uzasadnienie i powody wykluczeń/niższej pozycji jako komentarz autora operacji
i publikuje `issue.comment_added`. Również odmowa 422 zapisuje powód w rozmowie
(`details.commentId` w odpowiedzi błędu).
Nie uruchamia zadania ani wake. Nie rezerwuje slotów; tworzenie, akceptacja
propozycji i dispatch ponownie stosują swoje zwykłe uprawnienia i limity.
Koordynator dostaje instrukcję użycia zwróconego ID; API rekomendacji nie blokuje
wszystkich innych istniejących dróg przypisania zadań.

Oba rodzaje kart w rozmowie wymuszają teraz `wake_assignee`, również gdy autor
poda `none` lub kontynuację tylko po akceptacji. Istniejący mechanizm kontynuacji
zapisuje decyzję i kieruje wake po akceptacji lub odrzuceniu. Oczekująca propozycja
nie tworzy zadania. `GET /projects/:id/conversation` zwraca
`canResolveApprovals` z polityki mutacji wątku; UI przy braku tego uprawnienia
pokazuje historię i wyłącza przyciski. Serwer nadal samodzielnie egzekwuje odmowę
widzowi, agentowi i osobie bez dostępu do projektu/firmy. Opcjonalne etykiety akcji
przekazane przez widok rozmowy działają także w zwykłym potwierdzeniu, więc
„Odrzuć” działa obok „Zatwierdź”. Decyzje operacji zarządzanych w `/approvals` zachowują własne bramki.

Weryfikacja obejmuje PostgreSQL, HTTP z syntetycznymi aktorami, zapis komentarzy,
karty UI i wywołania istniejącego heartbeat (wakeup zastąpiony spy, bez modelu).
Odbiór żywych runów po decyzji i dwóch przeglądarek pozostaje osobnym testem nadzorcy.

## Punkty montowania Codexa i rozliczenie tury (zadanie 11)

Przed zamontowaniem repo koordynatora RO adapter przygotowuje w jego własnym
worktree brakujące puste katalogi `.agents`, `.codex` i `.aws`. Zainstalowany
Codex 0.162.1 tworzy dla tych ścieżek ochronne mounty nawet wtedy, gdy nie istnieją;
w RO cwd nie może sam przygotować ich celów. `.git` jest już istniejącym plikiem
worktree, przykrywanym dotychczasowym prywatnym widokiem Git RO. Istniejące katalogi
i ich zawartość pozostają; symlink lub plik zamiast katalogu ochronnego zatrzymuje
wykonanie. Nie są kopiowane katalogi operatora ani jego credentials. Repo nadal
jest RO, runtime RW, approvals never i brak bypass. Worker zachowuje własny RW
worktree; oba warianty sprawdzono ręcznie prawdziwym `codex sandbox`, bez modelu.

Po turze serwer sprawdza nie tylko odpowiedź agenta, lecz także zapisane efekty:
nowe dziecko utworzone przez ten run/agenta w tym projekcie, interakcję tego runu
w rozmowie lub audyt utworzenia/aktualizacji dziecka przez ten run/agenta.
Raport po ukończeniu dziecka nie wymaga nowego zadania: serwer sprawdza zapisane
`completedChildIssueId`, projekt, rodzica i status done. Brak odpowiedzi albo
potwierdzonej operacji daje idempotentny systemowy komentarz błędu widoczny
w rozmowie, także gdy agent sam napisał, że delegował. Status wyjścia procesu
może pozostać `succeeded`; nie jest potwierdzeniem wykonania polecenia.

To zachowawcza kontrola efektów, bez klasyfikowania intencji tekstu: także zwykła
odpowiedź informacyjna bez operacji otrzymuje błąd weryfikacji delegowania.
Nie dowodzi zgodności treści utworzonego zadania z pełną intencją użytkownika.
Nie uznaje starego zadania/interakcji z innego runu za nowy efekt. Nie tworzy
zadań, nie ponawia tury i nie obchodzi bramek zgody.

## t14 — wiadomości agent–agent w rozmowie projektu

Adresowanie korzysta z istniejącego zadania: agent wysyła
`POST /api/issues/{zadanie-adresata}/comments` z `{ "body": "treść" }`.
Adresatem jest agent przypisany do zadania w chwili zapisu. Serwer zapisuje
snapshot `metadata.recipientAgentId`, autor pochodzi z uwierzytelnionego aktora.
Samo `@agent` w Markdown nie wybudza adresata. Nie powstała nowa ścieżka zapisu
ani grant dostępu; komentarz musi przejść dotychczasową politykę firmy,
projektu i zadania. Widz może czytać, ale nie wysyłać ani zatwierdzać.

Pierwsza wiadomość może użyć istniejącego wake przypisanego wykonawcy.
Jeżeli bieżący run został wybudzony komentarzem innego agenta, jego odpowiedź
zapisuje się, ale nie wywołuje kolejnego wake komentarzem. Dotyczy POST oraz
PATCH zadania z komentarzem w rozmowie i jej bezpośrednich dzieciach. Agent bez
poprawnego aktywnego runu również nie inicjuje takiego wake. Nie należy
zastępować tego ręcznym wake/resume/reopen ani nową delegacją. Zakończenie
zadania nadal może normalnie wybudzić koordynatora do raportu.

Raport audytu można jawnie oznaczyć przez
`{ "body": "wynik audytu", "messageKind": "audit" }` w POST komentarza.
To klasyfikacja prezentacji, nie nadanie uprawnień. Serwer i UI używają jednej
czystej funkcji z `packages/shared/src/project-conversation-history.ts`.
Priorytet: błąd/system/audyt, zadanie/zgoda, wiadomość adresowana/inny agent,
koordynator, człowiek. Treść wiadomości nie służy do zgadywania kategorii.
Historyczne komentarze bez snapshotu nie otrzymują domyślonego adresata.

Dodatkowa historia jest odczytywana przez
`GET /api/issues/{rozmowa}/project-history?cursor=...`; dane pozostają w swoich
kanonicznych tabelach. Nie zawiera surowych komunikatów runtime ani sekretów.
Widok pokazuje liczniki wczytanych wpisów; główne komentarze oraz zdarzenia
projektu mają niezależne przyciski pobierania starszych stron. Klasyfikacja
koordynatora odnosi się do aktualnie wybranego koordynatora projektu.

Żywy odbiór nadzorcy (uruchamia modele i tworzy osobną firmę testową):
`node scripts/cosgral-e2e-messages.mjs --api http://127.0.0.1:3199 --codex-home /ścieżka/do/uprawnionego/konta --timeout-sec 900`.
Skrypt zachowuje firmę i repozytoria w `/tmp` jako dowód, a na końcu pauzuje
agentów i anuluje aktywne runy. Nie usuwa dowodów ani nie uruchamia serwera.
Weryfikuje klasyfikację delegowania/statusów, nadawcę/adresata, odpowiedź,
ograniczoną liczbę udanych runów i 75 sekund bez dalszych zmian/retry.


## Zakres t15 i odbiór równoległości

T15 domyka dobór wg kosztu referencyjnego, obciążenia i istniejących limitów.
Nie wprowadza limitu równoległych dzieci ani bariery pojedynczego raportu.
Dotychczasowa ścieżka nadal budzi koordynatora po każdym ukończonym dziecku.
Nie traktować instrukcji „parallel” jako gwarancji zabezpieczenia silnika.

`scripts/cosgral-e2e-parallel.mjs` jest przygotowanym testem odbioru docelowego
zachowania, z walidatorem testowanym bez modeli. Tworzy dwóch wykonawców o różnym
koszcie referencyjnym/obciążeniu i wymaga dwóch dzieci, różnych wykonawców,
odrębnych worktree, nakładających się runów, zapisanych powodów, obu done,
jednego raportu po obu zakończeniach i dokładnie czterech udanych runów oraz
75 sekund ciszy. Wykonuje się go dopiero po wdrożeniu limitu i bariery wake;
obecny silnik może słusznie nie przejść tego odbioru. Nie uruchamiano go z modelem.
