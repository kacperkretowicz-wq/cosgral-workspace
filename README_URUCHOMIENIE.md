# COSGRAL Workspace: jak uruchomić

**Następny krok (ok. 1 min):** w folderze programu kliknij dwukrotnie `start-cosgral.cmd`. Po pierwszym uruchomieniu pokaże się ekran powitalny, a po nim okno z listą agentów.

## 1. Trzy sposoby uruchomienia

| Co chcesz | Jak | Gdzie są dane |
|---|---|---|
| Używać programu na swoim profilu Windows | `start-cosgral.cmd` | `%APPDATA%\COSGRAL Workspace Dev` i `%USERPROFILE%\COSGRAL Workspace` |
| Spróbować bez ryzyka (bez modelu, konta i sieci) | `start-cosgral-sandbox.cmd` | osobny folder `%LOCALAPPDATA%\COSGRAL-Sandbox` |
| Zainstalować jak zwykły program | `bun run dist:win`, potem instalator z `dist\` | `%APPDATA%\COSGRAL Workspace` i `%USERPROFILE%\COSGRAL Workspace` |

Wymagania do uruchomienia z folderu: Bun (do `bun install` i budowania) i Windows 10 lub nowszy. Node.js nie jest potrzebny do samego programu (tylko do testu z punktu 6).

**Pierwszy raz z folderu (kroki 1 z 3, ok. 5 min):**
1. `bun install` (raz).
2. `start-cosgral.cmd`. Skrypt sam zbuduje program (`bun run build`, ok. 30 s), jeśli jeszcze go nie zbudowano.
3. Po zmianie lub aktualizacji kodu: `start-cosgral.cmd --rebuild`.

Skrypt czyta opcjonalny plik `cosgral-local.cmd` obok siebie (nie trafia do repozytorium). Użyj go, gdy `codex` lub `claude` nie jest na `PATH`:

```bat
set "COSGRAL_CODEX_PATH=C:\sciezka\do\codex.cmd"
set "COSGRAL_CLAUDE_PATH=C:\sciezka\do\claude.exe"
```

## 2. Wersja piaskownicowa

`start-cosgral-sandbox.cmd` uruchamia program z własnym, pustym profilem Windows (osobne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`) i atrapą Codex. Atrapa odpowiada „Stub: received” na zwykłą wiadomość. Nie używa modelu, konta ani sieci i nie czyta ani nie zapisuje niczego z Twojego profilu.

- Inny folder: `start-cosgral-sandbox.cmd "D:\moj folder"`.
- Zacząć od zera: `start-cosgral-sandbox.cmd --reset` (kasuje tylko folder, który ten skrypt sam utworzył).
- Żeby w piaskownicy użyć prawdziwego dostawcy, trzeba się zalogować wewnątrz niej, bo ma osobny profil. Prościej użyć zwykłego `start-cosgral.cmd`.

## 3. Gdzie są dane

