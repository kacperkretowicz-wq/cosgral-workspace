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
| Baza (agenci, rozmowy, kanały, Vault, tabele, rutyny, most Telegrama `projection_messengers`), ustawienia, Mobile Connect, certyfikat telefonu, klucze Web Push VAPID | `%APPDATA%\COSGRAL Workspace Dev\` (z folderu) lub `%APPDATA%\COSGRAL Workspace\` (z instalatora) |
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

- **Niewdrożone ekrany pulpitu z W9 i W10:**
  - Ekran konfiguracji telefonu (PIN, Web Push, przewodnik Tailscale) w głównym oknie na pulpicie (W9-BE1 dostarczył kontrakt IPC `window.openbot.phone`, silnik na komputerze, klienta PWA `/app` na telefonie z ekranem blokady PIN, obsługą service workera i powiadomień push; widok w oknie programu czeka na UI Designera).
  - Ekran konfiguracji komunikatorów (most Telegrama) w głównym oknie (W10-KK2 dostarczył kontrakt `window.openbot.messengers`, klienta Bot API z long pollingiem, silnik mostu i testy na atrapie; formularz dodawania tokenu i zarządzania czatami w oknie czeka na UI Designera).
- **Stylistyka i motywy:** W7-UI2 etap 1 scalił podstawowe tłumaczenia PL/EN (`src/renderer/src/locales/`). Pełny system zmiennych i motywów wg OpenBot 0.71 został skodyfikowany w `docs/cosgral/tokeny-071.md` i czeka na podpięcie w stylach przez UI Designera.
- **Braki W5 (dostawcy, konta, klucze, modele zapasowe):** szczegółowo w sekcji „Czego W5 jeszcze nie robi” na końcu tego pliku.
- **Pełna lista i plany:** `docs/cosgral/PLAN-W4.md` oraz `docs/cosgral/parytet-0.68.md`.

## 8. Gdy coś nie działa

- **Okno się nie otwiera:** uruchom `node_modules\electron\dist\electron.exe .` w wierszu poleceń i odczytaj komunikat.
- **„Complete agent CLI setup to start” w polu wiadomości:** program nie widzi Codex ani Claude albo nie jesteś zalogowany (punkt 4). Karta nad rozmową podaje powód; po poprawce wybierz **Try again** (bez restartu programu).
- **„couldn’t start” zaraz po zamknięciu lub awarii:** program sam czeka kilka sekund na zwolnienie bazy; gdy dalej nie może, poczekaj chwilę i uruchom go ponownie. Dane nie są zmieniane.
- **Chcesz zacząć od zera:** zamknij program i skasuj foldery z punktu 3 (albo użyj `--reset` w piaskownicy).

## Telefon poza domem: Tailscale, PIN, Web Push (W9)

Funkcjonalność zdalnego dostępu z telefonu poza domem bez wystawiania komputera na publiczny internet, z opcjonalną blokadą PIN i powiadomieniami Web Push.

### 1. Zasięg i Tailscale
- **Brak zewnętrznych serwerów:** Połączenie poza siecią domową działa przez prywatną sieć Tailscale (adresy `100.64.0.0/10` lub domeny `*.ts.net`).
- **Automatyczny zasięg:** Program raportuje zasięg `tailscale`, gdy adres Tailscale pojawi się na liście interfejsów sieciowych Mobile Connect.
- **Lokalne szyfrowanie TLS:** Połączenie zabezpieczone lokalnym certyfikatem samopodpisanym. Telefon weryfikuje i przypina odcisk certyfikatu (fingerprint) podawany przez komputer.
- **Instrukcja konfiguracji:** Krok po kroku w pliku `docs/cosgral/telefon-tailscale.md`.

### 2. Blokada PIN-em (w aplikacji PWA telefonu)
- **Ochrona dostępu:** Kod 4–8 cyfr konfigurowany w aplikacji `/app` w zakładce Telefon.
- **Weryfikacja po stronie komputera:** Komputer przechowuje wyłącznie skrót kryptograficzny (scrypt z losową solą). Zablokowany telefon otrzymuje odpowiedź HTTP `423 Locked`.
- **Zasady blokady:** Blokada następuje po 5 minutach bezczynności, po przejściu aplikacji telefonu w tło lub po restarcie programu na komputerze.
- **Ochrona przed zgadywaniem:** 5 kolejnych błędnych prób trwale usuwa sparowany telefon (wymaga ponownego sparowania od zera).

### 3. Powiadomienia Web Push
- **Cel:** Powiadamianie telefonu o pojawieniu się nowej karty w sekcji „Needs you” (karty wymagające decyzji lub zgody użytkownika).
- **Bezpieczeństwo kluczy:** Klucze VAPID generowane lokalnie; klucz prywatny przechowywany wyłącznie w postaci zaszyfrowanej w sejfie systemu (DPAPI/safeStorage).
- **Prywatność:** Treść powiadomienia to wyłącznie minimalistyczny komunikat: „*agent X czeka na Ciebie*”. Żadne prompty, dane ani odpowiedzi nie przechodzą przez usługi pośredniczące Apple/Google.
- **Obsługa:** Stuknięcie powiadomienia otwiera kartę decyzji w aplikacji PWA telefonu (po odblokowaniu PIN-em).
- **Stan w oknie:** Silnik, klient PWA i obsługa powiadomień działają; pełny widok konfiguracji telefonu w głównym oknie programu czeka na wdrożenie przez UI Designera.

## Most komunikatorów: Telegram (W10)

Dwukierunkowy most umożliwiający rozmowę z agentami COSGRAL z poziomu aplikacji Telegram.

### 1. Architektura i mechanizm działania
- **Long polling:** Program sam regularnie pyta Telegram Bot API (`getUpdates`) o nowe wiadomości. Nie wymaga publicznego IP, tuneli ani zewnętrznych webhooków (`deleteWebhook` wywoływane przy starcie).
- **Szyfrowanie tokenu bota:** Token bota uzyskany z `@BotFather` jest wpisywany raz i szyfrowany bezpiecznie sejfem Windows (DPAPI/`SecretBox`) w tabeli `projection_messengers` bieżącej przestrzeni. Nigdy nie jest logowany i nie wraca do interfejsu.
- **Biała lista czatów (Zero-Trust):** Wszystkie wiadomości z nieznanych czatów są ignorowane w milczeniu. Właściciel programu w ustawieniach dodaje do 20 dozwolonych prywatnych czatów i każdemu przypisuje dedykowanego agenta.

### 2. Izolacja i zachowanie agenta
- **Brak dodatkowych uprawnień:** Agent nie otrzymuje żadnego narzędzia do wysyłania wiadomości w świat; nie może zainicjować wiadomości do obcego czatu.
- **Przepływ wiadomości:** Wiadomość tekstowa z dozwolonego czatu prywatnego trafia do przypisanego agenta z prefiksem `[Telegram]`, a odpowiedź asystenta wraca automatycznie do tego samego czatu (dzielona na fragmenty do 4000 znaków).
- **Limity bezpieczeństwa:** Maksymalnie 10 wiadomości na minutę na czat, kolejka do 5 oczekujących odpowiedzi, limit czasu 15 minut na odpowiedź agenta, teksty dłuższe niż 4000 znaków odrzucane ze stałym komunikatem.
- **Stan w oknie:** Kontrakt IPC `window.openbot.messengers`, klient Bot API, silnik mostu i testy jednostkowe (`messenger-bridge.test.ts`, `telegram-client.test.ts`) są gotowe. Formularz w oknie głównym czeka na wdrożenie przez UI Designera. Szczegóły: `docs/cosgral-raporty/kk-w10-kk2.md`.

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

**Stan (zaktualizowane 17.11 do integracji `codex/cosgral-desktop`):** wszystkie pięć części jest w programie. Sprawdzone: testy i kroki w oknie na atrapach (fałszywe CLI, serwer plików, konta, klucze, serwery modeli) oraz **prawdziwe pobranie** Codex 0.169.0 i Claude Code 2.1.325 z oficjalnych źródeł przez zainstalowany program (SHA-256 zgodne, pobrane wersje się uruchamiają; raport `kk-w5-g2.md`). Według `kk-w5-g3.md` (integracja `b516ac19f`): `sandbox:e2e` 30 ok, kroki W5 29/29; tego nie powtarzałem. **Jeszcze nie sprawdzone:** prawdziwe zalogowanie (doszliśmy tylko do ekranów logowania OpenAI i Claude), prawdziwy klucz API, prawdziwy limit konta, tura „OK” na pobranym CLI, prawdziwy Ollama lub LM Studio. Zobacz „Czego W5 jeszcze nie robi” i „Do potwierdzenia” niżej.

Napisy w oknie są częściowo po polsku, częściowo po angielsku (pełna lokalizacja to W7, zob. `docs/cosgral/i18n-inwentarz.md`); podaję je tak, jak widać w oknie. Sekcje strony **Providers** idą w kolejności: Konta i pula, Narzędzia CLI, API keys, Own model endpoints, użycie dostawców, presety ACP, agenci ACP, Fallback models.

### 1. Pobieranie CLI (krok 1 z 5)

Czas: ok. 1 min klikania; samo pobranie zależy od łącza (Codex 0.169.0 ok. 365 MB, Claude 2.1.325 ok. 372 MB; na teście 12–20 s każde). Bez uprawnień administratora.

1. **Providers** → **Narzędzia CLI** → karta Codex lub Claude → **Pobierz**.
2. Za pierwszym razem program **pyta o zgodę** i niczego nie pobiera, dopóki nie odpowiesz. Karta w „Needs you” (tytuł np. „Download Codex CLI …?”) pokazuje wersję i oficjalne źródło (czy podaje też rozmiar: zob. „Do potwierdzenia”). **Confirm** pobiera, **Cancel** nie pobiera nic. Bez żadnego agenta pytanie pokazuje okno systemowe. Po pierwszej zgodzie aktualizacje idą bez karty, ale zawsze ze sprawdzeniem SHA-256.
3. Karta na stronie pokazuje fazy: „Sprawdzanie wersji”, „Czeka na zgodę w Needs you”, „Pobieranie” (z paskiem postępu), „Sprawdzanie SHA-256”, „Instalowanie”, „Gotowe”. Gdy suma SHA-256 się nie zgadza, nic nie zostaje zapisane i program nie ponawia. Gdy połączenie się urwie, program próbuje jeszcze raz sam; po drugim urwaniu pokazuje błąd i przycisk **Ponów**, a poprzednia wersja zostaje.
4. Źródła są wpisane w program (tylko HTTPS do listy hostów): Codex z wydań `openai/codex` na GitHubie, Claude Code z `downloads.claude.ai`. Bez sumy SHA-256 w metadanych nic się nie pobiera.

| Przycisk lub pole | Co robi |
|---|---|
| **Sprawdź** | pokazuje „Najnowsza” wersję, **nic nie pobiera** |
| **Zaktualizuj** / **Usuń** | pojawiają się, gdy jest pobrana kopia. **Usuń** kasuje tylko pobraną kopię (własna ścieżka i systemowe CLI zostają). Gdy agent właśnie używa pobranego CLI, program zwróci błąd |
| **Aktualizuj automatycznie** | włączone domyślnie. Sprawdza przy starcie programu i co 6 h; dotyczy tylko pobranego CLI, bez przypiętej wersji i bez własnej ścieżki. Nieudana aktualizacja zostawia działającą wersję |
| **Przypnij** / **Odepnij** | wpisz wersję w „Przypięta wersja”; przypięcie wstrzymuje automatyczne aktualizacje |
| **Zapisz ścieżkę** / **Wyczyść ścieżkę** | „Własna ścieżka do CLI”: pełna ścieżka do pliku (do 1024 znaków). Własna ścieżka wygrywa nad pobranym i systemowym CLI |

- **Przełączanie wersji na Windows:** system nie pozwala skasować uruchomionego pliku. Gdy plik wersji na dysku ma tę samą sumę SHA-256, program używa go ponownie; gdy jest inny i nie da się go usunąć, pokazuje komunikat „still running” i zostawia działającą wersję. Sprawdzone na prawdziwym Codex (przypięcie 0.168.0 i powrót do 0.169.0); przypięcia Claude nie przechodzono.
- **Gdzie leży CLI:** w folderze danych programu (punkt 3), w `cli\<codex lub claude>\<wersja>\` (zob. „Do potwierdzenia”, pkt 1). Trzymana jest tylko bieżąca wersja; stare foldery i niedokończone pobrania program sprząta przy starcie. „Usuń moje dane” kasuje też te foldery.
- **Kolejność wyboru CLI:** zmienne `OPENBOT_CODEX_PATH` / `OPENBOT_CLAUDE_PATH` → własna ścieżka → pobrane → `PATH` i znane foldery (punkt 4).
- **Pierwsze uruchomienie:** gdy wybrany dostawca nie ma CLI, „Continue” jest zablokowane, a obok jest **Pobierz i przejdź dalej**.

### 2. Konta i pula (krok 2 z 5)

Czas: ok. 3 min na konto plus logowanie w przeglądarce (program czeka maks. 10 min).

1. **Providers** → **Konta i pula** → pod Codex lub Claude wpisz etykietę → **Dodaj konto**. Używaj tylko **własnych** kont: program pokazuje ostrzeżenie, że regulamin planów ChatGPT i Claude może zabraniać dzielenia konta albo używania wielu kont do omijania limitów (to samo ostrzeżenie jest przy włączaniu konta do puli).
2. **Zaloguj** (bez terminala). Program uruchamia oficjalne polecenie CLI, które otwiera przeglądarkę. Karta pokazuje „Czekam na przeglądarkę”, **Otwórz stronę logowania** (tylko adresy https), „Kod urządzenia” albo pole **Kod logowania** z przyciskiem **Przekaż kod**. **Anuluj logowanie** zatrzymuje próbę. Po sukcesie: „Zalogowano”. **Wyloguj** i **Odśwież** są na tej samej karcie. Na prawdziwych CLI (do ekranu logowania, bez kończenia) Codex pokazał link i komunikat „Finish signing in in the browser…” bez kodu urządzenia, a Claude poprosił o wklejenie kodu ze strony.
3. Gdy logowanie się nie uda: **Ponów logowanie** albo **Otwórz terminal z poleceniem…** (to obejście; najpierw karta zgody, potem wybierz **Odśwież**).
4. **Pula:** przełącznik **W puli** (włączenie wymaga potwierdzenia z ostrzeżeniem), **Włączone** (wyłączone konto nigdy nie jest używane), **Ustaw jako domyślne** oraz kolejność przyciskami **↑ W górę** i **↓ W dół**. **Maks. kont w puli** (od 1 do 10, domyślnie 3) + **Zapisz limit**. Limit liczy **wszystkie** konta dostawcy przy dodawaniu (także systemowe) i konta w puli przy wejściu do puli; obniżenie limitu nie usuwa istniejących kont.
5. **Powrót po resecie:** przełącznik **Return to the first account after the limit resets** (domyślnie włączony). Włączony: każda tura zaczyna od pierwszego konta, więc agent wraca, gdy limit minął. Wyłączony: agent zostaje na koncie swojej ostatniej tury, dopóki to konto może odpowiadać i nic nie zmieniłeś; po restarcie programu zaczyna od pierwszego konta.
6. **Konto agenta:** ustawienia agenta → **Konto** („Domyślne” albo wybrane konto; zapis od razu; tylko konta dostawcy zapisanego modelu). Pod spodem: „Teraz odpowiada kontem: …”. Dla agentów ACP kont nie ma.
7. **Konto systemowe** (Twoje dotychczasowe logowanie z punktu 4) jest domyślne i nietykalne: nie da się go wylogować ani usunąć z programu. Adresy e-mail są w oknie maskowane. Dane każdego dodanego konta leżą w osobnym folderze `accounts\<id>` w folderze danych programu; program nie otwiera, nie kopiuje i nie wypisuje plików logowania. Bezczynny proces CLI konta jest zatrzymywany po 5 minutach, a następna wiadomość uruchamia nowy.

**Przełączanie przy limicie (kolejność: najpierw inne konto, potem model zapasowy):**

- **Limit przed pierwszą akcją** (wiadomość, rozumowanie, plan): program sam przenosi turę na następne konto z puli (wg kolejności) i pokazuje w rozmowie kartę „Switched to account …”. Gdy agent wraca na pierwsze konto i od razu trafia na limit, dwie informacje o zmianie konta łączą się w jedną kartę „switched” (karta „Limit reached” zostaje osobno).
- **Limit po pierwszej akcji** (polecenie, plik, narzędzie): nic nie jest powtarzane samo, żeby nie zdublować skutków. Tura kończy się jako nieudana, a w „Needs you” jest karta „Limit reached on … Continue on …?”. **Send** powtarza prośbę na następnym koncie, **Keep draft** nie robi nic.
- **Wszystkie konta wyczerpane:** po jednej próbie na konto program się zatrzymuje (bez pętli), karta „Limit reached” podaje godzinę resetu (z dopiskiem „Assumed reset at”, gdy dostawca jej nie podał). Dalej decydują modele zapasowe (część 5).
- **Błąd sieci to nie limit:** pojawia się spokojna karta „Connection problem” (bez słowa „limit” i bez „Continue”, z **Dismiss**). Konto nie jest znakowane jako wyczerpane i nic się nie przełącza. Tura kończy się błędem; przy błędzie typu „niedostępny” (np. 503) może wejść model zapasowy.

### 3. Klucze API (krok 3 z 5)

Czas: ok. 1 min na klucz.

1. **Providers** → **API keys** → karta **OpenAI** (dla Codex) lub **Anthropic** (dla Claude).
2. Wklej klucz do pola hasła („OpenAI API key” / „Anthropic API key”; 8–512 znaków, jedno słowo, ASCII) → **Save key**. Pole się czyści, klucz **nigdy nie jest pokazany ponownie**: widać tylko maskę (np. „••••1234”; klucz krótszy niż 12 znaków nie pokazuje nic).
3. **Check connection** działa tylko po kliknięciu: „OK”, „Rejected” (odmowa 401/403) albo „Unchecked” (brak sieci, 429 i błędy serwera to nie odrzucenie klucza).
4. **Zapisany klucz jest używany zawsze, aż go usuniesz** (**Remove key**), także gdy dostawca go odrzucił. Żeby wrócić do logowania subskrypcją, usuń klucz. Zmiana działa od następnego startu procesu dostawcy.

Jeden klucz na dostawcę (nie na konto z puli). Klucz jest szyfrowany przez system (Windows: DPAPI); bez szyfrowania systemu **nie jest zapisywany**. Trafia tylko do zmiennej środowiska procesu dostawcy, nigdy do argumentów, dziennika, okna ani zdarzeń; w komunikatach błędów jest zastępowany przez `[redacted]`. W oknie na atrapie sprawdzania klucza (kroki K01–K04) nie znaleziono klucza w bazie, logach ani zdarzeniach; prawdziwego klucza nie użyto.

### 4. Własne serwery modeli (krok 4 z 5)

Czas: ok. 2 min.

1. **Providers** → **Own model endpoints** → **Add an endpoint**. Skrót: **Use Ollama** (`http://127.0.0.1:11434/v1`) albo **Use LM Studio** (`http://127.0.0.1:1234/v1`) wypełnia formularz. **Detect local servers** szuka tylko na tym komputerze, na portach 11434 i 1234 (nic nie znalazł = pusta lista, bez błędu).
2. Pola: **Name**, **Kind** (OpenAI-compatible, Ollama, LM Studio), **Address** (razem z wersją, np. `…/v1`; tylko `http://` i `https://`), **Key (optional)**.
3. **Save** niczego nie kontaktuje. **Check connection** pobiera listę modeli z `<adres>/models` (bez przekierowań, do 8 s). Stany: „Not checked”, „Checking…”, „Reachable”, „Key refused”, „Unreachable”.
4. Modele pojawiają się w wyborze modelu każdego agenta jako „… (Nazwa, chat only)”; id modelu to `endpoint:<id>/<model>`.

