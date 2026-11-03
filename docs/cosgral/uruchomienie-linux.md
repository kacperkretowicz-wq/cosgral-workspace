# Uruchomienie na Linux — sesja 3 XI 2026

Sprawdzone środowisko: Linux x64, Node **24.22.2**, pnpm **9.15.4**, Codex CLI **0.162.1**. Zależności były już zainstalowane. Poniżej potwierdzono start **samego API**, nie całego interfejsu ani wykonania zadania przez model.

## Potwierdzony start API

Z katalogu repozytorium, po instalacji zależności:

```sh
pnpm --filter @paperclipai/plugin-sdk build
env -u DATABASE_URL PAPERCLIP_HOME=/tmp/cosgral-linux-codex-1 pnpm db:migrate
env -u DATABASE_URL PAPERCLIP_HOME=/tmp/cosgral-linux-codex-1 HOST=127.0.0.1 PORT=3100 PAPERCLIP_MIGRATION_AUTO_APPLY=true pnpm --filter @paperclipai/server dev
```

Migracje w tej sesji uruchomił wcześniej `pnpm dev:once --data-dir /tmp/cosgral-linux-codex-1`; wykorzystał ten sam mechanizm `db:migrate` i zastosował 422 migracje. Samodzielnego wywołania drugiej komendy powyżej nie powtarzano. Serwer działał na tej przygotowanej bazie. Bez `DATABASE_URL` bieżący kod używa **embedded PostgreSQL**, nie PGlite. Port bazy w tej instancji: **54329**.

W drugim terminalu:

```sh
curl --max-time 5 -fsS http://127.0.0.1:3100/api/health
curl --max-time 5 -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:3100/api/agents/me
```

Wyniki: health HTTP 200, `status: ok`, `startupRecovery.phase: ready`; `/agents/me` bez klucza — HTTP 401. W logu startu: `UI dist not found; running in API-only mode`. `authReady: true` w health nie oznacza gotowości JWT agentów: banner osobno zgłosił `Agent JWT missing`.

Zatrzymanie: Ctrl+C w terminalu serwera. Po zatrzymaniu sprawdzono odmowę połączenia na obu portach 3100 i 54329. Dane testowe pozostały w `/tmp/cosgral-linux-codex-1`; to katalog tymczasowy, nie miejsce trwałej instalacji. Tryb `local_trusted` służy jednemu lokalnemu operatorowi; konfiguracja dwóch kont wymaga osobnej weryfikacji `authenticated`.

## Pułapki

- `pnpm dev:once --data-dir /tmp/cosgral-linux-codex-1` nie zakończył startu. Najpierw brakowało `@paperclipai/plugin-sdk/dist/index.js`. Następnie budowa natywnego runnera nie mogła utworzyć cache w `/home/box/.cargo/registry/cache` (system plików tylko do odczytu). Budowa SDK i start bezpośredni umożliwiły test API; **nie potwierdzają działania natywnego runnera**. Nie zmieniano uprawnień sandboxa.
- Produkcyjny onboarding powinien utworzyć trwały sekret JWT poza repozytorium. W tej sesji go nie skonfigurowano. `runtime-execution.ts` przy jego braku tylko ostrzega, a `execute.ts` nie dostaje tokenu do `PAPERCLIP_API_KEY`. Nie drukować `.env`, `auth.json`, tokenów ani pełnego środowiska procesu. Przed pełnym testem potwierdzić wyłącznie obecność zmiennych, bez ich wartości.
- Domyślny Codex local ma teraz bypass wyłączony. Ścieżka CLI już wcześniej ustawiała `workspace-write` z `sandbox_workspace_write.network_access=true`; jawny profil/sandbox w `extraArgs` zachowuje własną politykę. `network_access=true` umożliwia ogólny dostęp sieciowy, nie wyłącznie loopback. Nie rozszerzono tej polityki. Opcjonalne istniejące `networkScope=allowlist` wymaga Bubblewrap, jawnego `engine=cli` i osobnego sprawdzenia proxy oraz połączenia do API.
- Korzystać z wstrzykniętego `PAPERCLIP_API_URL` (bez dopisywania drugiego `/api`) i `PAPERCLIP_API_KEY`, a dla mutacji z `X-Paperclip-Run-Id`. Nie zakładać na sztywno portu hosta dla SSH/kontenera. Adapter instaluje skill Paperclip w efektywnym `CODEX_HOME/skills`; dostęp do API przez curl nie wymaga globalnego `paperclipai`. Globalnej binarki nie znaleziono w PATH tej maszyny.