| Co | Gdzie |
|---|---|
| Baza (agenci, rozmowy, kanały, Vault, tabele, rutyny), ustawienia, Mobile Connect, certyfikat telefonu | `%APPDATA%\COSGRAL Workspace Dev\` (z folderu) lub `%APPDATA%\COSGRAL Workspace\` (z instalatora) |
| Przestrzenie robocze agentów, pliki wspólne, pobrane pliki | `%USERPROFILE%\COSGRAL Workspace\Bots`, `\Shared`, `\Downloads` |

Dane zwykłego OpenBota (`%APPDATA%\OpenBot`) nie są używane ani zmieniane. Wersja z folderu i wersja z instalatora mają **osobne bazy**, ale wspólny folder `%USERPROFILE%\COSGRAL Workspace`.

Kopia zapasowa: zamknij program i skopiuj oba foldery. Usunięcie danych: zamknij program i skasuj oba foldery.

## 4. Logowanie dostawcy (Codex lub Claude)

Program nie loguje się sam i nie kopiuje tokenów: używa logowania istniejącego narzędzia wiersza poleceń.

**Codex (ChatGPT):**
1. Zainstaluj Codex CLI i upewnij się, że polecenie `codex` działa w PowerShell (albo wskaż je w `cosgral-local.cmd`).
2. W PowerShell: `codex login` i zaloguj się kontem ChatGPT w przeglądarce.
3. Uruchom program ponownie. Na ekranie „Set up this computer” przy Codex powinno być „Available” i Twój e-mail.

**Claude:**
1. Zainstaluj Claude CLI (wymaga Git for Windows).
2. W PowerShell: `claude auth login`.
3. Uruchom program ponownie. Przy Claude powinno być „Available”.

Program szuka poleceń w `PATH`, a potem w: `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe`, `%LOCALAPPDATA%\Microsoft\WinGet\Links\claude.exe`, `%APPDATA%\npm\`, `%USERPROFILE%\.local\bin\` i `%USERPROFILE%\.bun\bin\`. Zmienne `OPENBOT_CODEX_PATH` i `OPENBOT_CLAUDE_PATH` mają pierwszeństwo.

Sprawdzenie bez uruchamiania modelu (z folderu): `bun run codex:doctor`.

**Bez terminala (W5):** CLI można pobrać, konta dodać i zalogować, a klucz API wkleić na stronie **Providers**. Zobacz „Dostawcy bez terminala (W5)” na końcu tego pliku.

## 5. Instalator Windows

`bun run dist:win` buduje program i instalator w `dist\`:
- `COSGRAL Workspace-0.2.0-x64.exe` (instalator NSIS, niepodpisany: Windows SmartScreen pokaże ostrzeżenie „nieznany wydawca”),
- `dist\win-unpacked\` (ten sam program bez instalatora, można go uruchomić bezpośrednio).

Przy pierwszym budowaniu potrzebne są pliki, które electron-builder pobiera z internetu (Electron, NSIS, winCodeSign). Zespół trzyma je w pamięci podręcznej; ustaw `ELECTRON_CACHE` i `ELECTRON_BUILDER_CACHE` na jej foldery, żeby budować bez sieci.

Zainstalowany program sprawdza aktualizacje w publicznych wydaniach repozytorium wskazanym w `electron-builder.yml` (`publish`). Jeśli ma ich nie sprawdzać, usuń sekcję `publish` przed budowaniem.

## 6. Test automatyczny całej aplikacji

Wymaga Node.js 24 (uruchamia skrypt TypeScript bezpośrednio) i zbudowanego programu. Najpierw `bun run build`, a potem:

```bat
set COSGRAL_SANDBOX_ROOT=C:\temp\cosgral-sandbox
bun run sandbox:e2e
```

Skrypt uruchamia prawdziwy program w piaskownicy z atrapą Codex i przechodzi ścieżkę użytkownika: ekrany pierwszego uruchomienia, nowy agent, wiadomość z odpowiedzią, restart z zachowaną historią, każda strona szyny stron (z zebraną konsolą), odczyty całego `window.openbot`, parowanie telefonu przez TLS z przypiętym odciskiem, narzędzie agenta, kanał z liderem i członkiem (zadanie kończy się „Done”), zgodny stan dostawców (brak Claude = „Not installed” wszędzie) i CLI, które nie wstaje (karta z powodem i „Try again”). Dowody (zrzuty ekranu, `run.json`) trafiają do `%COSGRAL_SANDBOX_ROOT%\evidence`.

### Test połączeń z prawdziwym Codex

Gdy Codex jest zalogowany (`codex login status` pokazuje „Logged in using ChatGPT”), krótki test z prawdziwym modelem (4 tury po jednym słowie: rozmowa, karta pytania, karta zgody, kanał z liderem):

```bat
set COSGRAL_SANDBOX_ROOT=C:\temp\cosgral-real
set COSGRAL_REAL_CODEX_PATH=<pełna ścieżka do codex.exe albo codex.cmd>
set CODEX_HOME=%USERPROFILE%\.codex
bun run sandbox:real-codex
```

Program działa w piaskownicy; Codex czyta swoje logowanie z `CODEX_HOME` na miejscu (nic nie jest kopiowane ani wypisywane) i zapisuje tam swoje pliki sesji. Wynik z czasami: `%COSGRAL_SANDBOX_ROOT%\real-codex.json`.

### Test połączeń z prawdziwym Claude

Analogicznie, gdy Claude CLI jest zainstalowany i zalogowany (jeśli program pokaże „Sign in required”, zaloguj się sam: `claude auth login`). Test robi 4 krótkie tury (rozmowa, karta pytania, karta zgody, kanał z liderem):

```bat
set COSGRAL_SANDBOX_ROOT=C:\temp\cosgral-real-claude
bun run sandbox:real-claude
```

Logowanie zostaje tam, gdzie jest; skrypt go nie czyta, nie kopiuje i nie wypisuje.

## 7. Czego jeszcze nie ma w oknie programu

- Motyw jasny i polskie napisy w oknie (W7).
- Braki W5 (dostawcy, konta, klucze, modele zapasowe): „Czego W5 jeszcze nie robi” na końcu tego pliku.
- Pełna lista: `docs/cosgral/PLAN-W4.md`.

## 8. Gdy coś nie działa

- **Okno się nie otwiera:** uruchom `node_modules\electron\dist\electron.exe .` w wierszu poleceń i odczytaj komunikat.
- **„Complete agent CLI setup to start” w polu wiadomości:** program nie widzi Codex ani Claude albo nie jesteś zalogowany (punkt 4). Karta nad rozmową podaje powód; po poprawce wybierz **Try again** (bez restartu programu).
- **„couldn’t start” zaraz po zamknięciu lub awarii:** program sam czeka kilka sekund na zwolnienie bazy; gdy dalej nie może, poczekaj chwilę i uruchom go ponownie. Dane nie są zmieniane.
- **Chcesz zacząć od zera:** zamknij program i skasuj foldery z punktu 3 (albo użyj `--reset` w piaskownicy).

## W4-UI1: kanały (oczekuje na odbiór okna)

W pasku bocznym wybierz **New channel** albo **Browse channels** i **New channel**. Wpisz nazwę (małe litery, cyfry, myślniki), wybierz członków i lidera spośród nich. **Edit channel** zmienia tytuł, skład, lidera i instrukcje. Krótka nazwa pozostaje stała. **Reply** odpowiada na wiadomość. Krok `channel UI: create, edit and reply` w `sandbox:e2e` czeka na odbiór.

## W4-K3: nowe metody kontraktu (czekają na UI)

Backend i kontrakty gotowe, **okno programu ich jeszcze nie wywołuje** (wiersze 2 i 3 parytetu zostają „częściowo” do czasu podłączenia UI i odbioru). Szczegóły i kształty: `docs/cosgral-raporty/kapi-w4-k3.md`.

- **Przypinanie stron szyny:** `window.openbot.appSettings.update({ navigation: { pinnedPageIds } })`; odczyt `AppSettings.navigation`; zdarzenie `app-settings-changed`.
- **Ukrywanie agenta:** `window.openbot.agent.setBotHidden({ botId, hidden })`, pole `BotSummary.hidden`, `listBots({ includeHidden })` (bez argumentu: wszyscy; `false`: tylko widoczni). Ukryty agent nadal działa.
- **Duplikowanie agenta:** `window.openbot.agent.duplicateBot({ sourceBotId, name? })` → `{ bot, warnings }`; kopia ma ustawienia, skille i narzędzia źródła, ale **bez pamięci i historii**; nazwa „<nazwa> kopia”, potem „kopia 2”.
- **Nie ma jeszcze:** wielu wątków na agenta (W6-BE1) i osobnego okna rozmowy.

## Dostawcy bez terminala (W5)

**Następny krok (ok. 2 min klikania, potem pobieranie):** otwórz stronę **Providers** → sekcja **Narzędzia CLI** → przy Codex lub Claude kliknij **Pobierz** → zatwierdź kartę w „Needs you” (**Confirm**). Dalej: konta (część 2), klucze API (3), własne serwery modeli (4), modele zapasowe (5).

**Stan:** wszystkie pięć części jest w programie i było sprawdzane na atrapach (fałszywe CLI, fałszywy serwer plików, fałszywe konta, klucze i serwery modeli). Z prawdziwym kontem, prawdziwym pobraniem CLI i prawdziwym Ollama lub LM Studio **jeszcze nie sprawdzone**. Zobacz „Czego W5 jeszcze nie robi” i „Do potwierdzenia” niżej. Napisy w oknie są częściowo po polsku, częściowo po angielsku (pełna lokalizacja to W7); podaję je tak, jak widać w oknie. Sekcje strony **Providers** idą w kolejności: Konta i pula, Narzędzia CLI, API keys, Own model endpoints, użycie, agenci ACP, Fallback models.

### 1. Pobieranie CLI (krok 1 z 5)

Czas: ok. 1 min klikania; samo pobranie zależy od łącza (Codex ok. 382 MB, Claude ok. 372 MB). Bez uprawnień administratora.

1. **Providers** → **Narzędzia CLI** → karta Codex lub Claude → **Pobierz**.
2. Za pierwszym razem program **pyta o zgodę** i niczego nie pobiera, dopóki nie odpowiesz. Karta w „Needs you” (tytuł np. „Download Codex CLI …?”) pokazuje rozmiar, oficjalne źródło i SHA-256. **Confirm** pobiera, **Cancel** nie pobiera nic. Bez żadnego agenta pytanie pokazuje okno systemowe. Po pierwszej zgodzie aktualizacje idą bez karty, ale zawsze ze sprawdzeniem SHA-256.
3. Karta na stronie pokazuje fazy: „Sprawdzanie wersji”, „Czeka na zgodę w Needs you”, „Pobieranie” (z paskiem postępu), „Sprawdzanie SHA-256”, „Instalowanie”, „Gotowe”. Gdy suma SHA-256 się nie zgadza, nic nie zostaje zapisane i program nie ponawia. Gdy połączenie się urwie, program próbuje jeszcze raz sam; po drugim urwaniu pokazuje błąd i przycisk **Ponów**, a poprzednia wersja zostaje.
4. Źródła są wpisane w program (tylko HTTPS do listy hostów): Codex z wydań `openai/codex` na GitHubie, Claude Code z `downloads.claude.ai`. Bez sumy SHA-256 w metadanych nic się nie pobiera.

| Przycisk lub pole | Co robi |
|---|---|
| **Sprawdź** | pokazuje „Najnowsza” wersję, **nic nie pobiera** |
| **Zaktualizuj** / **Usuń** | pojawiają się, gdy jest pobrana kopia. **Usuń** kasuje tylko pobraną kopię (własna ścieżka i systemowe CLI zostają). Gdy agent właśnie używa pobranego CLI, program zwróci błąd |
| **Aktualizuj automatycznie** | włączone domyślnie. Sprawdza przy starcie programu i co 6 h; dotyczy tylko pobranego CLI, bez przypiętej wersji i bez własnej ścieżki. Nieudana aktualizacja zostawia działającą wersję |
| **Przypnij** / **Odepnij** | wpisz wersję w „Przypięta wersja”; przypięcie wstrzymuje automatyczne aktualizacje |
| **Zapisz ścieżkę** / **Wyczyść ścieżkę** | „Własna ścieżka do CLI”: pełna ścieżka do pliku (do 1024 znaków). Własna ścieżka wygrywa nad pobranym i systemowym CLI |

- **Gdzie leży CLI:** w folderze danych programu (punkt 3), w `cli\<codex lub claude>\<wersja>\` (zob. „Do potwierdzenia”, pkt 1). Trzymana jest tylko bieżąca wersja; stare foldery i niedokończone pobrania program sprząta przy starcie. „Usuń moje dane” kasuje też te foldery.
- **Kolejność wyboru CLI:** zmienne `OPENBOT_CODEX_PATH` / `OPENBOT_CLAUDE_PATH` → własna ścieżka → pobrane → `PATH` i znane foldery (punkt 4).
- **Pierwsze uruchomienie:** gdy wybrany dostawca nie ma CLI, „Continue” jest zablokowane, a obok jest **Pobierz i przejdź dalej**.

### 2. Konta i pula (krok 2 z 5)

Czas: ok. 3 min na konto plus logowanie w przeglądarce (program czeka maks. 10 min).

1. **Providers** → **Konta i pula** → pod Codex lub Claude wpisz etykietę → **Dodaj konto**. Używaj tylko **własnych** kont: program pokazuje ostrzeżenie, że regulamin planów ChatGPT i Claude może zabraniać dzielenia konta albo używania wielu kont do omijania limitów (to samo ostrzeżenie jest przy włączaniu konta do puli).
2. **Zaloguj** (bez terminala). Program uruchamia oficjalne polecenie CLI, które otwiera przeglądarkę. Karta pokazuje „Czekam na przeglądarkę”, **Otwórz stronę logowania** (tylko adresy https), „Kod urządzenia” albo pole **Kod logowania** z przyciskiem **Przekaż kod**. **Anuluj logowanie** zatrzymuje próbę. Po sukcesie: „Zalogowano”. **Wyloguj** i **Odśwież** są na tej samej karcie.
3. Gdy logowanie się nie uda: **Ponów logowanie** albo **Otwórz terminal z poleceniem…** (to obejście; najpierw karta zgody, potem wybierz **Odśwież**).
4. **Pula:** przełącznik **W puli** (włączenie wymaga potwierdzenia z ostrzeżeniem), **Włączone** (wyłączone konto nigdy nie jest używane), **Ustaw jako domyślne** oraz kolejność przyciskami **↑ W górę** i **↓ W dół**. **Maks. kont w puli** (od 1 do 10, domyślnie 3) + **Zapisz limit**: limit pilnuje dodawania kont i wejścia do puli.
5. **Konto agenta:** ustawienia agenta → **Konto** („Domyślne” albo wybrane konto; zapis od razu; tylko konta dostawcy zapisanego modelu). Pod spodem: „Teraz odpowiada kontem: …”. Dla agentów ACP kont nie ma.
6. **Konto systemowe** (Twoje dotychczasowe logowanie z punktu 4) jest domyślne i nietykalne: nie da się go wylogować ani usunąć z programu. Adresy e-mail są w oknie maskowane. Dane każdego dodanego konta leżą w osobnym folderze `accounts\<id>` w folderze danych programu; program nie otwiera, nie kopiuje i nie wypisuje plików logowania.

**Przełączanie przy limicie (kolejność: najpierw inne konto, potem model zapasowy):**

- **Limit przed pierwszą akcją** (wiadomość, rozumowanie, plan): program sam przenosi turę na następne konto z puli (wg kolejności) i pokazuje w rozmowie kartę „Switched to account …”. Gdy limit minie, agent sam wraca na swoje konto.
- **Limit po pierwszej akcji** (polecenie, plik, narzędzie): nic nie jest powtarzane samo, żeby nie zdublować skutków. Tura kończy się jako nieudana, a w „Needs you” jest karta „Limit reached on … Continue on …?”. **Send** powtarza prośbę na następnym koncie, **Keep draft** nie robi nic.
- **Wszystkie konta wyczerpane:** po jednej próbie na konto program się zatrzymuje (bez pętli), karta „Limit reached” podaje godzinę resetu (z dopiskiem „Assumed reset at”, gdy dostawca jej nie podał). Dalej decydują modele zapasowe (część 5).

### 3. Klucze API (krok 3 z 5)

Czas: ok. 1 min na klucz.

1. **Providers** → **API keys** → karta **OpenAI** (dla Codex) lub **Anthropic** (dla Claude).
2. Wklej klucz do pola hasła („OpenAI API key” / „Anthropic API key”; 8–512 znaków, jedno słowo, ASCII) → **Save key**. Pole się czyści, klucz **nigdy nie jest pokazany ponownie**: widać tylko maskę (np. „••••1234”; klucz krótszy niż 12 znaków nie pokazuje nic).
3. **Check connection** działa tylko po kliknięciu: „OK”, „Rejected” (odmowa 401/403) albo „Unchecked” (brak sieci, 429 i błędy serwera to nie odrzucenie klucza).
4. **Zapisany klucz jest używany zawsze, aż go usuniesz** (**Remove key**), także gdy dostawca go odrzucił. Żeby wrócić do logowania subskrypcją, usuń klucz. Zmiana działa od następnego startu procesu dostawcy.

Jeden klucz na dostawcę (nie na konto z puli). Klucz jest szyfrowany przez system (Windows: DPAPI); bez szyfrowania systemu **nie jest zapisywany**. Trafia tylko do zmiennej środowiska procesu dostawcy, nigdy do argumentów, dziennika, okna ani zdarzeń; w komunikatach błędów jest zastępowany przez `[redacted]`.

### 4. Własne serwery modeli (krok 4 z 5)

Czas: ok. 2 min.

1. **Providers** → **Own model endpoints** → **Add an endpoint**. Skrót: **Use Ollama** (`http://127.0.0.1:11434/v1`) albo **Use LM Studio** (`http://127.0.0.1:1234/v1`) wypełnia formularz. **Detect local servers** szuka tylko na tym komputerze, na portach 11434 i 1234 (nic nie znalazł = pusta lista, bez błędu).
2. Pola: **Name**, **Kind** (OpenAI-compatible, Ollama, LM Studio), **Address** (razem z wersją, np. `…/v1`; tylko `http://` i `https://`), **Key (optional)**.
3. **Save** niczego nie kontaktuje. **Check connection** pobiera listę modeli z `<adres>/models` (bez przekierowań, do 8 s). Stany: „Not checked”, „Checking…”, „Reachable”, „Key refused”, „Unreachable”.
4. Modele pojawiają się w wyborze modelu każdego agenta jako „… (Nazwa, chat only)”; id modelu to `endpoint:<id>/<model>`.

