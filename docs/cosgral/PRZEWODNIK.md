# COSGRAL Workspace: Przewodnik użytkownika

Przewodnik dla właściciela projektu i użytkownika programu (bez żargonu programistycznego i bez nazw plików źródłowych).  
Opisuje rzeczywisty stan programu, sposób uruchomienia, codzienną pracę z agentami i zespołami oraz zaawansowane narzędzia.

**Stan na 17.11.2026 (integracja 79567cdf9).** Przy każdej funkcji piszę uczciwie, na jakim jest etapie. Używam czterech określeń:
- **Jest**: działa w oknie programu i było sprawdzone.
- **Częściowo**: działa część; brakującą część nazywam.
- **Silnik gotowy, ekran w przygotowaniu**: program już to potrafi „pod spodem” (jest sprawdzone testami), ale okna do klikania jeszcze nie ma. Dla każdej takiej funkcji podaję, co zobaczysz, gdy ekran powstanie.
- **Ekran gotowy, jeszcze nie oglądany w oknie**: ekran jest w programie i korzysta z działającego silnika, ale nikt nie sprawdził go jeszcze na prawdziwym oknie (zrzuty testowe w toku).

Pełne zestawienie z liczbami: `docs/cosgral/parytet-0.71.md`.

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
| **Sejf haseł** | **Jest** | Własny szyfrowany sejf w programie (hasła, karty, kontakty, klucze API, kody 2FA/TOTP). Agent wypełnia logowanie w przeglądarce programu, a hasła nie widzi ani w rozmowie, ani w wyniku narzędzia. Sprawdzone w oknie dla logowania; karty, kontakty i kody 2FA tylko testami. |
| **Sejf: 1Password, Bitwarden i Proton Pass** | **Ekran jest, jeszcze nie oglądany w oknie** | Panel „konektory” na stronie Biblioteka łączy program z Twoim menedżerem haseł i pokazuje agentom listę dozwolonych logowań (bez haseł). Wymaga zainstalowanego narzędzia menedżera. |
| **Katalog Marketplace: Agenci i Umiejętności** | **Jest** (mały katalog) | Katalog własny programu: kilka gotowych agentów i umiejętności z opisem. Umiejętność instalujesz wybranemu agentowi, a gotowy agent tworzy nowego agenta. Katalog jest mały (kilkanaście pozycji), nowy układ strony (wyróżnione, kategorie) czeka na ekran. |
| **Katalog Marketplace: Aplikacje** | **Częściowo** | Silnik instaluje wtyczki jako lokalne narzędzia (MCP). Dane katalogu 251 wtyczek leżą poza programem (licencja), więc bez ich dodania lista jest pusta. Logowanie do wtyczek przez przeglądarkę ma silnik, ale nie ma jeszcze przycisku. |
| **Przepływy pracy** | **Jest** (podstawy + wersje) | Rysujesz plan: wyzwalacz, kroki agenta, pytanie do Ciebie („Zezwól / Odmów”) i wiadomość do kanału. Każdy zapis tworzy wersję; w sekcji „Wersje” widzisz listę, co się zmieniło, i przywracasz starszą (powstaje nowa wersja, więc da się cofnąć). Kroki „Prompt” i „Condition (jeśli)” zna silnik; ich edytor w przygotowaniu. Obrazy i wideo: brak. |
| **Rutyny** | **Jest** | Agent robi zadanie o stałej porze (co N minut, codziennie, wg harmonogramu cron) albo na sygnał z zewnątrz (webhook). Zaplanowane i wykonane przebiegi widać na stronie „Harmonogram”. |
| **Biblioteka plików** | **Częściowo** | Nowy widok plików jest w programie: zakładki „Wszystkie / Wgrane / Od agentów / Z czatów”, szukanie, filtry, sortowanie, zaznaczanie wielu plików i sprzątanie starych. Jeszcze nie oglądany w oknie testowym. Brak: przeglądania folderów komputera i miniatur. |
| **Użycie** | **Ekran gotowy, jeszcze nie oglądany w oknie** | Raport za 7, 30, 90 i 365 dni: tokeny, tury, koszt zgłoszony przez dostawców, wykres dzienny, tabela agentów, podział wg modelu i rodzaju tokenów, obciążenie komputera i limity dostawców. Bez podziału na umiejętności. |
| **Harmonogram** | **Ekran gotowy, jeszcze nie oglądany w oknie** | Najbliższe dni z zaplanowanymi i wykonanymi przebiegami rutyn, rutyny z zewnątrz i wstrzymane osobno, lista ostatnich uruchomień. Bez siatki miesięcznego kalendarza. |
| **Wygląd: motyw i maskotki** | **Jest** | Ciemny (domyślny), jasny lub systemowy motyw; pływające zaokrąglone panele; 12 kształtów maskotek w 17 kolorach. Wygląd był oglądany na zrzutach testowych, poprawki po nich jeszcze nie. |
| **Dostęp z telefonu (Mobile Connect)** | **Jest** (przegląd jeszcze nie oglądany w oknie) | Parowanie telefonu kodem QR, dostęp w sieci domowej oraz poza domem przez Tailscale, blokada kodem PIN, powiadomienia Web Push. Strona pokazuje trasy (w użyciu / niedostępne z powodem) i każdy telefon z PIN-em, blokadą i powiadomieniami. Czat na telefonie działa; kanały czekają na rozszerzenie. Stały link do parowania i połączenie przez chmurę celowo nie istnieją. |
| **Komunikatory: Telegram i Slack** | **Ekran jest, jeszcze nie oglądany w oknie** | Most z botem Telegrama i ze Slackiem (tylko rozmowy prywatne), działa na Twoim komputerze bez serwera pośredniczącego. Panel „Komunikatory” (strona Biblioteka) przyjmuje tokeny tylko do zapisu i pokazuje listę dopuszczonych rozmów. Discord wstrzymany, WhatsApp poza planem. |
| **Computer Use (sterowanie komputerem)** | **Częściowo** | Agent potrafi klikać, pisać i robić zrzuty ekranu na Windows, zawsze po Twojej zgodzie. Ekran uprawnień i sterowanie prawdziwym pulpitem w oknie nie były jeszcze sprawdzone. |
| **Zdalny pulpit między komputerami** | **Jest** (obraz i sterowanie nie sprawdzone w oknie) | Drugi komputer może oglądać i sterować Twoim pulpitem po wpisaniu adresu i tokenu, ale za każdym razem pytamy Cię o zgodę. Panel „Who may come in” pokazuje stan, sesje i przełącznik „Ask on this computer every time”. Jedna sesja naraz. Tryb bez nadzoru nie istnieje. |
| **Głos i mowa** | **Jest** (nagrywanie nie sprawdzone w oknie) | Czytanie odpowiedzi na głos (głosy Windows) i zamiana mowy na tekst modelem Whisper na Twoim komputerze, bez wysyłania dźwięku do sieci. Dział „Voice” w ustawieniach pokazuje uprawnienie mikrofonu i listę tego, czego nie ma, z powodem. Nie ma trybu rozmowy na żywo ani lepszych modeli. |
| **Przenoszenie agentów (Import i Transfer)** | **Ekran jest, jeszcze nie oglądany w oknie** | Zapis wybranych agentów do pliku .zip i wczytanie ich na innym komputerze, z podglądem przed importem. Działy „Import” i „Transfer” w ustawieniach serwera. |
| **Ustawienia serwera (14 sekcji)** | **Częściowo** | Jedna strona z 14 działami (ogólne, osobowość, agenci, sejf, członkowie, zdalny pulpit, MCP, pamięć masowa, strony, dostawcy, import, transfer, rutyny, profile przeglądarki). Działy „Członkowie” i „Strony” mówią, że ich nie ma. |
| **Aktualizacje programu** | **Ekran jest, jeszcze nie oglądany w oknie** | Tor „Stabilny / Podgląd”, pobieranie i instalacja przy zamknięciu, „Zrestartuj, gdy będę bezczynny”. Dział „Updates” w oknie ustawień. |
| **Cofnij usunięcie wątku** | **Ekran jest, jeszcze nie oglądany w oknie** | Usunięty wątek jest ukryty przez 10 minut: nad listą wątków widać wiersz „Usunięto …” z odliczaniem i przyciskiem „Cofnij”. Po 10 minutach znika na stałe. |
| **Podagenci** | **Ekran jest, jeszcze nie oglądany w oknie** | Agent może uruchomić krótkich pomocników (do 3 naraz w wątku). W panelu wątków widzisz każdego: zadanie, stan, na bieżąco to, co napisał, i jego odpowiedź. Możesz go zatrzymać. Jego pytania trafiają jako karty do „Needs you”. |
| **Integracje kont: GitHub, Google, Notion, Meta** | **Ekran jest, jeszcze nie oglądany w oknie** | Panel „Connect accounts” na stronie Biblioteka. Najpierw rejestrujesz aplikację w usłudze i wpisujesz jej identyfikator; potem „Connect account” otwiera przeglądarkę. Logowanie jest zaszyfrowane na tym komputerze, agenci go nie widzą. Wymaga Twojej własnej aplikacji w usłudze. |