- **Adresy:** `http` jest dozwolone dla tego komputera i sieci lokalnej (poza tym komputerem z ostrzeżeniem, że wiadomości idą nieszyfrowane). **`http` do hosta spoza sieci lokalnej jest odrzucane**; taki serwer działa tylko przez `https`. Login i hasło w adresie, `?` i `#` są odrzucane.
- **Klucz** (opcjonalny): szyfrowany jak w części 3, wysyłany tylko na ten jeden adres. Zmiana hosta w adresie **kasuje** zapisany klucz; **Remove** kasuje punkt razem z kluczem (agenci na jego modelach dostają czytelny błąd, aż wybierzesz inny model).
- **Tylko rozmowa („chat only”):** agent na takim modelu nie ma narzędzi programu ani załączników. Do 8 punktów.
- Sprawdzone w oknie na atrapie serwera (kroki E01–E06); prawdziwego Ollama ani LM Studio nie użyto.

### 5. Modele zapasowe (krok 5 z 5)

Czas: ok. 3 min na pierwszą listę.

1. **Kolejność wyboru:** po limicie najpierw próbowane są **inne konta z puli** (część 2), dopiero potem modele zapasowe. Model główny agenta jest pierwszy i nie ma go na listach.
2. **Trzy warstwy, dodają się:** lista **agenta** → lista **dostawcy** (dostawcy modelu głównego agenta: Codex, Claude, agent ACP albo własny serwer) → lista **„All providers”**. Każda ma do 8 modeli, bez powtórek (łańcuch do 24), a każdy model jest próbowany najwyżej raz na wiadomość. Na liście mogą być modele innego dostawcy.
3. **Gdzie klikać:** **Providers** → **Fallback models**.
   - Edytory list dostawców: osobny dla Codex, Claude, każdego agenta ACP i każdego własnego serwera, na końcu „All providers”. **Add a fallback model** (lista rozwijana) → kolejność (przyciski **Up** / **Down**, przeciąganie albo Alt+↑ / Alt+↓) → **Save order**.
   - Pole **Agent**: wybierz agenta, ustaw jego własną listę tym samym edytorem. Pod spodem jest „Agent's own list” albo „Using provider and all-provider lists”, przycisk **Reset to provider list** (usuwa tylko własną listę agenta) i **Saved fallback chain**: modele z etykietą źródła (Agent / Provider / All) i znacznikiem „Unavailable”.
   - Ten sam edytor listy jest w ustawieniach agenta (limit 8).
