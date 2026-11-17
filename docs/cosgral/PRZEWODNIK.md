# COSGRAL Workspace: Przewodnik użytkownika

Przewodnik dla właściciela projektu i użytkownika programu (bez żargonu programistycznego i bez nazw plików źródłowych).  
Opisuje rzeczywisty stan programu, sposób uruchomienia, codzienną pracę z agentami i zespołami oraz zaawansowane narzędzia.

---

## 1. Co program potrafi dzisiaj (uczciwy stan funkcji)

| Funkcja | Stan dzisiaj | Co działa, a czego jeszcze brakuje |
|---|---|---|
| **Prywatność danych** | **Jest** | Wszystkie bazy, rozmowy, notatki i klucze zostają wyłącznie na tym komputerze. Zero wysyłania telemetrii czy danych do chmury programu. |
| **Pojedynczy agenci (1:1)** | **Jest** | Tworzenie dowolnej liczby agentów, nadawanie im imion, ról, kolorów i awatarów. Rozmowa w czasie rzeczywistym, zapamiętywanie historii po restarcie. |
| **Wielowątkowość rozmów** | **Jest** | Pasek zakładek wątków nad czatem. Możesz prowadzić z jednym agentem wiele równoległych wątków, przełączać się między nimi i rozgałęziać pomysły. |
| **Kolejka wiadomości i sterowanie** | **Jest** | Jeśli wyślesz wiadomość, gdy agent jeszcze pracuje, trafia ona do kolejki FIFO (z opcją edycji, zmiany kolejności lub natychmiastowego nakierowania). |
| **Karty decyzji („Needs you”)** | **Jest** | Gdy agent potrzebuje Twojej odpowiedzi, zgody na uruchomienie polecenia, akceptacji plików czy przejęcia przeglądarki – wyświetla interaktywną kartę. |
| **Kanały zespołowe** | **Jest** | Tworzenie zespołów agentów z liderem. Twoje polecenie w kanale staje się zadaniem: lider rozdziela pracę na członków, a Ty widzisz postęp na tablicy zadań. |
| **Prywatna pamięć agentów** | **Jest** | Dwa poziomy pamięci: kluczowa (zawsze obecna w kontekście) i przeszukiwana (agent sam szuka w swoich notatkach, gdy czegoś potrzebuje). |
| **Przeszukiwanie globalne** | **Jest** | Jedno okno szukania (`Ctrl+K` / `Cmd+K`): agenci, wiadomości, kanały, pliki z biblioteki i zaplanowane zadania. |
| **Dostawcy modeli bez terminala** | **Jest** | Logowanie do Codex (ChatGPT) i Claude przez przeglądarkę z poziomu programu, obsługa kluczy API oraz lokalnych modeli (Ollama, LM Studio). |
| **Pula kont i modele zapasowe** | **Jest** | Możliwość podpięcia wielu kont (np. 3 konta ChatGPT) – program sam przełączy konto po wyczerpaniu limitu. Do 8 modeli zapasowych w łańcuchu. |
| **Sejf haseł i konektory** | **Częściowo** | Własny szyfrowany sejf w programie (hasła, karty, klucze API, kody 2FA/TOTP). Integracja z 1Password i Bitwarden pozwala agentom korzystać z haseł bez ich kopiowania. |
| **Katalog aplikacji (Marketplace)** | **Częściowo** | Przeglądanie katalogu 251 narzędzi (dokumenty, bazy danych, analizy). Silnik instaluje wtyczki jako lokalne narzędzia; część wtyczek wymaga jeszcze podpięcia ekranu logowania. |
| **Dostęp z telefonu (Mobile Connect)** | **Częściowo** | Parowanie telefonu kodem QR, dostęp w sieci domowej oraz poza domem przez Tailscale, blokada kodem PIN, powiadomienia Web Push. Czat na telefonie działa; kanały czekają na rozszerzenie. |
| **Most Telegrama** | **Częściowo** | Bezpieczny most z oficjalnym Botem Telegrama (działa lokalnie, bez serwerów pośredniczących). Rozmowy tylko ze zweryfikowanymi kontami z białej listy. |
| **Zdalny pulpit i sterowanie ekranem** | **Częściowo** | Agent potrafi klikać, pisać i robić zrzuty ekranu (Computer Use na Windows) zawsze po Twojej wyraźnej zgodzie. Podgląd zdalnego pulpitu działa w sieci lokalnej. |
| **Głos i mowa** | **Częściowo** | Odczytywanie odpowiedzi agenta na głos (głosy systemowe Windows) oraz zamiana mowy na tekst lokalnym modelem Whisper bez wysyłania dźwięku do sieci. |