---

## 2. Jak uruchomić program

Program oferuje 3 wygodne tryby działania dostosowane do Twoich potrzeb:

### Sposób A: Codzienna praca na Twoim komputerze (Zalecany)
0. **Raz, zanim zaczniesz:** zainstaluj Bun i w folderze programu wykonaj `bun install` (Wiersz polecenia otwierasz wpisując `cmd` w pasku adresu Eksploratora). Bez tego `start-cosgral.cmd` zatrzyma się z komunikatem po angielsku („The program is not installed yet” albo „Bun was not found”) i nic się nie uruchomi.
1. W folderze programu kliknij dwukrotnie plik:  
   `start-cosgral.cmd`
2. Przy pierwszym uruchomieniu skrypt sam zbuduje program (czasu **nie mierzyłem**; dalsze starty są szybsze). Po zmianach w kodzie użyj `start-cosgral.cmd --rebuild`.
3. Otworzy się okno powitalne z wyborem dostawcy sztucznej inteligencji.
4. Twoje dane i agenci zapisują się bezpiecznie w Twoim profilu użytkownika Windows.

### Sposób B: Bezpieczna piaskownica (Do testów)
Jeśli chcesz przetestować aplikację bez używania prawdziwego konta, bez pobierania modeli i bez dotykania Twoich prawdziwych plików:
1. Kliknij dwukrotnie plik:  
   `start-cosgral-sandbox.cmd`
2. Program uruchomi się z wirtualnym, odizolowanym profilem i demonstracyjną sztuczną inteligencją, która symuluje odpowiedzi.
3. Dane piaskownicy leżą w `%LOCALAPPDATA%COSGRAL-Sandbox`, osobno od Twojego profilu programu. Reset do zera: dwuklik **nie przekaże** parametru, więc otwórz Wiersz polecenia w folderze programu i wpisz `start-cosgral-sandbox.cmd --reset`.

