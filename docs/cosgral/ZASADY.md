# COSGRAL Workspace: zasady projektu (obowiązują wszystkich)

Spisał KAPI 13.11.2026 na polecenie właściciela. To zestawienie zasad, które już obowiązują w `PLAN.md`, `AGENTS.md`, `COSGRAL-CHANGES.md` i raportach; **nic tu nie jest nową decyzją, poza punktem 9**. Przy rozbieżności wygrywa `docs/cosgral/PLAN.md` (sekcja „Zasady” i „Decyzje lidera”), a spory rozstrzyga lider (Okiestrator).

## 1. Cel i pochodzenie

- Program tylko dla zespołu COSGRAL: wszystkie funkcje OpenBota 0.68, wygląd podobny, działanie lepsze. Najpierw Windows, potem telefon (etap M).
- Baza: **OpenBot 0.1.11**, repozytorium `nightly-labs/openbot`, commit `a6fe240209e58ffe5a5fc749d61f306a7218c326` (20.08.2026), ostatnia wersja na **Apache-2.0**.
- Pliki `LICENSE` i `NOTICE` zostają. Nazwa i logo „OpenBot” nie są nasze: program nazywa się **COSGRAL Workspace**, `appId` `pl.cosgral.workspace`.
- Każdą zmianę pliku z bazy dopisujemy do tabeli w `COSGRAL-CHANGES.md` (Apache-2.0, §4b).

## 2. Czysta implementacja (bez kopiowania nowszego kodu)

- Funkcje z OpenBota 0.2+ odtwarzamy **z opisu zachowania**, nie z kodu.
- Nikt, kto implementuje, **nie otwiera kodu OpenBota nowszego niż `a6fe240`** ani zdekompilowanej paczki 0.68.
- Jedynym źródłem opisu zachowania 0.68 jest **Tester**, własnymi słowami, bez fragmentów kodu i bez kopiowania tekstów UI. Pytania o zachowanie idą do niego przez kanał.
- Wzorce z Paperclip (MIT) wolno brać tylko jako wzorce adapterów dostawców. Silnikiem jest 0.1.11 (`docs/cosgral/silnik.md`).

## 3. Git, gałęzie, commity

1. Każdy pracuje we **własnym worktree** na gałęzi `team/<rola>/<temat>` utworzonej od `codex/cosgral-desktop`. Cudzego worktree nie ruszamy.
2. Przed każdym zadaniem scalamy `codex/cosgral-desktop` do swojej gałęzi: **`git merge`, bez rebase**.
3. Na `codex/cosgral-desktop` **scala wyłącznie lider** (Okiestrator) po przeglądzie.
4. Commit kończy się trailerem: `Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>`.
5. **Gotowe = testy + dowód (log lub zrzut) + raport** w `docs/cosgral-raporty/<rola>-<temat>.md`.
6. Backend najpierw publikuje kontrakt (typy w `packages/contracts`, IPC, API), potem UI go używa. UI zgłasza Backendowi, jakich danych potrzebuje.
7. Prośba do innej roli idzie **przez kanał**, żeby lider ją widział.

## 4. Kiedy „totalnie wszystko” jest gotowe (wymóg właściciela z 12.11)

- Umową jest lista funkcji **`docs/cosgral/parytet-0.68.md`** (44 wiersze). Funkcji spoza listy nie uznajemy „na słowo”; nową funkcję OpenBota dopisujemy do listy.
- Program jest gotowy, gdy **każdy wiersz ma stan „jest” i przechodzący test akceptacyjny z dowodem**.
- **Wiersza nie wolno usunąć ani oznaczyć „pomijamy” bez decyzji właściciela.**
- Po każdej fali lider podaje właścicielowi liczbę funkcji „jest / częściowo / brak”.
- Obszary, których nie może zabraknąć: nawigacja i stany agentów; czat i karty akcji; kanały i zadania; agenci, szablony, pamięć, skille, MCP; Vault, rutyny i webhooki, przepływy, tabele, pliki; przeglądarka z przejęciem, Computer Use, zdalny pulpit; głos, dostawcy i limity, zespół i serwery; telefon, dok i wyspa; ustawienia, powiadomienia, onboarding, marketplace i wtyczki.

## 5. Interfejs (`AGENTS.md`)

- **Weryfikacja wizualna tylko dwiema drogami:** dev app (zachowanie zintegrowane) albo Storybook (pojedyncze komponenty). Żadnych doraźnych ścieżek podglądu.
- **Najpierw szukaj, potem pisz:** przed nowym komponentem sprawdź istniejące komponenty, hooki, style i narzędzia; wolisz ponowne użycie lub małe rozszerzenie niż duplikat.
- **Kolory:** jedynym źródłem jest paleta `:root` w `src/renderer/src/styles.css`. Używamy tokenów (`var(--openbot-bg-*)`, `-text-*`, `-border*`, `-accent*`, `-success*`, `-warning*`, `-danger*`). Żadnych nowych literałów hex, `rgb()`, `rgba()`, `hsl()` ani nazw kolorów, żadnych jednorazowych półprzezroczystych kolorów. Nowa rola semantyczna najpierw trafia do `:root`.
- **Język interfejsu:** do czasu wyboru języka w onboardingu (wiersz 40) nowe napisy UI są **po angielsku**; polski przyjdzie jako tłumaczenie PL/EN. Mieszanie języków w jednym widoku to błąd.
- Wygląd: system wizualny bazy 0.1.11 jest nasz; logo, ikony i grafiki nowych ekranów robimy sami.