4. **Pusta własna lista agenta nie wyłącza** list dostawcy i ogólnej (zmiana względem pierwszej wersji W5). Osobnego wyłączenia modeli zapasowych dla jednego agenta nie ma.
5. Limit dostawcy blokuje wszystkie jego modele naraz, więc zapasowy model tego samego dostawcy **nie omija limitu**. Model usunięty (agent ACP albo własny serwer) zostaje na liście jako „Unavailable” i nie jest próbowany.
6. Listy do 4 modeli sprzed W5 działają bez zmian. Agent, który użył modelu zapasowego, jest oznaczony; przy następnej wiadomości zaczyna znów od własnego modelu (osobnego ustawienia powrotu dla modeli nie ma; przełącznik z części 2 dotyczy kont).

### Czego W5 jeszcze nie robi

- **Nic z prawdziwym kontem ani prawdziwą usługą.** Logowanie do końca (`codex login`, `claude auth login`), przełączanie przy limicie, klucze u OpenAI i Anthropic oraz Ollama i LM Studio sprawdzono na atrapach. Prawdziwy odbiór na czystym koncie Windows (bramka G2: G03–G08, G11, G12) wymaga właściciela i jeszcze się nie odbył.
- **Tura „OK” na pobranym CLI** nie była sprawdzona: pobrane CLI się uruchamia, ale agent odpowiadający przez nie wymaga zalogowania. „Auto-aktualizacja nie przerywa trwającej tury” sprawdzono tylko na atrapie CLI.
- **Podpisy pobranych plików nie są weryfikowane.** Jedynym zabezpieczeniem jest SHA-256 z oficjalnego hosta przez TLS, lista hostów i karta zgody. Instalator programu nie jest podpisany (SmartScreen może ostrzegać).
- **CLI tylko dla Windows** (arm64, macOS i Linux nie sprawdzano).
- **Zużycie okien (5 h, tydzień) per konto:** pasek użycia nie ma jeszcze źródła per konto, a strona użycia pokazuje konto systemowe. Wiersz agenta i strona użycia mogą pokazywać limit Codex do resetu ostatniego konta, choć agent już pracuje na wolnym (tylko wyświetlanie). Limit konta wynika z błędu tury, nie z paska.
- **Zmiana konta to nowy wątek dostawcy z przekazaniem historii**, więc kontekst może być streszczony.
- **Claude w puli:** pokryty kodem i testami jednostkowymi kont, ale nie testem silnika ani krokiem w oknie (atrapy Claude dla kont nie ma).
- **Presety ACP** są dla Gemini CLI i Antigravity (W6): dodają agenta tylko, gdy polecenie jest w `PATH` albo je podasz, niczego nie instalują i pokazują link instalacji. OpenCode, Copilot i Cursor ze specyfikacji W5: brak (ich poleceń i argumentów nie ma w źródłach). Własnego agenta ACP można dodać ręcznie.
- **Serwery modeli:** brak narzędzi i załączników; historia rozmowy na takim modelu jest w pamięci programu (po restarcie zaczyna od pustego kontekstu); strona użycia ich nie pokazuje.
- **Klucze API:** jeden klucz na dostawcę, nie na konto z puli; brak przełącznika „użyj klucza” (zapisany klucz jest używany zawsze).
- **Modele zapasowe:** zasady warstw (agent → dostawca → ogólna, dodawanie się list) to decyzja zespołu na podstawie opisu właściciela, nieporównana z działaniem OpenBota. Ekran list dostawców i łańcucha sprawdzony testami i Storybookiem, w prawdziwym oknie tylko przez wywołania IPC (kroki F01, F02).
- **Karta zgody na pobranie CLI** jest w „Needs you” i w rozmowie, nie na stronie **Providers** (tam jest tylko „Czeka na zgodę w Needs you”).
- **Udostępniania i eksportu kont nie ma** (świadomie); ostrzeżenie o regulaminie planów jest tylko informacją, program nie ocenia, co jest dozwolone.
- Mieszanka polskich i angielskich napisów na ekranach Dostawców do czasu W7.