### Sposób C: Tradycyjna instalacja Windows
1. Możesz zbudować samodzielny instalator Windows (`.exe` w podfolderze `dist`).
2. Instalator nie jest podpisany cyfrowo, więc Windows pokaże ostrzeżenie SmartScreen („Windows ochronił Twój komputer”): kliknij „Więcej informacji”, potem „Uruchom mimo to”. To oczekiwane, dopóki nie kupimy certyfikatu.
3. Po instalacji program pojawia się w menu Start jak zwykła aplikacja Windows.
4. Nie ingeruje w instalacje innych programów i ma własną, w pełni odizolowaną bazę danych.

---

## 3. Pierwsze kroki: Konfiguracja dostawcy sztucznej inteligencji

Gdy otworzysz program po raz pierwszy, zobaczysz ekran wstępnej konfiguracji („Set up this computer”):

1. **Wybór dostawcy:**
   - **Codex (ChatGPT):** jeśli posiadasz subskrypcję ChatGPT Plus lub Pro. Program wykrywa narzędzie automatycznie. Klikasz zaloguj, potwierdzasz logowanie w przeglądarce i jesteś gotowy do pracy.
   - **Claude:** jeśli korzystasz z konta Anthropic / Claude.
   - **Klucz API:** jeśli wolisz rozliczać się za rzeczywiste zużycie tokenów, możesz wkleić swój klucz API bezpośrednio w ustawieniach dostawców.
   - **Lokalne modele (np. Ollama, LM Studio):** możesz podać adres lokalnego serwera modeli i pracować całkowicie bez dostępu do internetu.
2. **Wybór języka:**
   - Wybierz język Polski lub Angielski. Zmiana działa od razu, ale **nie każdy ekran jest już przetłumaczony**: część napisów (m.in. fragmenty ekranu kanału i hostowania) zostaje po angielsku, trwa ich tłumaczenie.
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
   - **Usunięcie wątku można cofnąć przez 10 minut:** nad listą wątków pojawia się wiersz „Usunięto …” z odliczaniem i przyciskiem „Cofnij”. Po odświeżeniu programu wiersz wraca, dopóki czas nie minie.
3. **Prywatna pamięć agenta:**
   - W ustawieniach agenta możesz przejrzeć jego notatki.
   - Pamięć kluczowa („essential”) zawiera najważniejsze zasady (np. preferencje formatowania dokumentów), które agent pamięta zawsze.
   - Pamięć przeszukiwana („searchable”) to baza wiedzy, z której agent korzysta tylko wtedy, gdy zadasz powiązane pytanie.
4. **Zarządzanie agentami na liście:**
   - Możesz tworzyć foldery (do 5 poziomów zagłębienia) i układać w nich agentów.
   - Opcja **Duplikuj** pozwala sklonować konfigurację agenta bez kopiowania jego historii rozmów.
   - Opcja **Ukryj** pozwala schować rzadziej używanych asystentów z widoku głównego.
   - **Zmiana nazwy agenta:** kliknij tytuł rozmowy → ustawienia agenta → pole „Agent name” (nazwa agenta); zmiana jest od razu widoczna na liście i w nagłówku. Szybsza droga: prawy klik na agencie na pasku bocznym → „Rename” (zmiana nazwy w miejscu na wierszu, Enter zapisuje).

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
2. **Konektory 1Password, Bitwarden i Proton Pass** (panel na stronie Biblioteka):
   - Program umie korzystać z Twojego menedżera haseł, ale nie kopiuje całego sejfu. Wskazujesz jeden specjalny folder lub magazyn (np. „Shared with COSGRAL”) i tylko logowania z niego są dla agentów widoczne.
   - Wymaga to zainstalowanego narzędzia menedżera (u 1Password to `op`, u Bitwardena `bw`). Gdy go brakuje, program powie, którego narzędzia nie znalazł, i poda stronę pobierania.
   - Dla każdego menedżera widzisz: stan połączenia, listę dozwolonych logowań (tytuł i strona, bez haseł) oraz przycisk rozłączenia.
   - Sejf nigdy nie pokazuje wartości ponownie: hasło można wpisać i zapisać, ale nie można go „podejrzeć”. To celowe.
3. **Kody dwuskładnikowe (2FA / TOTP):**
   - Sejf generuje 6-cyfrowe kody uwierzytelniania dwuskładnikowego na żywo z bezpiecznym odliczaniem czasu.

### Katalog (Marketplace): Agenci, Umiejętności i Aplikacje
Marketplace ma trzy zakładki.
1. **Agenci** i **Umiejętności** (jest):
   - To własny katalog programu, kilkanaście pozycji z opisem.
   - **Umiejętność** instalujesz jednemu, wybranemu agentowi. Jeśli w katalogu jest nowsza wersja, przycisk zmienia się na „Aktualizuj”. Umiejętność, którą sam zrobiłeś pod tą samą nazwą, nie zostanie nadpisana.
   - **Gotowy agent** tworzy nowego agenta z jego instrukcjami i umiejętnościami. Możesz go dodać kilka razy (każdy raz powstaje nowa kopia).
   - Żadna pozycja nie instaluje się sama. Agent może tylko ją zaproponować, a Ty zatwierdzasz na karcie.
   - Nie ma instalacji z linku GitHub ani katalogu publicznego (program nie ściąga kodu z internetu bez przeglądu).
2. **Aplikacje** (częściowo): to wtyczki, które program uruchamia jako lokalne narzędzia dla agentów. Lista pochodzi z katalogu, który trzeba dodać osobno (zawiera 251 pozycji), więc bez niego zakładka jest pusta. Instalacja wtyczki wymagającej logowania w przeglądarce ma gotowy silnik, ale przycisku jeszcze nie ma.
3. Nowy układ zakładek (rząd „Wyróżnione”, działy, filtr) jest gotowy jako opis i dane pokazowe; strona jeszcze z niego nie korzysta.