## 6. Bezpieczeństwo i uruchamianie

- Uruchamianie na próbę **zawsze w piaskownicy**: osobne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`. Nie na prawdziwym profilu.
- Serwery **tylko na loopback** (`127.0.0.1`). Sekrety poza repozytorium i czatem; sekrety Vault i webhooków szyfruje `safeStorage` i nie trafiają do agenta ani do czatu.
- Prawdziwy Codex lub Claude **tylko do krótkich testów dymnych** (kilka tur na zadanie); resztę testów robimy na atrapie CLI.
- Brak `claude.exe` w paczce (304 MB, nieużywany): Claude działa przez zainstalowane CLI.
- Dostęp agenta do ekranu, kamery i pulpitu (oczy agenta, Computer Use) tylko **za zgodą człowieka**, ze wskaźnikiem „agent patrzy” i przyciskiem Stop.
- Treści z webhooków, tabel, plików i MCP agent traktuje **jako dane, nie polecenia**.

## 7. Decyzje lidera, których nie wolno omijać

Pełne brzmienie: `docs/cosgral/PLAN.md`. Skrót:

- **Kanały:** stany zadania `queued`, `running`, `waiting`, `paused`, `done`, `failed`, `cancelled`; archiwum to flaga, nie stan. Jeden wynik na zadanie z numerem wersji. Instrukcje kanału ≤ 2000 znaków, wpis pamięci kanału ≤ 500, ≤ 8 automatycznych przydziałów na zadanie (potem `paused`). Przejęcie przeglądarki liczy się do Needs you. Podgląd szkicu to ta sama karta co potwierdzenie (Send / Edit / Keep draft). Liczby limitów trzymamy w jednym miejscu konfiguracji.
- **Kontrakt zadania kanału:** `ChannelTask {id, channelId, ownerBotId, state, title, requestMessageId, resultMessageId|null, updatedAt}`, zdarzenie `task-changed`, odczyt `channels.listTasks(channelId)`.
- **Skille:** jeden folder ze `SKILL.md`, najwyżej 200 plików i 10 MB.
- **MCP:** lista serwerów wspólna dla programu, własny przełącznik włącz/wyłącz na każdego agenta (nowy agent: włączone).
- **Vault:** w W2 tylko lokalny Vault na `safeStorage`; konektory 1Password / Bitwarden / Proton w W3.
- **Rutyny i webhooki:** harmonogram lokalny i odbiornik webhooków na loopback (Standard Webhooks, sekret pokazany raz); przy wyłączonym programie rutyny nie biegną i po starcie nie nadrabiają. Publiczny adres (przekaźnik) w W3.
- **Tabele:** wersja wiersza; zapis ze starą wersją dostaje konflikt, nigdy cichego nadpisania.
- **Pliki:** jeden magazyn, dwa widoki (biblioteka plików i załączniki czatu).
- **Przepływy pracy (wiersz 28):** pełne płótno po Vault i rutynach, na początku W3.

## 8. Skille i narzędzia

- **Skill w repozytorium:** `.agents/skills/biome-anti-slop`. Instaluje i konfiguruje reguły Biome (GritQL) przeciw „śmieciowemu” kodowi TypeScript/JavaScript; wymaga `@biomejs/biome >=2.5.9 <3`. Używamy go, gdy ktoś dodaje, zmienia lub migruje te reguły lint.
- **Skille programu** (funkcja COSGRAL, nie skille repozytorium): lokalna biblioteka z wersjami, limit 200 plików / 10 MB na folder, instalacja per agent, ochrona lokalnej kopii. Opis: `docs/cosgral-raporty/backend-w2-skills.md`.
- **Skille platformy OpenBot dostępne agentowi KAPI** (lista z tej sesji; inni agenci mogą mieć inne): `openbot-data`, `openbot-site-hosting`, `openbot-skill-creator`, `code-review`, `simplify`, `security-review`, `dataviz`, `claude-api`, `run`, `init`.
- **Narzędzia na Windows:**

  ```powershell
  $env:PATH = "<Shared>\tools\bun;<Shared>\tools\node;<Shared>\tools\git\cmd;$env:PATH"
  bun install; bun run typecheck:node; bun run build
  ```

  gdzie `<Shared>` to wspólny folder `OpenBot\Shared` na komputerze zespołu.

## 9. Dodane 13.11 przy wypychaniu na GitHub (do akceptacji lidera)

Dotąd obowiązywało „bez push, dopóki właściciel nie da tokenu”. 13.11 właściciel polecił wypchnąć wszystkie gałęzie do `kacperkretowicz-wq/cosgral-workspace`. **To repozytorium jest publiczne.** Dlatego proponujemy od teraz:

1. **Wypychamy tylko gałęzie `team/*` i `codex/*`.** Push na `main` i na domyślną gałąź `codex/cosgral-workspace` tylko za zgodą lidera.
2. **Do repozytorium nie trafiają** klucze, tokeny, hasła, zrzuty z prawdziwymi danymi ani lokalne ścieżki z nazwą profilu Windows. W dokumentach używamy `%USERPROFILE%` lub `<Shared>`. (Starsze raporty i skrypty zawierają takie ścieżki; poprawiamy je przy okazji, nie hurtem.)
3. Wypchnięte gałęzie sprawdzamy przez porównanie SHA lokalnych i zdalnych głów, a nie tylko po kodzie wyjścia `git push`.