- **Adresy:** `http` jest dozwolone dla tego komputera i sieci lokalnej (poza tym komputerem z ostrzeżeniem, że wiadomości idą nieszyfrowane). **`http` do hosta spoza sieci lokalnej jest odrzucane**; taki serwer działa tylko przez `https`. Login i hasło w adresie, `?` i `#` są odrzucane.
- **Klucz** (opcjonalny): szyfrowany jak w części 3, wysyłany tylko na ten jeden adres. Zmiana hosta w adresie **kasuje** zapisany klucz; **Remove** kasuje punkt razem z kluczem (agenci na jego modelach dostają czytelny błąd, aż wybierzesz inny model).
- **Tylko rozmowa („chat only”):** agent na takim modelu nie ma narzędzi programu ani załączników. Do 8 punktów.

### 5. Modele zapasowe (krok 5 z 5)

Czas: ok. 2 min na agenta.

1. **Providers** → **Fallback models** → wybierz agenta (**Agent**) → **Add a fallback model** → ustaw kolejność (**Up** / **Down**, przeciąganie albo Alt+↑ / Alt+↓) → **Save order**.
2. **Do 8 modeli** na agenta, bez powtórek. Własny model agenta jest próbowany pierwszy i nie ma go na liście. Lista może mieszać dostawców (Codex, Claude, ACP, własne serwery). Każdy model jest próbowany najwyżej raz na wiadomość; limit dostawcy blokuje wszystkie jego modele naraz, więc zapasowy model tego samego dostawcy nie omija limitu.
3. Listy do 4 modeli sprzed W5 działają bez zmian. Agent, który użył modelu zapasowego, jest oznaczony; przy następnej wiadomości zaczyna znów od własnego modelu.
4. **Lista ogólna** (dla agentów bez własnej listy) **istnieje w silniku, ale nie ma jeszcze ekranu** (zob. niżej). Własna lista agenta, także pusta, zawsze wygrywa; domyślnie lista ogólna jest pusta.