### Dostęp z telefonu (Mobile Connect)
Możesz nadzorować pracę swoich agentów ze smartfona (iPhone lub Android) bez instalowania aplikacji ze sklepów:
1. Wejdź w programie w zakładkę **Phone**.
2. Zeskanuj wyświetlony kod QR aparatem w telefonie – otworzy się bezpieczna aplikacja webowa (PWA), którą możesz dodać do ekranu początkowego telefonu.
3. **Połączenie poza domem:**
   - Program obsługuje bezpieczną sieć Tailscale (nie musisz konfigurować publicznych adresów IP ani przekierowań portów).
   - Trasa jest wybierana przy dodawaniu telefonu: „tylko ten komputer” albo „sieć lokalna (+ Tailscale)”. Lista telefonów pokazuje każdy sparowany telefon, jego blokadę PIN i ostatni adres.
   - Celowo **nie ma** stałego linku do parowania (wpuściłby każdego, kto go znajdzie) ani połączenia przez chmurę (rozmowy szłyby przez cudzy serwer). Sparowany telefon zostaje sparowany, dopóki go nie usuniesz, więc nie trzeba parować od nowa.
4. **Ochrona kodem PIN:**
   - Możesz ustawić 4- lub 6-cyfrowy kod PIN na telefonie. Aplikacja wymaga podania PIN-u po 5 minutach bezczynności i od razu, gdy strona schodzi w tło, a 5 błędnych prób natychmiast odcina urządzenie.
5. **Powiadomienia Web Push:**
   - Otrzymujesz powiadomienie na telefon tylko wtedy, gdy agent naprawdę potrzebuje Twojej decyzji (nowa karta „Needs you”).
   - Na stronie Phone przełącznik „Send notifications to phones” włącza je na tym komputerze (domyślnie wyłączone). Przy telefonie, który zezwolił na powiadomienia, jest przycisk „Send a test notification”; ekran mówi, czy poszło, a jeśli nie, dlaczego.
6. **Instrukcja Tailscale** jest na tej samej stronie, rozwijana: sześć kroków i trzy uwagi (np. że rozmowa idzie między Twoimi urządzeniami, nie przez cudzy serwer).

### Komunikatory: Telegram i Slack
Możesz rozmawiać z agentem z aplikacji, której używasz na co dzień. Działa to tylko w rozmowach prywatnych (jeden do jednego), nigdy w grupach i kanałach.
1. **Telegram:**
   - Zakładasz bota w rozmowie z BotFather i wklejasz jego token w ustawieniach.
   - Piszesz do bota jedną wiadomość: jej autor pojawia się na liście „napisali”, a Ty go dopuszczasz i wskazujesz agenta, który ma odpowiadać.
   - Most działa bezpośrednio z Twojego komputera i nie wymaga serwera pośredniczącego.
2. **Slack:**
   - Tworzysz aplikację Slack z włączonym Socket Mode i wklejasz dwa tokeny (bota i aplikacji).
   - Dalej tak samo jak w Telegramie: piszesz do bota wiadomość prywatną, dopuszczasz rozmowę, wskazujesz agenta. Kanały Slacka są zablokowane.
3. **Bezpieczeństwo:**
   - Domyślnie nie jest dopuszczony nikt. Wiadomości od nieznajomych są po cichu odrzucane.
   - Tokeny wpisujesz raz i nigdy nie są ponownie pokazywane (ani w oknie, ani agentom).
   - Błędy połączenia pokazują krótkie, stałe zdania, bez surowych komunikatów usługi.
4. Na stronie Biblioteka (panel „Komunikatory”) widzisz dla każdego komunikatora: stan („połączony”, „wymaga tokenu”, „błąd”), pola na tokeny tylko do zapisu, listę dopuszczonych rozmów i listę nieznanych, które napisały (bez ich treści; „Allow” wypełnia formularz). Discord jest wstrzymany, WhatsApp nie jest planowany.

### Podagenci
1. **Podagent** to krótki pomocnik, którego uruchamia agent do jednego zadania (np. „sprawdź te liczby”). Ty go nie uruchamiasz, ale go widzisz i możesz zatrzymać.
2. W panelu wątków (nad rozmową) jest rozwijana sekcja „Subagents: pracuje X z Y”. Każdy podagent ma: nazwę, zadanie, stan (pracuje, czeka na Ciebie, gotowy, nie udało się, zatrzymany), fragment tego, co pisze, i odpowiedź po zakończeniu.
3. Gdy podagent czegoś potrzebuje (pytanie, zgoda), ekran mówi: „odpowiedz na karcie w Needs you”. Karta jest przy wątku agenta, który go uruchomił.
4. W jednym wątku pracują naraz co najwyżej 3 podagenci; podagent nie uruchamia kolejnych. Przycisk „Stop” kończy go od razu.
5. Gdy w wątku nie ma podagentów, sekcja się nie pokazuje.

