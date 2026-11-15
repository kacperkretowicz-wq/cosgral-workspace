# W4-T1: odbiór po zmianach W4 i test połączeń z prawdziwym Claude

Gałąź `team/kk/w4-verify` od `codex/cosgral-desktop` @ `5971de823` (scalone: W4-BE core, W4-H1 KAPI, lint). Bez push. Wykonał KK Fullstack, 15.11.2026. Zasady z `docs/cosgral/PLAN-W4.md`: gotowe = działa w prawdziwym oknie.

## Wynik

| Co | Wynik |
|---|---|
| Skrypt odbioru `scripts/sandbox-acceptance.ts` | **37/37**, 0 błędów konsoli (prawdziwy Electron w piaskownicy, atrapa Codex) |
| `sandbox:e2e` | **22/22**, 0 wpisów w konsoli (19 starych kroków + kanał „Done”, dostawcy, „blocked” z Try again) |
| Test połączeń z prawdziwym **Claude CLI 2.1.325** (`sandbox:real-claude`) | **4 z 4 tur** + start, 0 błędów konsoli |
| Powtarzany restart po zabiciu procesu („disk I/O error”) | 4 z 4 startów bez okna błędu |
| Parytet | **25 jest, 19 częściowo, 0 brak = 34,5 z 44 = 78,4%**, bez zmiany względem W3-T3 |

Żaden wiersz nie zmienił stanu wg dowodów (uzasadnienie w „Krok 3”). Skrypt odbioru nie wymagał żadnej poprawki selektorów po W4.

## Krok 1: odbiór po W4