### Do potwierdzenia

Rzeczy, których nie da się potwierdzić z raportów ani z komponentów. Nie traktuj ich jako pewnych.

1. **Ścieżki folderów `cli\` i `accounts\`:** raporty podają `<dane programu>\cli\<id>\<wersja>\` i `<dane programu>\accounts\<id>`. Że „dane programu” to folder z punktu 3 (`COSGRAL Workspace` w `%APPDATA%`), to wniosek z raportów, nie oglądałem tego na instalatorze.
2. **Prawdziwy Codex a klucz:** czy Codex CLI używa zmiennej `OPENAI_API_KEY` zamiast logowania ChatGPT (może oczekiwać `CODEX_API_KEY`), i czy Claude Code z `ANTHROPIC_API_KEY` omija logowanie subskrypcją. Wstrzyknięcie zmiennej sprawdzono tylko na atrapie procesu.
3. **„Rejected” przy kluczu:** czy `/v1/models` zawsze zwraca 401 dla złego klucza. Klucz projektu bez prawa do listy modeli mógłby dostać 403 i pokazać się jako „Rejected”.
4. **Zakończenie logowania na prawdziwych CLI:** do ekranu logowania zachowanie sprawdzono (część 2, pkt 2). Wklejenie kodu Claude, pomyślne zakończenie i tura po zalogowaniu: nie sprawdzone (tylko właściciel).
5. **Czas resetu limitu:** czy dostawca podaje go zawsze; gdy nie, program zakłada godzinę i oznacza to w karcie („Assumed reset at”).
6. **Karta zgody:** w odbiorze na atrapie karta pokazywała rozmiar (90 MB), a przy prawdziwym pobraniu KK zapisał, że karta nie podaje rozmiaru (365 MB), choć jest znany. Raporty nie rozstrzygają, co pokazuje karta w prawdziwym pobraniu. Do tego karta trafia do agenta ostatnio otwartej rozmowy (poprawka W5-K1), czego nie oglądano w oknie.
7. **Pierwsze uruchomienie świeżo pobranego Claude:** raz zdarzyło się „Claude CLI was found but could not be started” zaraz po pobraniu 372 MB; kolejny przebieg przeszedł. Przyczyna (najpewniej skan antywirusa) to hipoteza; program nie ponawia startu i nie podaje powodu.
8. **Prawdziwe komunikaty błędów sieci Codex i Claude:** wzorce „to błąd sieci, nie limit” pochodzą z typowych błędów Node i HTTP. Gdy prawdziwy CLI użyje innych słów, błąd będzie zwykłym błędem (bez karty), nie limitem.
9. **Auto-aktualizacja co 6 h:** timer nie był czekany (sprawdzono start programu i testy jednostkowe).
10. **Ekran list zapasowych per dostawca w prawdziwym oknie** i warstwy BE7 w całym łańcuchu (konta → agent → dostawca → ogólna): testy jednostkowe i Storybook są, odbioru w oknie na integracji nie widziałem w raportach.