### Integracje kont: GitHub, Google, Notion, Meta
1. Panel „Connect accounts” (strona Biblioteka, pod Komunikatorami) pozwala agentom używać Twojego konta w tych czterech usługach. Każda usługa to osobny serwer MCP, który włączasz agentowi tak samo jak inne.
2. **Najpierw Ty:** w usłudze rejestrujesz własną aplikację (kroki są pod „Set up the app”) i dodajesz do niej pokazany adres zwrotny. Wpisujesz identyfikator klienta, a tam, gdzie usługa wymaga, także sekret. Sekret jest tylko do zapisu: po wysłaniu pole się czyści i nigdy nie wraca.
3. „Connect account” otwiera przeglądarkę na stronie usługi. Program czeka 5 minut. Jeśli przeglądarka się nie otworzy, ekran pokazuje adres do otwarcia ręcznie.
4. Stany: aplikacja nieskonfigurowana, niepołączone, czeka na przeglądarkę, połączone, logowanie nie powiodło się (z powodem), zaloguj ponownie (usługa przestała przyjmować zapisane logowanie).
5. „Disconnect” usuwa wpis serwera MCP i zapisane logowanie. Przełącznik obok może usunąć też identyfikator klienta.
6. Agent nigdy nie prosi o hasło ani kod w rozmowie.

### Przepływy pracy i rutyny
1. **Przepływ** to plan na płótnie: najpierw **wyzwalacz** (Ty naciskasz „Uruchom” albo robi to rutyna), potem **kroki**: agent wykonuje polecenie, **zgoda** pokazuje Ci kartę „Zezwól / Odmów” w sekcji „Needs you”, a **wyjście** wysyła wiadomość do kanału. Tekst kroku może użyć wyniku poprzedniego kroku.
2. Przepływ działa po jednym naraz. Gdy zamkniesz program w trakcie, ten przebieg kończy się jako nieudany, a karty zgody znikają.
3. **Wersje:** każdy zapis przepływu to nowa wersja. W sekcji „Wersje” widzisz numer, czas, powód (utworzona, zmieniona, przywrócona z wersji N) i zdanie „w porównaniu z bieżącą”. „Przywróć tę wersję” tworzy nową wersję, więc przywrócenie też można cofnąć.
   - Czego nie ma: edytora kroków „Prompt” i „jeśli” (silnik je zna, ekran w przygotowaniu), kroków obrazu i wideo oraz rysowania odręcznego na płótnie.
4. **Rutyna** to zadanie dla jednego agenta: co N minut, codziennie o godzinie albo według harmonogramu cron; albo po sygnale z zewnątrz (webhook, podpisany). Sekret webhooka widzisz tylko raz. Gdy program jest wyłączony, rutyny nie nadrabiają zaległości; w historii zostaje wpis „pominięto”.
5. Zaplanowane i wykonane przebiegi rutyn pokazuje strona „Harmonogram” (opis niżej).

### Głos
1. **Czytanie na głos:** głosy Windows, tempo od 0,5 do 2 razy, własny skrót klawiszowy.
2. **Dyktowanie:** zamiana mowy na tekst modelem Whisper na Twoim komputerze (trzy rozmiary: najmniejszy jest najszybszy). Pobranie modelu zawsze wymaga Twojej zgody na karcie, a dźwięk nigdy nie opuszcza komputera.
3. **Mikrofon:** dział „Voice” w ustawieniach pokazuje, czy system pozwala programowi nagrywać (dozwolony, zablokowany, jeszcze nie pytano, zabroniony na tym komputerze), i przyciskiem otwiera ustawienia prywatności Windows.
4. Czego nie ma (program mówi to wprost, z powodem): lepszy model dyktowania „Parakeet”, dyktowanie w chmurze (wysyłałoby Twój głos), neuronowe czytanie na głos i rozmowa głosowa na żywo. Ta lista jest widoczna w dziale „Voice”. Ekran nie był jeszcze oglądany w oknie.

### Zdalny pulpit
1. Jeden komputer z Windows pokazuje swój pulpit drugiemu. W ustawieniach włączasz „gospodarza”; widzisz adres i **token** (pokazany tylko raz).
2. Drugi komputer podaje adres, token i tryb (tylko podgląd lub podgląd ze sterowaniem).
3. **Zgoda:** za każdym razem, gdy ktoś nowy się łączy, dostajesz kartę w „Needs you” (masz 60 sekund, potem odmowa). Dla znanego komputera możesz ustawić „zawsze zezwalaj” albo „zawsze blokuj”. Przełącznik „Pytaj na tym komputerze” sprawia, że pytanie wraca przy każdej sesji, nawet dla zezwolonego.
4. Jedna sesja naraz. Przycisk „Zatrzymaj” kończy sesję od razu. Nie ma trybu bez nadzoru (zawsze ktoś musi być przy komputerze).
5. Obrazu i sterowania nie sprawdzono jeszcze w oknie programu (testy kodu przechodzą).

### Przenoszenie agentów: Import i Transfer
1. **Transfer** to trzy kroki: (1) na starym komputerze wybierasz agentów i zapisujesz plik .zip, (2) kopiujesz plik na nowy komputer, (3) na nowym komputerze go wczytujesz.
2. **Import** pokazuje najpierw podgląd pliku: kogo zawiera, ile skilli, wspomnień i rutyn. Nic się nie zmienia, dopóki nie potwierdzisz.
3. Bezpieczeństwo: wczytani agenci są zawsze **nowi** (istniejący nie są nadpisywane; gdy imię jest zajęte, dostaje dopisek „(imported 2)”). Rutyny z pliku wracają **wstrzymane**, żebyś je sam włączył.
4. **Czego plik nigdy nie przenosi:** kluczy API, logowań i tokenów konektorów, zawartości Sejfu, wartości zmiennych MCP, historii rozmów, plików Biblioteki ani ustawień programu.
5. Import z Hermesa nie jest obsługiwany (program mówi to wprost).