---

## 2. Jak uruchomić program

Program oferuje 3 wygodne tryby działania dostosowane do Twoich potrzeb:

### Sposób A: Codzienna praca na Twoim komputerze (Zalecany)
1. W folderze programu kliknij dwukrotnie plik:  
   `start-cosgral.cmd`
2. Przy pierwszym uruchomieniu skrypt automatycznie przygotuje i uruchomi aplikację (trwa to ok. 30–45 sekund).
3. Otworzy się okno powitalne z wyborem dostawcy sztucznej inteligencji.
4. Twoje dane i agenci zapisują się bezpiecznie w Twoim profilu użytkownika Windows.

### Sposób B: Bezpieczna piaskownica (Do testów)
Jeśli chcesz przetestować aplikację bez używania prawdziwego konta, bez pobierania modeli i bez dotykania Twoich prawdziwych plików:
1. Kliknij dwukrotnie plik:  
   `start-cosgral-sandbox.cmd`
2. Program uruchomi się z wirtualnym, odizolowanym profilem i demonstracyjną sztuczną inteligencją, która symuluje odpowiedzi.
3. Reset piaskownicy do zera w każdej chwili: uruchomienie z parametrem `--reset`.

### Sposób C: Tradycyjna instalacja Windows
1. Możesz zbudować samodzielny instalator Windows (`.exe` w podfolderze `dist`).
2. Po instalacji program pojawia się w menu Start jak zwykła aplikacja Windows.
3. Nie ingeruje w instalacje innych programów i ma własną, w pełni odizolowaną bazę danych.

---

## 3. Pierwsze kroki: Konfiguracja dostawcy sztucznej inteligencji

Gdy otworzysz program po raz pierwszy, zobaczysz ekran wstępnej konfiguracji („Set up this computer”):

1. **Wybór dostawcy:**
   - **Codex (ChatGPT):** jeśli posiadasz subskrypcję ChatGPT Plus lub Pro. Program wykrywa narzędzie automatycznie. Klikasz zaloguj, potwierdzasz logowanie w przeglądarce i jesteś gotowy do pracy.
   - **Claude:** jeśli korzystasz z konta Anthropic / Claude.
   - **Klucz API:** jeśli wolisz rozliczać się za rzeczywiste zużycie tokenów, możesz wkleić swój klucz API bezpośrednio w ustawieniach dostawców.
   - **Lokalne modele (np. Ollama, LM Studio):** możesz podać adres lokalnego serwera modeli i pracować całkowicie bez dostępu do internetu.
2. **Wybór języka:**
   - Wybierz język Polski lub Angielski – cały interfejs, powiadomienia i ustawienia natychmiast dostosują się do Twojego wyboru.
3. **Uprawnienia sterowania komputerem (opcjonalne):**
   - Jeśli chcesz, aby agenci mogli pomagać Ci w klikaniu aplikacji biurowych lub przeglądarki, włącz opcję „Computer Use”. Pamiętaj: każda pojedyncza akcja będzie zawsze wymagać Twojej klikniętej zgody na ekranie.

---

## 4. Codzienna obsługa

### Praca z Agentami (1:1)
1. **Tworzenie nowego agenta:**
   - W lewym panelu kliknij przycisk `+` i wybierz **Nowy agent**.
   - Wybierz awatar, kolor wyróżniający, podaj imię i wpisz krótką instrukcję (np. „Jesteś analitykiem finansowym, weryfikujesz zestawienia kosztów”).
   - Wybierz domyślny model oraz poziom zaangażowania (effort).