### Czego W5 jeszcze nie robi

- **Nic z prawdziwym kontem ani prawdziwą usługą.** Logowanie (`codex login`, `claude auth login`), przełączanie przy limicie, klucze u OpenAI i Anthropic oraz Ollama i LM Studio sprawdzono na atrapach. Prawdziwy odbiór (bramka G2 na czystym Windows) jeszcze się nie odbył.
- **Pobrane CLI nie było uruchomione jako agent.** Pobranie, SHA-256 i podmiana wersji są sprawdzone w oknie na atrapie serwera; „agent rusza po instalacji bez restartu” i „auto-aktualizacja nie przerywa trwającej tury” wymagają prawdziwego CLI.
- **Podpisy pobranych plików nie są weryfikowane.** Jedynym zabezpieczeniem jest SHA-256 z oficjalnego hosta przez TLS, lista hostów i karta zgody.
- **CLI tylko dla Windows** (x64; arm64, macOS i Linux nie sprawdzano).
- **Zużycie okien (5 h, tydzień) per konto:** pasek użycia nie ma jeszcze źródła per konto, a strona użycia pokazuje konto systemowe. Limit konta wynika z błędu tury, nie z paska.
- **Zmiana konta to nowy wątek dostawcy z przekazaniem historii**, więc kontekst może być streszczony.
- **Gotowe ustawienia ACP** (Gemini, OpenCode, Copilot, Cursor) nie są zrobione: w źródłach nie ma ich poleceń i argumentów. Własnego agenta ACP można dodać ręcznie.
- **Serwery modeli:** brak narzędzi i załączników; historia rozmowy na takim modelu jest w pamięci programu (po restarcie zaczyna od pustego kontekstu); strona użycia ich nie pokazuje.
- **Klucze API:** jeden klucz na dostawcę, nie na konto z puli; brak przełącznika „użyj klucza” (zapisany klucz jest używany zawsze).
- **Modele zapasowe:** brak ekranu listy ogólnej i brak osobnych list „per dostawca” (np. dla wszystkich agentów Codex).
- **Karta zgody na pobranie CLI** jest w „Needs you” i w rozmowie, nie na stronie **Providers** (tam jest tylko „Czeka na zgodę w Needs you”).
- **Udostępniania i eksportu kont nie ma** (świadomie); ostrzeżenie o regulaminie planów jest tylko informacją, program nie ocenia, co jest dozwolone.
- Mieszanka polskich i angielskich napisów na nowych ekranach do czasu W7.