### Ustawienia serwera
Jedna strona z 14 działami: ogólne, osobowość, agenci, sejf, członkowie, zdalny pulpit, MCP, pamięć masowa, strony, dostawcy, import, transfer, rutyny, profile przeglądarki. Większość działów pokazuje dane z miejsc opisanych wyżej. **Członkowie** i **Strony** mówią wprost, że w tej wersji ich nie ma (program działa na jednym komputerze, bez hostingu stron).

### Aktualizacje programu
Wybierasz tor **Stabilny** albo **Podgląd** (wersje przedpremierowe), czy program ma sam sprawdzać, pobierać i instalować przy zamknięciu, oraz przycisk **„Zrestartuj, gdy będę bezczynny”**: program czeka, aż żaden agent nie pracuje, i dopiero wtedy się restartuje. Dział „Updates” w oknie ustawień pokazuje wersję i stan. Aktualizacje działają tylko w zainstalowanej wersji, nie w trybie uruchamiania z folderu (wtedy ekran mówi dlaczego).

### Biblioteka plików
Biblioteka zbiera pliki, które wgrałeś, które zapisali agenci i które przyszły w czatach.
1. **Widok plików:** zakładki „Wszystkie / Wgrane / Od agentów / Z czatów” z liczbą plików, szukanie po nazwie, filtr rodzaju (obraz, dokument, inne), filtr agenta i sortowanie (najnowsze, najstarsze, nazwa, rozmiar). Przy pliku: otwórz, pokaż w folderze.
2. **Zaznaczanie wielu plików** i usuwanie naraz (do 200). Załączniki z czatów są chronione: zostają przy wiadomości, a program mówi, że je pominął.
3. **Sprzątanie starych plików:** wybierasz rodzaj (wgrane albo od agentów) i liczbę dni; najpierw widzisz, ile plików i miejsca zniknie, dopiero potem potwierdzasz.
4. Czego nie ma: przeglądania folderów całego komputera („pliki maszyny”) i miniatur; lista pokazuje jedną stronę 60 plików. Ile miejsca zajmują dane, pokazuje dział „Pamięć masowa” w ustawieniach serwera.
5. Widok jest nowy i nie był jeszcze oglądany w oknie testowym.

### Użycie
1. Na stronie „Użycie” wybierasz okres: 7, 30, 90 albo 365 dni.
2. Widzisz: ile tokenów (kawałków tekstu liczonych przez dostawcę modelu) i tur, ile dolarów zgłosili dostawcy (ze znakiem „≥”, gdy suma jest niepełna), wykres słupkowy dzień po dniu, tabelę „który agent zużył ile” oraz dwa pierścienie obciążenia komputera (procesor i pamięć). Niżej zostaje lista limitów dostawców z czasem resetu.
3. Podział na **model** i na rodzaj tokenów (wejście, z pamięci podręcznej, wyjście, rozumowanie) pokaże się tylko dla tur od dnia wdrożenia tej funkcji; ekran mówi, jaki procent okresu ma taki podział, i od kiedy liczy.
4. Czego nie ma (ekran mówi to wprost, z powodem): podziału na umiejętności.

### Harmonogram
1. Strona pokazuje najbliższe 7, 14 albo 30 dni pogrupowane po dniach: godzina, rutyna i status (zaplanowane, w toku, zakończone, nie udało się, pominięte, zignorowane). Zaplanowane starty liczone są tymi samymi zasadami co rutyny.
2. Rutyny uruchamiane z zewnątrz (webhook) i wstrzymane są wypisane osobno, bo nie mają stałych godzin.
3. „Ostatnie uruchomienia” to lista przebiegów wszystkich rutyn, od najnowszych. Gdy lista jest ucięta, ekran o tym mówi.
4. Czego nie ma: siatki miesięcznego kalendarza, notatki przy przebiegu i otwierania rutyny z wpisu.
5. Ekran jest nowy i nie był jeszcze oglądany w oknie testowym.

### Wygląd
1. **Motyw:** domyślnie ciemny; w ustawieniach (Wygląd) możesz wybrać jasny albo systemowy. Wybór jest zapamiętywany po restarcie.
2. **Układ:** pasek boczny i główny panel to pływające, zaokrąglone karty na ciemnej ramce okna. Czcionka Inter jest wbudowana w program (działa bez internetu).
3. **Maskotki agentów:** 12 kształtów w 17 kolorach; kształt zależy od „ziarna” awatara (ten sam agent ma zawsze ten sam kształt), kolor wybierasz w kreatorze. Nowo dodane dwa kształty („duch” i „kwiat”) nie były jeszcze oglądane w oknie.
4. **Ruch:** zakładki wątków, karta narzędzi i zwijanie paska bocznego mają krótkie animacje. Gdy system ma włączone ograniczanie ruchu, animacje są wyłączone.
5. Wygląd był sprawdzany na zrzutach testowych (17.11); poprawki po tych zrzutach nie były jeszcze oglądane w oknie.

---

## 5a. Jak zobaczyć każdy nowy ekran (kliknij po kolei)

**Skąd zaczynasz:** po lewej jest pionowy pasek stron: Agenci, Harmonogram, Zadania, Przepływy, Zużycie, Biblioteka, Katalog dodatków, Zdalny pulpit, Dostawcy, Telefon, Ustawienia serwera. Gdy okno jest wąskie, część pozycji chowa się pod przyciskiem „More pages” (więcej stron). Na dole paska jest **zębatka „Ustawienia”**: to okno ustawień programu, z menu po lewej (General, Appearance, Voice, Updates…).

W wersji angielskiej napisy są po angielsku (Agents, Schedule, Tasks…). Nazwy w nawiasach poniżej to nazwy z polskiego interfejsu.