2. **Wiele wątków jednocześnie (Zakładki wątków):**
   - Nad oknem rozmowy znajduje się pasek zakładek.
   - Kliknij `+`, aby zacząć zupełnie nowy wątek z tym samym agentem (bez utraty dotychczasowej rozmowy).
   - Kliknięcie prawym przyciskiem myszy na zakładce pozwala zamknąć kartę, zamknąć pozostałe lub zamknąć karty po prawej. Zamknięcie karty nie kasuje wątku – w każdej chwili możesz do niego wrócić z menu rozwijanego po prawej stronie.
3. **Prywatna pamięć agenta:**
   - W ustawieniach agenta możesz przejrzeć jego notatki.
   - Pamięć kluczowa („essential”) zawiera najważniejsze zasady (np. preferencje formatowania dokumentów), które agent pamięta zawsze.
   - Pamięć przeszukiwana („searchable”) to baza wiedzy, z której agent korzysta tylko wtedy, gdy zadasz powiązane pytanie.
4. **Zarządzanie agentami na liście:**
   - Możesz tworzyć foldery (do 5 poziomów zagłębienia) i układać w nich agentów.
   - Opcja **Duplikuj** pozwala sklonować konfigurację agenta bez kopiowania jego historii rozmów.
   - Opcja **Ukryj** pozwala schować rzadziej używanych asystentów z widoku głównego.

### Kanały i praca zespołowa
Kanały służą do delegowania złożonych projektów na cały zespół asystentów:

1. **Utworzenie kanału:**
   - Kliknij `+` w panelu bocznym i wybierz **Nowy kanał**.
   - Wskaż **Lidera zespołu** oraz dodaj pozostałych członków (np. Analityk, Programista, Redaktor).
2. **Jak działa praca w kanale:**
   - Wpisujesz polecenie w czacie kanału.
   - Lider zespołu automatycznie analizuje zadanie, dzieli je na mniejsze etapy i przydziela konkretnym agentom.
3. **Widok Czat kontra Zadania:**
   - W prawym górnym rogu kanału możesz w każdej chwili przełączyć się między osią rozmowy a tablicą zadań.
   - Na liście zadań widzisz, kto nad czym aktualnie pracuje, jakie zadania są ukończone („Done”), a w razie potrzeby możesz zatrzymać (Pause) lub przerwać pracę agenta.

### Wyszukiwanie globalne (`Ctrl+K` / `Cmd+K`)
Naciśnij skrót `Ctrl+K` na klawiaturze lub kliknij pasek szukania u góry:
1. Wpisz dowolne słowo kluczowe.
2. Wyniki są podzielone na intuicyjne zakładki:
   - **Wszystko:** łączne trafienia z priorytetem najważniejszych.
   - **Agenci:** szybkie przejście do profilu asystenta.
   - **Kanały:** bezpośredni skok do dyskusji projektowej.
   - **Wiadomości:** przeszukiwanie całej historii czatów.
   - **Pliki:** odnajdywanie dokumentów w bibliotece.
   - **Rutyny:** zaplanowane zadania cykliczne.
3. Nawigacja klawiaturą: strzałki góra/dół oraz `Enter`, lub skróty numeryczne od `1` do `9`.

### Polecenia w oknie wpisywania
1. **Znak `/` (Polecenia ukośnika):**
   - Wpisanie `/` na początku wiadomości otwiera menu szybkich akcji:
     - `/compact` – porządkuje i skraca dotychczasową rozmowę, aby zwolnić pamięć modelu przed długim zadaniem.
     - `/new-thread` – błyskawicznie otwiera czysty wątek z tym agentem.
     - `/side` – zadaje szybkie pytanie poboczne (odpowiedź pojawi się obok czatu i nie zaśmieci głównej historii).
     - Polecenia zainstalowanych umiejętności (skilli).
2. **Znak `@` (Wzmianki):**
   - Pozwala skierować uwagę agenta na konkretny plik, innego agenta lub wątek w kanale.

---

## 5. Narzędzia zaawansowane