## Ograniczenie próby Codexa i następny test

Prosty serwer Node na `127.0.0.1` z losowym portem zwrócił z hosta `cosgral-loopback-ok`. Próby `codex exec -s workspace-write` z `-c sandbox_workspace_write.network_access=false` oraz `true` nie dostarczyły wyniku curl. Powtórzenie z `--json` również nie zwróciło zdarzeń wykonania; proces kończył się kodem 0, wypisując ostrzeżenie `Read-only file system`. Nie uznano kodu 0 za zaliczenie eksperymentu. Używano bieżącego `CODEX_HOME`, bez odczytu i przenoszenia jego poświadczeń.

Bezpośredni `codex sandbox -c 'sandbox_mode="workspace-write"' -- true` oraz warianty z curl i obiema politykami sieci zakończyły się kodem 1: `error building bubblewrap command: app-server socket directory must be a user-owned directory with mode 0700`. Ten problem środowiska uniemożliwił porównanie dostępu z wnętrza sandboxa.

Na maszynie z działającym sandboxem i zapisowalnym bieżącym `CODEX_HOME` powtórzyć porównanie false/true na prostym HTTP. Następnie skonfigurować JWT standardowym onboardingiem i uruchomić pojedynczego agenta z `engine=cli`, `dangerouslyBypassApprovalsAndSandbox=false`, bez dodatkowych flag omijających zabezpieczenia. Sprawdzić z jego narzędzia shell kolejno health, `/api/agents/me`, checkout przypisanego zadania, komentarz i zapis statusu `done`, a potem niezależnym odczytem API potwierdzić zmianę oraz brak kolejnego retry. **Żadnego z tych kroków pełnego cyklu nie uznano tutaj za zaliczony.**

## Trwały JWT agentów i powtarzalny e2e (Codex #2)

`server/src/agent-auth-jwt.ts` odczytuje `PAPERCLIP_AGENT_JWT_SECRET` (awaryjnie `BETTER_AUTH_SECRET`). `cli/src/config/env.ts` i onboarding `pnpm paperclipai onboard` tworzą sekret w pliku env instancji. Przy bezpośrednim starcie serwera można zamiast onboardingu jawnie załadować poniższy prywatny plik. Nie jest to klucz modelu: heartbeat podpisuje nim krótkotrwały token konkretnego agenta/runu, a adapter Codex przekazuje token jako `PAPERCLIP_API_KEY`. `local_trusted` nie zastępuje uwierzytelniania agenta.

Przykład trwałej konfiguracji dla jednego lokalnego operatora, poza repozytorium. Uruchamiać bez `set -x`; nie używać `cat`, `printenv`, debugowania środowiska ani kopiowania poświadczeń. Generowanie jest jednorazowe i odmawia nadpisania istniejącego pliku. Przy kolejnych startach pominąć blok generowania. Zachować ten sam plik przy restartach.