| Ekran | Gdzie kliknąć | Co zobaczysz | Czego potrzeba |
|---|---|---|---|
| **Aktualizacje** | Zębatka na pasku stron → ekran „Settings”, przewiń do sekcji **Updates** (po „Application settings” i „Theme”) | Wersja i stan, tor Stabilny/Podgląd, „Check for updates”, automatyczne sprawdzanie, „Restart when idle” | Nic. W programie uruchomionym z folderu ekran mówi, że aktualizacje tu nie działają |
| **Głos** | Zębatka → ekran „Settings”, przewiń do sekcji **Voice** (pod Updates) | Uprawnienie mikrofonu z przyciskiem do ustawień Windows, ustawienia czytania i dyktowania, lista „niedostępne w tej wersji” | Nic. Pobranie modelu dyktowania pyta o zgodę |
| **Motyw** (ciemny / jasny / systemowy) | Zębatka → „Settings” → sekcja **Appearance**, lista „Theme” | Zmiana działa od razu i zapisuje się sama | Nic |
| **Zachowanie programu** | Zębatka → „Settings” → sekcja **App behavior** | Cztery ustawienia: „Launch COSGRAL Workspace at login” (start z Windowsem), „Keep … running in the background” (zamknięcie okna chowa program do ikony przy zegarze, zadania trwają; „Otwórz” / „Zakończ” w menu ikony), „Restore the last workspace on launch” (po starcie wraca ta sama strona i agent; **wątek jeszcze nie wraca**), „Open external links in” (domyślna przeglądarka albo przeglądarka programu) | Nic. Do sprawdzenia „w prawdziwym życiu” potrzebny restart programu lub Windowsa; nie były jeszcze oglądane w oknie |
| **Ustawienia kontekstu** („Context settings”) | Zębatka → „Settings” (pod „Appearance”) | Kiedy program sam skraca długą rozmowę | Nic |
| **Budżety** (limity zużycia całej przestrzeni) | Zębatka → „Settings” (pod „Context settings”) | Limity i bieżące zużycie, eksport CSV; budżety pojedynczego agenta są w jego ustawieniach | Nic |
| **Czyszczenie historii kanału** | **Agenci** → kanał → „Channel history” → „Clear history” | Pytanie „Wyczyścić całą historię?”, po „Yes, clear” znikają wiadomości i zadania; kanał, członkowie, pamięć i rutyny zostają. Odmowa, gdy zadanie trwa: „Stop or archive it first.” | Kanał; nieodwracalne |
| **Presety dostawców z chmury** | **Dostawcy** (Providers) → sekcja „Own model endpoints” → rząd „Use …” | Przyciski wypełniają formularz adresem dostawcy (OpenRouter, xAI, DeepSeek, Mistral, Groq, Together AI, Moonshot; OpenRouter i xAI oznaczone jako niezweryfikowane); nic się nie łączy, dopóki nie zapiszesz klucza API | Własny klucz API dostawcy (klucza nigdy nie widać po zapisaniu) |
| **Zmiana nazwy agenta** | Prawy klik na agencie → „Rename”, albo tytuł rozmowy → ustawienia agenta → „Agent name” | Nowa nazwa jest od razu na pasku bocznym i w nagłówku rozmowy | Co najmniej jeden agent |
| **Komunikatory** (Telegram, Slack) | **Biblioteka** → sekcja „Komunikatory” (Messengers) | Karty ze stanem, pola na tokeny, lista dopuszczonych rozmów | Do prawdziwego połączenia: token bota Telegrama lub dwa tokeny Slacka |
| **Integracje kont** (GitHub, Google, Notion, Meta) | **Biblioteka** → sekcja „Połącz konta” (Connect accounts, pod komunikatorami) | Cztery karty, kroki rejestracji aplikacji, pola na identyfikator i sekret | Do połączenia: własna aplikacja zarejestrowana w usłudze |
| **Logowanie do serwerów MCP** | **Biblioteka** → lista serwerów MCP, pod nią „Logowanie do serwerów MCP” | Karta na serwer wymagający logowania w przeglądarce | Serwer MCP działający przez sieć (bez niego ekran mówi, że nic nie wymaga logowania) |
| **Konektory Sejfu** (1Password, Bitwarden, Proton Pass) | **Biblioteka** → sekcja „Menedżery haseł” (Password managers), pod Sejfem | Stan połączenia i lista dozwolonych logowań (bez haseł) | Zainstalowane narzędzie menedżera (`op`, `bw`) |
| **Import i Transfer** | **Ustawienia serwera** → menu sekcji → **Import** albo **Przeniesienie** (Transfer) | Trzy kroki, wybór agentów do zapisu w .zip, podgląd przed wczytaniem | Do importu: plik .zip z innego komputera |
| **Telefon (Mobile Connect)** | **Telefon** (Phone) | Pod kartami: „How phones reach this computer”, „Your phones” z PIN-em i powiadomieniami, przełącznik powiadomień, instrukcja Tailscale | Do listy telefonów: sparowany telefon |
| **Zdalny pulpit** | **Zdalny pulpit** | Na górze „Who may come in”: plakietka, sesje, przełącznik „Ask on this computer every time”, „Unattended access: niedostępne” | Nic do oglądania; do prawdziwej sesji drugi komputer |
| **Podagenci** | **Agenci** → wybierz agenta → nad rozmową rozwiń „Threads: …” | Sekcja „Subagents: pracuje X z Y” z zadaniami, podglądem i przyciskiem „Stop” | Pokazuje się tylko, gdy agent sam uruchomił podagenta |
| **Cofnij usunięcie wątku** | **Agenci** → wybierz agenta → „Threads: …” → usuń wątek | Wiersz „Usunięto …” z odliczaniem 10 minut i przyciskiem „Cofnij” | Co najmniej dwa wątki (jeden zostaje) |
| **Karty agenta** (siatka kafli) | **Agenci** → wybierz agenta → kliknij tytuł rozmowy („View agent settings”) → panel „Settings”, sekcja „Karty agenta” (Agent cards) na samej górze | Do 14 kafli z ikoną, nazwą, jednym zdaniem i licznikiem (kolor rozmowy, instrukcje, pamięć, umiejętności, pliki, tabele, rutyny, użycie, publikacja, uprawnienia, zaawansowane, foldery, powiadomienia, modele zapasowe). Niedostępne kafle są przygaszone i mówią, dlaczego | Nic |
| **Szczegóły karty agenta** | Ten sam panel → kliknij kafel, który nie jest przygaszony | Pod siatką otwiera się panel szczegółów. Pliki: lista z rozmiarem i datą. Foldery: roboczy, dostęp, dodatkowe, wykluczone. Użycie: tokeny, tury, koszt, budżet. Publikacja: „Zapisz jako szablon” / „Usuń szablon” i licznik szablonów. Zaawansowane: sesja i liczba wiadomości. Powiadomienia: poziom i wyciszenie. „Zamknij” zamyka panel | Nic. Zapis szablonu zmienia dane, więc na próbie użyj agenta testowego |
| **Dostawcy: agenci ACP i modele zapasowe** | **Dostawcy** (Providers) → sekcje „Agenci ACP”, „Agenci na modelu zapasowym”, „Ostatnie przełączenia”, „Ustawienia zapasowe agenta” | Dodawanie i usuwanie agenta ACP (z potwierdzeniem), kolejność modeli zapasowych, lista przełączeń. Napisy po polsku, gdy język programu to Polski | Nic do oglądania; agent ACP wymaga programu na tym komputerze |
| **Rutyny kanału** | **Agenci** → kanał w pasku bocznym → u góry rozwiń „Routines” | Lista rutyn kanału (harmonogram, następny start, ostatni start, stan Active/Paused), „Run now”, Wstrzymaj/Wznów, Historia (czas, wg planu albo ręcznie, stan zadania lidera, powód pominięcia), Usuń z potwierdzeniem; pod listą formularz „Nowa rutyna kanału” (nazwa, co ma zrobić lider, co N minut / codziennie / cron, strefa czasu) | Kanał z liderem (bez lidera program mówi o tym zdaniem po angielsku). Rutyny działają tylko, gdy program jest włączony; ominiętych startów nie nadrabia |
| **Zadania** | **Zadania** (Tasks) | Lista zadań z kanałów; kliknij wiersz, żeby zobaczyć szczegóły (kroki, „Otwórz jako czat”) | Zadania z kanałów |
| **Zużycie** | **Zużycie** (Usage) | Okres 7/30/90/365 dni, tokeny, tury, wykres dzienny, tabela agentów, obciążenie komputera | Rozmowy z agentami (bez nich puste wykresy) |
| **Harmonogram** | **Harmonogram** (Schedule) | Najbliższe dni z rutynami, rutyny z zewnątrz osobno, ostatnie uruchomienia | Rutyny |
| **Wersje przepływu** | **Przepływy** (Workflows) → wybierz przepływ → sekcja „Versions” | Lista wersji, „w porównaniu z bieżącą”, „Przywróć tę wersję” | Zapisany przepływ |
| **Katalog dodatków** (Marketplace) | **Katalog dodatków** → zakładki Agents / Skills | Szukanie, kategorie, „Polecane”, karty z przyciskiem instalacji | Nic; instalacja zawsze prosi o Twoją zgodę |