### Sejf (Vault) i ochrona haseł
Agenci często muszą zalogować się do serwisów www, aby pobrać faktury, sprawdzić status zamówienia lub wdrożyć stronę:
1. **Bezpieczeństwo na pierwszym miejscu:**
   - Hasła i klucze są szyfrowane sprzętowym kluczem systemu Windows. Model AI nigdy nie ma wglądu w Twoje hasło w postaci czystego tekstu.
   - Wypełnianie logowania odbywa się bezpośrednio w zabezpieczonej przeglądarce programu.
2. **Konektory 1Password i Bitwarden:**
   - Możesz połączyć program ze swoim menedżerem haseł.
   - Wystarczy przenieść wybrane loginy do specjalnego folderu (np. „Shared with COSGRAL”) w 1Password/Bitwarden.
   - Agent ma dostęp tylko do tego, na co jawnie zezwolisz, a Ty w każdej chwili możesz cofnąć dostęp jednym kliknięciem.
3. **Kody dwuskładnikowe (2FA / TOTP):**
   - Sejf generuje 6-cyfrowe kody uwierzytelniania dwuskładnikowego na żywo z bezpiecznym odliczaniem czasu.

### Katalog aplikacji (Marketplace)
1. Zakładka **Aplikacje** w sekcji Marketplace zawiera katalog 251 sprawdzonych narzędzi (np. integracje z dokumentami, arkuszami, bazami SQL, narzędziami analitycznymi).
2. Instalacja narzędzia polega na kliknięciu przycisku **Instaluj** i podaniu ewentualnych danych dostępowych (zapisywanych w trybie wyłącznie-do-zapisu).
3. Żadna aplikacja ani wtyczka nie może zainstalować się sama – agent może jedynie zaproponować narzędzie, a decyzję podejmujesz Ty na karcie zgody.

### Dostęp z telefonu (Mobile Connect)
Możesz nadzorować pracę swoich agentów ze smartfona (iPhone lub Android) bez instalowania aplikacji ze sklepów:
1. Wejdź w programie w zakładkę **Phone**.
2. Zeskanuj wyświetlony kod QR aparatem w telefonie – otworzy się bezpieczna aplikacja webowa (PWA), którą możesz dodać do ekranu początkowego telefonu.
3. **Połączenie poza domem:**
   - Program obsługuje bezpieczną sieć Tailscale (nie musisz konfigurować publicznych adresów IP ani przekierowań portów).
4. **Ochrona kodem PIN:**
   - Możesz ustawić 4- lub 6-cyfrowy kod PIN na telefonie. Po 5 minutach bezczynności aplikacja wymaga podania PIN-u, a 5 błędnych prób natychmiast odcina urządzenie.
5. **Powiadomienia Web Push:**
   - Otrzymujesz powiadomienie na telefon tylko wtedy, gdy agent naprawdę potrzebuje Twojej decyzji (nowa karta „Needs you”).

### Most Telegrama
1. Jeśli wolisz otrzymywać powiadomienia lub wysyłać dyspozycje przez Telegram:
2. W ustawieniach mostu wklejasz token bota z BotFather.
3. Most działa wyłącznie w trybie bezpośrednim z Twojego komputera (long polling – nie wymaga zewnętrznego serwera).
4. Dostęp mają wyłącznie konta zdefiniowane na Twojej liście dozwolonych czatów – wiadomości od nieznajomych są bez słowa odrzucane.

---

## 6. Gdzie znajdują się Twoje dane i jak zrobić kopię zapasową

Wszystkie dane są uporządkowane i czytelne:

| Co zawiera | Lokalizacja na dysku |
|---|---|
| Bazy danych SQLite, historia rozmów, ustawienia, zaszyfrowany Sejf, konfiguracja telefonu i Telegrama | `%APPDATA%\COSGRAL Workspace\` (lub `COSGRAL Workspace Dev` w trybie uruchomienia z folderu) |
| Pliki robocze agentów, biblioteka dokumentów, pobrane pliki | `%USERPROFILE%\COSGRAL Workspace\` (foldery `Bots`, `Shared`, `Downloads`) |

- **Kopia zapasowa:** Wystarczy zamknąć program i skopiować powyższe foldery na dysk zewnętrzny.
- **Całkowite usunięcie:** Zamknięcie programu i skasowanie powyższych folderów usuwa 100% danych bez pozostawiania śladów.