### Do potwierdzenia

Rzeczy, których nie da się potwierdzić z raportów ani z komponentów w tej wersji dokumentu. Nie traktuj ich jako pewnych.

1. **Ścieżki folderów `cli\` i `accounts\`:** raporty podają `<dane programu>\cli\<id>\<wersja>\` i `<dane programu>\accounts\<id>`, a w piaskownicy odbioru plik leżał w `cli\codex\1.0.0\`. Że „dane programu” to folder z punktu 3 (`%APPDATA%\COSGRAL Workspace…`), to wniosek, nie oglądałem tego na instalatorze.
2. **Prawdziwy Codex a klucz:** czy Codex CLI używa zmiennej `OPENAI_API_KEY` zamiast logowania ChatGPT (może oczekiwać `CODEX_API_KEY`), i czy Claude Code z `ANTHROPIC_API_KEY` omija logowanie subskrypcją. Wstrzyknięcie zmiennej sprawdzono tylko na atrapie procesu.
3. **„Rejected” przy kluczu:** czy `/v1/models` zawsze zwraca 401 dla złego klucza. Klucz projektu bez prawa do listy modeli mógłby dostać 403 i pokazać się jako „Rejected”.
4. **Prawdziwe wyjście logowania:** kształt linku, kodu urządzenia i prośby o kod w prawdziwych `codex login` i `claude auth login` wzięto z opisu i atrap.
5. **Czas resetu limitu:** czy dostawca podaje go zawsze; gdy nie, program zakłada godzinę i oznacza to w karcie („Assumed reset at”).
6. **Karta zgody w odpowiedniej rozmowie:** w odbiorze T2a karta trafiała do pierwszego agenta z listy; W5-K1 zmienił to na agenta ostatnio otwartej rozmowy (raport `kk-w5-k1.md`), ale tego nie oglądano w oknie.
7. **Limit kont w puli:** czy konto systemowe wlicza się do „Maks. kont w puli”. Okno liczy wszystkie konta dostawcy (z kodu), czy silnik robi tak samo, nie sprawdzono; nowe konto trafia domyślnie do puli (z kodu i raportu UI1b, nie z okna).
8. **Panel ustawień agenta ma osobną listę „Fallback models (in order)”**, której przycisk **Add fallback** blokuje się przy 4 modelach (`AgentSettingsW3.tsx`), choć strona **Providers** i silnik dopuszczają 8. Z kodu, nie z okna; czy to zamierzone, do ustalenia.
9. **Napis „Add a fallback model…”** na stronie **Providers** ma w kodzie źle zakodowany wielokropek („â€¦”), więc w oknie może wyglądać błędnie. Z kodu, nie z okna.
10. **Auto-aktualizacja co 6 h:** timer nie był czekany (sprawdzono start programu i testy jednostkowe).
11. **Odmowa dla zdalnego serwera i telefonu** (CLI, klucze, konta): jest w kodzie i testach, w oknie nieoglądana.