**Gdy ekranu nie widać:**
1. Sprawdź, czy okno nie jest wąskie: pozycje paska mogą być pod „More pages”.
2. Sekcje Biblioteki są jedna pod drugą; przewiń stronę w dół.
3. Panel pokazuje się dopiero wtedy, gdy program ma dane: podagenci i „Cofnij” znikają, gdy nic do pokazania; konektory i komunikatory potrzebują tokenów.
4. Karty agenta i ich szczegóły są w panelu „Settings” agenta, nie na pasku stron po lewej.
5. Żaden z tych ekranów nie był jeszcze oglądany w prawdziwym oknie przez człowieka. Jeśli któryś wygląda źle, zrób zrzut i napisz, który to ekran.

---

## 6. Gdzie znajdują się Twoje dane i jak zrobić kopię zapasową

Wszystkie dane są uporządkowane i czytelne:

| Co zawiera | Lokalizacja na dysku |
|---|---|
| Bazy danych SQLite, historia rozmów, ustawienia, zaszyfrowany Sejf, konfiguracja telefonu i Telegrama | `%APPDATA%\COSGRAL Workspace\` (lub `COSGRAL Workspace Dev` w trybie uruchomienia z folderu) |
| Pliki robocze agentów, biblioteka dokumentów, pobrane pliki | `%USERPROFILE%\COSGRAL Workspace\` (foldery `Bots`, `Shared`, `Downloads`) |

- **Kopia zapasowa:** Wystarczy zamknąć program i skopiować powyższe foldery na dysk zewnętrzny. Plik .zip z Transferu to nie jest kopia zapasowa: nie zawiera historii rozmów, Sejfu, kluczy ani plików Biblioteki.
- **Całkowite usunięcie:** Zamknięcie programu i skasowanie powyższych folderów usuwa 100% danych bez pozostawiania śladów.