- Build: `bun run build` kod 0 w 21 s. Odbiór i `sandbox:e2e` uruchomione po jednym, na świeżych piaskowniach (osobne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`).
- **Odbiór (37 kroków):** wszystkie zielone, w tym wiersze, które w W3-T3 padały albo miały bloker: onboarding (jeden przepływ), kolejka, karty, kanały w ramach restartu, restart (R1–R5), telefon po TLS.
- **Naprawy W4 potwierdzone w prawdziwym oknie** (`sandbox:e2e`):
  - kanał z liderem i członkiem: stany `queued → running → waiting → queued → running → done`, zadanie członka „done”, wynik w wiadomości;
  - brak Claude CLI: status `not-installed`, w Usage „Not installed: Claude CLI was not found…”;
  - CLI, które nie wstaje: karta „Agent CLI setup required” z powodem i **Try again**, żaden wskaźnik „Working”, po usunięciu przyczyny Try again przywraca pracę.
- **Bloker 1 z W3-T3 („disk I/O error”):** pętla `crashloop` (poza repo): uruchom program na danych piaskownicy, po ok. 4 s zabij własne drzewo procesów, uruchom ponownie po 3 s. 4 rundy: 4 starty bez okna błędu (port diagnostyczny w 3–5 s). W W3-T3 ta sama sekwencja dała błąd w 1 z 2 prób.
- **Bloker 2 („blocked” = „Thinking” bez wyjścia):** naprawa potwierdzona krokiem `blocked` w `sandbox:e2e` (zob. wyżej).
- **Bloker 3 (brak przycisku tworzenia kanału):** **nadal otwarty na integracji.** `ChannelWorkspace` nie ma „Nowy kanał”, a w preload nie ma flagi `supportsMessageReplies`. Gałąź UI `team/ui/w4-ui1` (commit `93cfd820f`, z krokiem akceptacji w UI) nie jest scalona; nie ruszałem jej worktree i nie uruchamiałem jej kroku.

### Zmiany względem 34,5 z 44

| Wiersz | W3-T3 | Po W4 | Co się zmieniło |
|---|---|---|---|
| 9, 10, 12 | jest | jest | dodatkowo z prawdziwym Claude i prawdziwym Codex (karty pytania i szkicu) |
| 14 | częściowo | częściowo | bez zmiany: okno „Nowy kanał” niescalone |
| 15 | jest | jest | kanał „Done” także na atrapie z liderem i członkiem; prawdziwy Claude jako lider i jedyny członek: „done” |
| 35 | częściowo | częściowo | jedno źródło stanu dostawcy (Claude „Not installed” wszędzie); przełączenie na modele zapasowe innego dostawcy dalej nie sprawdzone |
| pozostałe | bez zmiany | bez zmiany | |

## Krok 2: test połączeń z prawdziwym Claude

Skrypt: `scripts/sandbox-real-claude.ts` (`bun run sandbox:real-claude`), wzorowany na `sandbox-real-codex.ts`. Zmienne: `COSGRAL_SANDBOX_ROOT` (poza repo), `COSGRAL_REAL_CLAUDE_PATH` (plik wykonywalny), `COSGRAL_REAL_CLAUDE_CONFIG_DIR` (istniejący folder konfiguracji Claude osoby, użyty na miejscu).

**Bezpieczeństwo:**
- Pliku logowania nie czytałem, nie kopiowałem do piaskownicy ani repo, nie wypisywałem. Program w piaskownicy ma własne dane, a Claude CLI samo bierze logowanie z folderu wskazanego przez `CLAUDE_CONFIG_DIR` (w miejscu; Claude dopisuje tam własne pliki sesji).
- Przed testem sprawdziłem stan logowania poleceniem `claude auth status --json` i wypisałem **tylko** pole `loggedIn` (True).
- Zmienną `CLAUDE_CONFIG_DIR` z mojego środowiska (konto dostawcy OpenBota agenta) celowo zastąpiłem folderem właściciela; usunąłem `CODEX_HOME` i wskazałem nieistniejącą ścieżkę Codex, żeby inne konto nie przeciekło.
- Raport z przebiegu zawiera tylko stany, wersje i czasy, nie nazwę konta (sprawdzone: 0 znaków `@`). Jest poza repo, w piaskownicy.
- Skrypt się nie loguje: przy stanie „Sign in required” kończy z opisem. Tu nie był potrzebny.
- Zużycie limitu Claude: 4 krótkie tury („odpowiedz słowem OK”) na `claude-sonnet-5` z niskim wysiłkiem.

| Krok | Wynik | Czas |
|---|---|---|
| Start, pierwsze uruchomienie z Claude CLI 2.1.325 (wybór dostawcy Claude w onboardingu) | ✓ stan „ready”, Claude „available” | 5 s |
| 1. Rozmowa („odpowiedz jednym słowem: OK”) | ✓ „OK” | 9 s |
| 2. Karta pytania (narzędzie pytające, odpowiedź przez okno) | ✓ karta, potem „OK” | 5 s |
| 3. Karta zgody/szkicu (`cosgral_cards.confirm`, decyzja Send) | ✓ karta, potem „OK” | 7 s |
| 4. Kanał z liderem (jeden agent jako lider i członek) | ✓ zadanie „done”, wynik „OK” | 8 s |

0 błędów konsoli. Modele z katalogu programu: `claude-fable-5`, `claude-opus-5`, `claude-sonnet-5` (użyty ostatni); prawdziwe CLI przyjęło wybrany model.

**Uwagi:**
- Program sprawdza logowanie poleceniem `claude auth status --json` z limitem 5 s (`claude-client.ts`). Przy mocno obciążonym komputerze limit może minąć i program uzna to za „Sign in required”, choć logowanie jest. Nie zmieniałem kodu; warto podnieść limit i dodać ponowienie (analogicznie do `codex --version`, które Backend podniósł do 20 s ×2).
- Karty zgody na narzędzie (Claude `canUseTool`) program pozwala bez pytania wszystko poza pytaniem użytkownika, więc „zgoda na komendę” nie została tu wywołana.

## Krok 3: wiersze, które po W4 mogą zmienić stan

| Wiersz | Co musi wejść, żeby się zmienił | Stan teraz |
|---|---|---|
| 14 (kanały: lider i członkowie) | scalenie `team/ui/w4-ui1`: okno „Nowy kanał” i edycja kanału, potem krok w odbiorze | częściowo |
| 15 (kanały: zadania) | odpowiedź na wiadomość w kanale (flaga w preload) i delegowanie do innego członka na prawdziwym modelu | jest |
| 35 (dostawcy i limity) | przełączenie na model innego dostawcy przy limicie (potrzebne dwa prawdziwe dostawcy i symulowany limit) | częściowo |
| 39, 40 (ustawienia, onboarding) | tłumaczenie interfejsu na polski (W7) | częściowo |
| 21, 26, 30 (ustawienia agenta, Vault, pliki) | brakujące elementy z opisu (poziom dostępu, wypełnianie z Vault, „Add files”) | częściowo |
| 32, 34, 36, 1 | prawdziwy pulpit, mikrofon, serwer zdalny: poza tą piaskownicą | częściowo |

Zmieniłem w `parytet-0.68.md` tylko nagłówek stanu, akapit podsumowania i dopiski dowodów w wierszach 9, 10, 12, 14, 15, 35. Kolumny „jest/częściowo” i liczby bez zmian: **34,5 z 44 = 78,4%** (dolna granica 75,0%, gdy wiersze 1, 32, 36 policzyć jako 0).

## Czego nie sprawdziłem

- Klienta Claude w kanale z więcej niż jednym członkiem (delegowanie), kart zgody na komendę i narzędzi Claude (pliki, przeglądarka), plików sesji po restarcie, wznowienia rozmowy po restarcie na prawdziwym Claude.
- Zachowania przy „Sign in required” w prawdziwym programie (stan nie wystąpił, więc ścieżka opisu właściciela nie była uruchamiana): wtedy właściciel robi `claude auth login` w terminalu i wybiera „Try again”.
- „disk I/O error” przy dużym obciążeniu: 4 rundy to za mało na dowód; to samo co poprzednio, jedna maszyna, 1,9 GB wolnego RAM.
- Okna „Nowy kanał”, edycji kanału i odpowiedzi w kanale (niescalone).
- Pełnego `bun run check`, `bun run test`, `test:visual`, instalatora (poza zakresem i limit sprzętu).
- Jasnego motywu, prawdziwego telefonu, Computer Use, mikrofonu, kamery, zdalnego pulpitu z obrazem.
- Modeli innych niż `claude-sonnet-5`, prawdziwego Codex w moim przebiegu (jego test zrobił Backend).
- Skutek uboczny: Claude zapisał pliki sesji w folderze konfiguracji właściciela (`.claude`), to normalne zachowanie CLI. Dane piaskowni i zrzuty są poza repo, w `Shared\cosgral-sandbox\acceptance`.