```sh
set +x
install -d -m 700 "$HOME/.config/cosgral"
node --input-type=module <<'NODE'
import { randomBytes } from 'node:crypto';
import { writeFileSync, chmodSync } from 'node:fs';
const file = `${process.env.HOME}/.config/cosgral/agent-jwt.env`;
writeFileSync(file, `PAPERCLIP_AGENT_JWT_SECRET=${randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
chmodSync(file, 0o600);
NODE
```

Start osobnej instancji odbiorowej (API, dane poza repo). `PAPERCLIP_API_URL` jest bazą bez `/api`; adapter dodaje prefiks sam. Podany `CODEX_HOME` musi należeć do nadzorcy, zawierać jego istniejące logowanie oraz umożliwiać instalację skilla w `skills/`. Nie kopiować `auth.json`. Polecenia modelu uruchamiać poza sandboxem tej sesji, na hoście obsługującym sandbox Codexa.

```sh
pnpm --filter @paperclipai/plugin-sdk build
env -u DATABASE_URL PAPERCLIP_HOME=/tmp/cosgral-agent-lifecycle pnpm db:migrate
set +x
set -a
. "$HOME/.config/cosgral/agent-jwt.env"
set +a
env -u DATABASE_URL PAPERCLIP_HOME=/tmp/cosgral-agent-lifecycle HOST=127.0.0.1 PORT=3199 PAPERCLIP_API_URL=http://127.0.0.1:3199 PAPERCLIP_MIGRATION_AUTO_APPLY=true pnpm --filter @paperclipai/server dev
```

W drugim terminalu, z katalogu repozytorium (dla standardowego istniejącego katalogu `$HOME/.codex`; przy innym logowaniu zmienić tylko ścieżkę):

```sh
node scripts/cosgral-e2e-agent-lifecycle.mjs --api http://127.0.0.1:3199 --codex-home "$HOME/.codex" --timeout-sec 300
```

Skrypt używa wyłącznie lokalnego HTTP i REST API, tworzy osobną firmę, agenta `codex_local` (`runner=legacy`, `engine=cli`, `gpt-5.6-terra`, bypass `false`, bez `extraArgs`), projekt i przypisane zadanie. Przypisanie nie wyzwala dodatkowego wake; potem skrypt jawnie włącza wake na żądanie i wysyła jedno `/wakeup`. Agent ma zapisać komentarz `ok` oraz `done` przez API według skilla Paperclip. Zakończenie procesu Codexa nie jest dowodem zaliczenia.

PASS (exit 0) wymaga niezależnego odczytu `done`, komentarza `ok` właściwego agenta, 1–2 zakończonych runów i braku zaplanowanego retry. Obserwacja trwa jeszcze 75 s po zakończeniu ostatniego runu (retry mają opóźnienia 30/60 s); wlicza się w timeout. FAIL (exit 1) podaje powód i końcówki logów z dodatkowym maskowaniem typowych tokenów/poświadczeń. Nie uruchamiać poleceń drukujących sekrety w samym zadaniu. Skrypt wstrzymuje agenta i anuluje aktywne runy także po błędzie lub SIGINT/SIGTERM. Pozostawia dane i pusty katalog roboczy `/tmp/cosgral-e2e-work-*` do inspekcji; nie usuwa firmy ani nie ustawia sam `done`. SIGKILL lub utrata API uniemożliwia gwarantowane sprzątanie — wtedy sprawdzić agenta po ID z wydruku i wstrzymać go ręcznie.

Po teście Ctrl+C w terminalu serwera; sprawdzić brak nasłuchu na 3199 i porcie embedded PostgreSQL wskazanym w logu startowym. Nie zatrzymywać innych instancji bazy. Wyniki próby z tej sesji i ograniczenia są zapisane w `COSGRAL-PRZEKAZANIE.md`.

## Dwa konta authenticated i restart (Codex #3)

Skrypt `scripts/cosgral-e2e-two-accounts.mjs` wymaga **osobnej, świeżej instancji** z ekspozycją `private`, włączoną rejestracją i bez administratora. Tworzy konta A, B, C oraz V (widz). A rejestruje się normalnie, następnie wywołuje rzeczywisty `POST /api/bootstrap/claim`, dostępny dla pierwszego administratora w `authenticated/private`. Zaproszenie bootstrap nie jest w tym wariancie potrzebne. Gdy instancja ma już administratora, bootstrap zwróci 409 i test zakończy się FAIL — użyć nowej bazy testowej, nie odbierać uprawnień istniejącym użytkownikom. To procedura odbiorowa, nie konfiguracja publicznej produkcji.

Z katalogu repozytorium, terminal 1, jednorazowo (nie włączać `set -x`):

```sh
set +x
install -d -m 700 "$HOME/.config/cosgral"
install -d -m 700 /tmp/cosgral-two-accounts-test
node --input-type=module <<'NODE'
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
writeFileSync(`${process.env.HOME}/.config/cosgral/two-accounts.env`,
  ['BETTER_AUTH_SECRET', 'PAPERCLIP_AGENT_JWT_SECRET']
    .map(key => `${key}=${randomBytes(32).toString('hex')}\n`).join(''),
  { mode: 0o600, flag: 'wx' });
NODE
pnpm --filter @paperclipai/plugin-sdk build
env -u DATABASE_URL PAPERCLIP_HOME=/tmp/cosgral-two-accounts-instance pnpm db:migrate
```

Przy każdym starcie, także po restarcie, załadować **ten sam** plik sekretów i użyć **tego samego** `PAPERCLIP_HOME` (lub tej samej zewnętrznej bazy). Nie generować nowych sekretów między fazami:

```sh
set +x
set -a
. "$HOME/.config/cosgral/two-accounts.env"
set +a
env -u DATABASE_URL -u PAPERCLIP_AUTH_PUBLIC_BASE_URL -u BETTER_AUTH_BASE_URL \
  PAPERCLIP_HOME=/tmp/cosgral-two-accounts-instance \
  HOST=127.0.0.1 PORT=3198 \
  PAPERCLIP_DEPLOYMENT_MODE=authenticated PAPERCLIP_DEPLOYMENT_EXPOSURE=private \
  PAPERCLIP_PUBLIC_URL=http://127.0.0.1:3198 BETTER_AUTH_URL=http://127.0.0.1:3198 \
  PAPERCLIP_AUTH_BASE_URL_MODE=explicit PAPERCLIP_ALLOWED_HOSTNAMES=127.0.0.1 \
  PAPERCLIP_AUTH_DISABLE_SIGN_UP=false PAPERCLIP_MIGRATION_AUTO_APPLY=true \
  pnpm --filter @paperclipai/server dev > /dev/null 2>&1
```

Wyjście serwera celowo wyciszono, żeby nie utrwalać ewentualnych jednorazowych URL bootstrap w logach. Skrypt drukuje wyłącznie kontrolowane komunikaty, bez treści odpowiedzi auth, cookies i tokenów zaproszeń. `BETTER_AUTH_SECRET` zabezpiecza sesje, `PAPERCLIP_AGENT_JWT_SECRET` musi pozostać trwały również dla agentów. Nie używać `cat` plików poświadczeń, `printenv` ani debugowania HTTP. API-only wystarcza.

Adresy powyżej muszą być spójne. `config.ts` wybiera adres auth kolejno z `PAPERCLIP_AUTH_PUBLIC_BASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_BASE_URL`, `PAPERCLIP_PUBLIC_URL`, konfiguracji plikowej. W nowym terminalu usunąć ewentualne odziedziczone sprzeczne ustawienia. `deriveAuthTrustedOrigins` bierze origin jawnego adresu auth oraz warianty protokołu/portu z `PAPERCLIP_ALLOWED_HOSTNAMES`; nie ma potrzeby wymyślania zmiennej `TRUSTED_ORIGINS`. Skrypt wysyła `Origin` równy `--api` zarówno dla HTTP, jak i WS. Przy innym porcie/hoście zmienić wszystkie adresy spójnie; zdalny adres wymaga HTTPS. Nie wyłączać kontroli Origin, cookies ani rate limitera. Na HTTP loopback z `authenticated/private` kod serwera dopuszcza cookies bez `Secure`.

Terminal 2, z katalogu repo (poczekać na health; polecenie ponawia połączenie podczas startu):

```sh
curl --retry 20 --retry-connrefused --retry-delay 1 --max-time 3 -fsS http://127.0.0.1:3198/api/health
node scripts/cosgral-e2e-two-accounts.mjs \
  --api http://127.0.0.1:3198 --phase prepare \
  --state-file /tmp/cosgral-two-accounts-test/state.json
```

`prepare` tworzy prywatny projekt i firmę. B oraz V dołączają przez `POST /companies/:id/invites`, `POST /invites/:token/accept` i — jeśli wymagane — zatwierdzenie wniosku przez A; potem A dodaje ich do `/projects/:id/access-members`. Sprawdzana jest też odmowa przed nadaniem dostępu do projektu. C pozostaje poza firmą. Osiem równoległych POST A/B ma zwrócić to samo ID rozmowy. Sesje mają osobne cookie jars w pamięci; `ws` jest ładowany przez `createRequire` z zależności serwera. WebSocket `/api/companies/:id/events/ws` używa cookies sesji i potwierdzenia subskrypcji, zanim test wyśle komentarz. Komunikat `activity.logged` z `issue.comment_added` jest sygnałem odświeżenia danych, nie treścią komentarza; skrypt osobno potwierdza zapis i autora przez API. Wymaga dostarczenia w <5 s w obu kierunkach.

**Luka transportu:** WS nie przechowuje trwałego replay. Po rozłączeniu B skrypt zapisuje dwa komentarze A, łączy B ponownie, pobiera brakujące przez `GET /issues/:id/comments?order=asc&after=:commentId`, następnie porównuje całą historię A i B (ID, treść, autor, kolejność, brak duplikatów/luk). PASS dotyczy tego fallbacku; nie dowodzi automatycznego reconnectu interfejsu przeglądarkowego. C i klient bez sesji muszą otrzymać odmowę upgrade WS 403/404, a widz V musi móc czytać i otrzymać odmowę pisania.

Po PASS `prepare`: Ctrl+C w terminalu 1, zaczekać na zatrzymanie, uruchomić ponownie dokładnie tę samą komendę startową. Następnie terminal 2:

```sh
curl --retry 20 --retry-connrefused --retry-delay 1 --max-time 3 -fsS http://127.0.0.1:3198/api/health
node scripts/cosgral-e2e-two-accounts.mjs \
  --api http://127.0.0.1:3198 --phase verify-after-restart \
  --state-file /tmp/cosgral-two-accounts-test/state.json
```

Faza restartowa loguje A i B ponownie (bez zapisanych cookies), wymaga tego samego ID rozmowy i dokładnej historii, dodaje nowy komentarz i sprawdza WS oraz historię. Skrypt nie restartuje serwera sam: fazę tę uruchamiać dopiero po rzeczywistym restarcie. Można ją powtarzać; za każdym razem dopisuje jeden komentarz.

Exit 0 oznacza PASS wszystkich asercji danej fazy; FAIL kończy się exit 1. Po HTTP 429 dla auth skrypt respektuje `Retry-After` (maksymalnie dwa ponowienia, do 60 s każde), bez wyłączania limitera. Plik stanu zawiera wyłącznie ID i testowe e-maile; losowe hasła są wyłącznie w osobnym pliku `<state-file>.credentials.json` 0600, poza repo, bez cookies. Można podać własne `--credentials-file /poza/repo/credentials.json` w obu fazach. Skrypt odrzuca ścieżki wewnątrz repo, symlinki plików przy odczycie i poświadczenia dla innego origin. Nie nadpisuje plików przy `prepare`. Po nieukończonym `prepare` zachować pliki do inspekcji i przygotować nową izolowaną bazę oraz nowe ścieżki. Nie usuwa firm ani kont; po odbiorze zatrzymać instancję i usunąć wyłącznie własne dane testowe. `/tmp` nie służy do trwałej produkcji.

Wynik sesji Codex #3: `prepare` **PASS, exit 0**, live A→B **65 ms**, B→A **45 ms**. Po SIGINT i potwierdzonym `ECONNREFUSED` na portach 3198 oraz 54329 ponowny start tej samej bazy i sekretów: `verify-after-restart` **PASS, exit 0**, ponowne logowanie A/B, ta sama rozmowa, cztery komentarze w pierwotnej kolejności, piąty komentarz przez WS **113 ms**. Test odbył się przez HTTP/WS bez przeglądarki. Nie potwierdza docelowego UI ani delegowania agentów. Szczegóły wcześniejszych FAIL i regresji kursora: `COSGRAL-PRZEKAZANIE.md`, sekcja Codex #3.

## Dedykowany widok rozmowy projektu (Codex #4)

Po uruchomieniu API w `authenticated` zgodnie z poprzednią sekcją uruchom osobno UI:

```sh
PAPERCLIP_DEV_API_URL=http://127.0.0.1:3198 pnpm --filter @paperclipai/ui exec vite --host 127.0.0.1 --port 5173
```

Otwórz `http://127.0.0.1:5173/auth`, zaloguj się kontem z dostępem do firmy i projektu.
W projekcie wybierz **Rozmowa projektu**. Adres docelowy:
`http://127.0.0.1:5173/<PREFIX>/projects/<UUID-projektu>/conversation`.
Używaj konsekwentnie `127.0.0.1` w adresach UI/API; `localhost` ma osobny zakres cookies.
Vite proxy obsługuje HTTP i WebSocket. API nie musi serwować UI; nie wyłączaj kontroli Origin.
**Widok zaawansowany** w nagłówku otwiera zachowany ekran zadania Paperclip.

Nowy widok jest po polsku przez namespace `cosgral` istniejącego i18next. Przy braku
zapisanego wyboru motywu otwiera ciemny; przycisk w nagłówku zmienia motyw.
Panel szczegółów jest początkowo zamknięty. Na telefonie nawigacja i szczegóły
korzystają z szuflad. Historia pobiera ostatnie 40 komentarzy, a przycisk u góry
dociąga starsze. Enter wysyła, Shift+Enter tworzy nową linię, Enter w otwartym menu
wzmianek wybiera agenta. Ponowienie nie zmienia klucza tej samej wiadomości.

Karty przedstawiają dostępne zadania projektu i `done / wszystkie nieanulowane`;
nie dowodzą uruchomienia koordynatora ani automatycznego delegowania.
Obecność innych użytkowników, typing i załączniki w nowym composerze pozostają otwarte.
Wstrzymanie rozmowy blokuje composer i zachowuje szkic; bezpośrednie wstrzymanie
można zwolnić przez **Wznów rozmowę**, bez budzenia agentów. Wstrzymanie odziedziczone
prowadzi do zadania nadrzędnego w widoku zaawansowanym.

Weryfikacja tej warstwy:

```sh
pnpm --filter @paperclipai/ui exec vitest run src/pages/ProjectConversation.test.tsx src/lib/project-conversation.test.ts src/pages/ProjectDetail.test.tsx src/components/MarkdownEditor.test.tsx src/context/LiveUpdatesProvider.hook.test.tsx
pnpm --filter @paperclipai/ui typecheck
pnpm check:token-gates
pnpm --filter @paperclipai/ui build
node scripts/check-maps.mjs
```

Rzeczywiste wyniki sesji i ścieżki zrzutów: sekcja Codex #4 w `COSGRAL-PRZEKAZANIE.md`.

## Koordynator i delegowanie (Codex #5)

W rozmowie projektu wybierz koordynatora w selektorze nad composerem. Wymagane
są uprawnienia właściciela projektu lub administratora oraz dostęp do projektu.
Agent musi należeć do firmy, mieć dostęp do projektu i być gotowy do pracy.
Model, adapter i źródło dostępu pozostają w konfiguracji wybranego agenta.
Zmiana tworzy widoczny komentarz; podczas wykonania zmiana jest odrzucana (409).
Wiadomość użytkownika budzi wybranego agenta zwykłym mechanizmem komentarzy.
Instrukcje koordynatora wymagają zwykłych zadań wykonawców z `parentId` rozmowy,
tym samym `projectId`, linkiem źródłowym i kluczem idempotencji. Karty korzystają
z dostępnych zadań projektu. Po przekazaniu koordynator kończy run bez zmiany
statusu rozmowy. Serwer przywraca neutralne `todo`; rozmowa nie ma dyspozycji
zadania (`in_review`/`blocked`/`done`). Zakończenie każdego dziecka budzi go do
raportu, także podczas pracy nad innym zleceniem; wake czeka za aktywnym runem.
Błąd lub brak zapisanej odpowiedzi jest widoczny jako komentarz systemowy. Pauzy, uprawnienia, budżety i approvals
nadal obowiązują. Sam wskaźnik aktywnego runu nie potwierdza odpowiedzi modelu.

Odbiór rzeczywistych modeli wykonuje nadzorca **poza sandboxem tej sesji**.
Użyj osobnej instancji `local_trusted` na 3199, z trwałym JWT i istniejącym
logowaniem w zapisywalnym `CODEX_HOME`, według sekcji „Trwały JWT agentów i
powtarzalny e2e” powyżej. Nie używaj istniejącej instancji authenticated na 3198.
Po health 200, z katalogu repo uruchom:

```sh
node scripts/cosgral-e2e-delegation.mjs --api http://127.0.0.1:3199 --codex-home "$HOME/.codex" --timeout-sec 420
```

Skrypt tworzy nową firmę, projekt i dwóch agentów `codex_local`, `runner=legacy`,
`engine=cli`, model `gpt-6.1-sol`, reasoning `low`, bypass `false`, bez `extraArgs`.
Wykonawca ma `reportsTo` koordynatora; osobne katalogi robocze mają `git init`.
Nie kopiuje poświadczeń. Jedynym wyzwalaczem pracy jest komentarz użytkownika;
skrypt nie tworzy zadania wykonawcy, nie zapisuje wyników ani nie budzi ręcznie.
Niezależny odczyt przed sprzątaniem wymaga komentarza koordynatora, dokładnie
jednego zadania wykonawcy w projekcie i pod rozmową, jego `done` i własnego `ok`,
późniejszego raportu koordynatora oraz jego kontynuacji po zakończeniu dziecka.
PASS wymaga samych udanych runów (łącznie 3–6), bez retry/aktywnego wykonania
przez 75 s stabilnej obserwacji. Obserwacja wlicza się w timeout.
Exit 0 = PASS, exit 1 = FAIL. Po teście obaj agenci są pauzowani, aktywne runy
anulowane; dane i katalogi `/tmp/cosgral-e2e-{coordinator,worker}-*` pozostają do
inspekcji. SIGKILL/utrata API wymaga ręcznego sprawdzenia tych agentów.

Testy bez uruchamiania modelu:

```sh
node --test scripts/cosgral-e2e-delegation.test.mjs
pnpm --filter @paperclipai/server exec vitest run src/__tests__/project-conversations.test.ts src/services/project-conversation-policy.test.ts src/services/heartbeat/task-markdown.test.ts
pnpm --filter @paperclipai/ui exec vitest run src/pages/ProjectConversation.test.tsx src/lib/project-conversation.test.ts
```

Test skryptu przeniesiono z `server/scripts/` (runner Vitest) do `scripts/`
(wbudowany runner Node). Bieżące dowody obejmują bazę/uprawnienia/API do wywołań
wake i mockowane asercje skryptu; pełnego cyklu dwóch modeli jeszcze nie zaliczono.
