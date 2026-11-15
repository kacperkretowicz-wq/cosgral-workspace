# Spec W5: kryteria odbioru (subskrypcje bez terminala)

**Stan: 16.11.2026, integracja `codex/cosgral-desktop` @ `2a14ebb04`. Autor: KAPI (W5-T1), tylko dokument, bez kodu.**

To jest opis zachowania „co program ma robić” i tabela kryteriów odbioru. Jak to zbudować: `spec-w5-subskrypcje.md` (kontrakty, zadania, ryzyka). Kolejność zadań i decyzje właściciela: `PLAN-W5.md`.

## Na górze

- **Sytuacji do dostarczenia:** 7 grup, 38 wierszy „Użytkownik robi X → program robi Y” (sekcja 1).
- **Kryteriów odbioru: 64** (52 na atrapach + 12 z prawdziwymi kontami, kluczami albo źródłem). **Wymaga właściciela: 11.**
- **Rozdział:** większość da się sprawdzić na atrapach (test jednostkowy, krok `sandbox:e2e`). Prawdziwe konta, klucze i pobranie z oficjalnego źródła sprawdza człowiek (sekcja 2B). **Agenci nigdy nie logują się na konta i nie czytają plików logowania.**
- **Czego brakuje w źródłach:** dokładne zachowanie OpenBota 0.70 dla dostawców jest w dokumencie źródłowym tylko w skrócie (jedno zdanie o 18 dostawcach, wiersz tabeli luk i tabela zadań W5). Szczegóły, których tam nie ma, oznaczam „propozycja T1” (wymaganie dopisane przeze mnie, do potwierdzenia przez lidera) albo „brak w źródłach”.

**Oznaczenia w kolumnie „Źródło”:** `PLAN-W5` = decyzje właściciela z 16.11; `spec-be` = `spec-w5-subskrypcje.md`; `luki` = `luki-070.txt`; `zlecenie BE1` = polecenie lidera dla W5-BE1 (16.11); „propozycja T1” = moje, do potwierdzenia.

**Zasada clean room:** opisuję zachowanie własnymi słowami. Nie czytałem kodu OpenBota nowszego niż 0.1.11 i nie kopiuję tekstów interfejsu OpenBota.

---

## 1. Zachowanie do dostarczenia

### 1A. CLI zarządzane (Codex i Claude)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 1 | Uruchamia program na komputerze bez Codex CLI (albo bez Claude CLI) i wybiera tego dostawcę. | Pokazuje kartę potwierdzenia w „Needs you”: nazwa CLI, wersja, rozmiar, źródło. Do zgody niczego nie pobiera. | Pobierać przed zgodą; pobierać z adresu podanego przez agenta. | spec-be §4.1; zlecenie BE1 |
| 2 | Zatwierdza kartę. | Pobiera, pokazuje postęp (ile bajtów z ilu) i fazy: pobieranie → sprawdzanie → instalowanie → gotowe. Po instalacji agent rusza bez restartu programu. | Uruchamiać plik, zanim suma SHA-256 się zgodzi; wymagać uprawnień administratora. | spec-be §4.1; luki (W5-BE1) |
| 3 | Pobranie się nie udaje (brak sieci, przerwanie, zła suma SHA-256). | Pokazuje czytelny powód i przycisk „Try again”. Zły albo niepełny plik jest usuwany i nie liczy się jako zainstalowany. | Uznać niepełny plik za CLI; zostawić na dysku plik ze złą sumą; pokazywać w błędzie ścieżkę z nazwą profilu. | spec-be §4.1, R3; propozycja T1 (szczegóły usuwania) |
| 4 | Nic nie robi; wychodzi nowa wersja CLI w katalogu wersji programu, a „aktualizuj automatycznie” jest włączone (domyślnie). | Pobiera nową wersję, sprawdza SHA-256 i przełącza się na nią bez karty potwierdzenia. Karta była tylko przy pierwszej instalacji. | Przerywać trwającą turę agenta (propozycja T1); pobierać bez sprawdzenia sumy. | PLAN-W5 pkt 3; zlecenie BE1; propozycja T1 |
| 5 | Wyłącza „aktualizuj automatycznie” w Ustawieniach. | Nie pobiera nowszych wersji sam. „Sprawdź” pokazuje, czy jest nowsza; „Zaktualizuj” robi to na żądanie. | Aktualizować w tle po wyłączeniu. | PLAN-W5 pkt 3 |
| 6 | Przypina wersję CLI. | Używa dokładnie tej wersji, także gdy auto-aktualizacja jest włączona. „Odepnij” wraca do „najnowsza z katalogu”. | Podmieniać przypiętą wersję. | PLAN-W5 pkt 3; spec-be §4.1 (`pinnedVersion`) |
| 7 | Wskazuje własną ścieżkę CLI zamiast pobranego. | Używa jej w pierwszej kolejności (własna ścieżka → pobrane → systemowe `PATH`). Przy złej ścieżce pokazuje czytelny błąd. Czy wtedy wraca po cichu do kolejnego źródła: brak w źródłach (decyzja przed BE1). | Wisieć albo padać bez komunikatu. | PLAN-W5 pkt 3; zlecenie BE1 |
| 8 | Klika „Usuń” przy pobranym CLI. | Usuwa tylko pobraną kopię (źródło „managed”). Po usunięciu stan wraca do „system” albo „brak”. | Usuwać systemowego CLI albo CLI ze ścieżki własnej; usuwać cokolwiek poza folderem pobranych. | spec-be §4.1; zlecenie BE1 |

### 1B. Logowanie, stan konta i konta w programie

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 9 | Dodaje konto: dostawca (Codex albo Claude), rodzaj (subskrypcja albo klucz API) i etykieta, np. „Praca”. | Tworzy osobny folder stanu tego konta pod danymi COSGRAL. Konto ma stan „signed-out”. | Używać folderów `~\.codex` i `~\.claude` jako folderu nowego konta bez wyraźnego „dodaj istniejące”. | spec-be §4.2 |
| 10 | Klika „Zaloguj” przy koncie (Codex: konto ChatGPT; Claude: konto Claude). | Uruchamia oficjalne polecenie logowania CLI jako proces potomny, z `CODEX_HOME` albo `CLAUDE_CONFIG_DIR` ustawionym na folder konta. Przeglądarkę otwiera samo CLI. Program śledzi wynik (kod wyjścia, potem stan konta z CLI). Stan: „signing-in” → „signed-in” albo „error”. | Otwierać, czytać lub kopiować pliki logowania; logować agenta samego (człowiek loguje). | spec-be §4.2; luki (W5-BE2, „agent nie loguje się sam”) |
| 11 | Logowanie wymaga wklejenia kodu. | Pole w oknie przekazuje kod do stdin procesu logowania i go nie zapisuje. | Zapisać kod w bazie, logu lub zdarzeniu. | spec-be §4.2 |
| 12 | Logowanie się nie udaje albo trwa za długo. | Stan „error” z czytelnym powodem, można ponowić; proces potomny jest zatrzymywany po limicie czasu (tylko własny PID). | Zostawić wiszący proces; zabijać wszystkie procesy `bun`. | propozycja T1; PLAN-W4 (zasada o PID) |
| 13 | Patrzy na listę kont. | Widzi dla każdego konta: etykietę, e-mail i plan (z CLI, nie z pliku), stan (zalogowane, wylogowane, sprawdzanie, błąd). Stan przeżywa restart programu. | Pokazywać e-mail w logach diagnostycznych i raportach repo (maskować). | spec-be §4.2, §7 |
| 14 | Wylogowuje konto albo usuwa konto. | Wylogowanie: stan „signed-out”, agent z tym kontem pokazuje „Sign in required” zamiast awarii. Usunięcie: potwierdzenie w oknie, kasuje folder stanu konta. Konto dodane jako odwołanie do istniejącego `~\.codex` lub `~\.claude` jest tylko odpinane, jego folder zostaje. | Kasować folder, który konto tylko wskazuje; kasować cokolwiek poza folderem stanu konta. | spec-be §4.2 (flaga „nie usuwaj”); propozycja T1 |

### 1C. Pula kont i przejście przy limicie

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 15 | Dodaje drugie konto tego samego dostawcy (np. dwa konta Claude). | Oba działają obok siebie, każde z własnym folderem stanu i własnym stanem. | Kopiować dane logowania między kontami. | PLAN-W5 pkt 4; luki (W5-K1) |
| 16 | Wybiera konto domyślne dostawcy. | Jest dokładnie jedno domyślne na dostawcę; agent bez własnego wyboru używa domyślnego. | Dwa konta domyślne naraz. | spec-be §4.2 (`isDefault`) |
| 17 | Przypisuje agentowi konkretne konto (albo „domyślne”). | Agent startuje CLI z folderem tego konta. W wierszu agenta widać, na którym koncie pracuje. | Ujawnić agentowi lub jego narzędziom zawartość folderu konta. | PLAN-W5 pkt 4; spec-be §4.2 (`set-agent-account`) |
| 18 | Włącza lub wyłącza konto w puli i zmienia kolejność kont w puli. | Pula bierze pod uwagę tylko włączone konta, w ustawionej kolejności. Kontrakt `ProviderAccount` ma `inPool`, ale **nie ma pola kolejności**: do dodania w K1 (brak w kontrakcie, spec-be §4.2). | Przechodzić na konto wyłączone z puli. | PLAN-W5 pkt 4; spec-be §4.2 |
| 19 | Zmienia limit liczby kont w puli (domyślnie 3). | Próba dodania ponad limit jest odrzucana czytelnym komunikatem. Limit jest zmienny w ustawieniach (nowe pole, brak w kontrakcie). | Zignorować limit; startować procesy CLI dla wszystkich kont naraz (zasób RAM, R6). | PLAN-W5 pkt 4; spec-be R6 |
| 20 | Pracuje z agentem, a jego konto trafia na limit **przed pierwszą akcją tury**. | Przechodzi na kolejne konto puli tego samego dostawcy i modelu, zaczyna turę od początku, zaznacza w UI, że zmieniło konto. | Przejść po cichu, gdy tura zdążyła zrobić akcję (patrz 21). | PLAN-W5 pkt 4; spec-be §4.5, R7 |
| 21 | Konto trafia na limit **po** pierwszej akcji tury (np. zapis pliku, wywołanie narzędzia ze skutkiem). | Nie przechodzi samo. Pokazuje kartę „limit, kontynuować na [konto]?” w „Needs you” i czeka na odpowiedź. | Powtórzyć pracę z efektami ubocznymi bez pytania (podwójne akcje). | spec-be R7 |
| 22 | W puli nie ma żadnego wolnego konta. | Agent dostaje czytelny stan limitu z godziną resetu (`resetsAt`), a nie zawieszenie. Po resecie konto wraca do puli. | Wisieć na „Thinking”; przechodzić na konto spoza puli. | luki (limit i reset); propozycja T1 (powrót konta po resecie) |
| 23 | Dwie osoby chcą użyć jednego konta. | Program nie ma funkcji udostępniania ani eksportu konta; w UI jest ostrzeżenie, że pula jest tylko z własnych kont jednej osoby. | Eksportować, kopiować lub współdzielić folder konta między osobami. | PLAN-W5 pkt 4 (R1); spec-be R1 |

### 1D. Klucze API

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 24 | Wpisuje klucz API OpenAI albo Anthropic przy koncie rodzaju „klucz API”. | Zapisuje go szyfrowanego Windows `safeStorage`. W odpowiedzi i w UI jest tylko „klucz zapisany” (bez wartości). | Zwrócić klucz w odpowiedzi, zdarzeniu, logu, bazie jawnym tekstem lub rendererze. | PLAN-W5 pkt 5; spec-be §4.3 |
| 25 | Uruchamia agenta na koncie z kluczem. | Odszyfrowuje klucz w procesie głównym tuż przed startem CLI i przekazuje go tylko jako zmienną środowiska procesu (`OPENAI_API_KEY` albo `ANTHROPIC_API_KEY`). | Przekazać klucz w argumentach polecenia; zostawić go w procesie po zakończeniu pracy. | spec-be §4.3 |
| 26 | Usuwa klucz. | Szyfrogram znika, następny start CLI jest bez zmiennej. Komunikaty błędów nie zawierają klucza (maskowanie). | Zostawić szyfrogram po usunięciu. | spec-be §4.3, R5 |

### 1E. Endpointy i modele lokalne

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 27 | Dodaje własny endpoint zgodny z OpenAI: nazwa, adres, opcjonalny klucz. | Pobiera listę modeli z endpointu i pokazuje stan (ok albo nieosiągalny). Domyślnie tylko loopback; inny host z ostrzeżeniem. Klucz endpointu traktowany jak w 24–26. | Przyjmować adres inny niż http/https; wysyłać klucz do innego hosta niż wskazany. | spec-be §4.4; luki (W5-K2) |
| 28 | Wybiera agentowi model z endpointu. | Agent rozmawia przez endpoint. Jeśli endpoint nie obsługuje narzędzi, model jest oznaczony „tylko rozmowa”. | Obiecywać agentowi narzędzia, których endpoint nie obsługuje. | spec-be §4.4, R4 |
| 29 | Klika „Wykryj lokalne” albo otwiera Dostawców. | Sprawdza tylko loopback: Ollama (port 11434) i LM Studio (port 1234). Gdy nic nie nasłuchuje, lista jest pusta, bez błędu. Znalezione modele trafiają na listę. | Skanować inne adresy albo sieć. | spec-be §4.4; luki (W5-K2) |
| 30 | Wybiera gotowe ustawienia ACP (Gemini, OpenCode, Copilot, Cursor). | Wypełnia formularz agenta ACP gotowymi wartościami. Nic nie instaluje i nie uruchamia. Same polecenia i argumenty: brak w źródłach. | Instalować cudze CLI w tle. | luki (W5-K2) |
| 31 | Usuwa endpoint. | Modele z niego znikają z wyboru. Agent, który go używał, dostaje czytelny błąd zamiast awarii. | Zostawić klucz endpointu po usunięciu. | propozycja T1 |

### 1F. Modele zapasowe

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 32 | Ustawia modele zapasowe agenta. | Przyjmuje do 8 (dziś 4) w wybranej kolejności; dziewiąty jest odrzucony. | Przekroczyć 8. | luki (W5-BE4); spec-be §4.5 |
| 33 | Pracuje, a dostawca zwraca błąd limitu albo sieci **przed pierwszą akcją tury**. | Najpierw próbuje innego konta tego samego modelu z puli, potem następnego modelu zapasowego. W UI i w `BotSummary.activeModel` widać aktywny model i powód. | Przechodzić po akcji tury bez pytania (jak 21). | luki (W5-BE4); PLAN-W5 pkt 4 |
| 34 | Czeka na reset limitu. | Po resecie agent wraca na pierwotny model (opcja `returnAfterReset`). | Zostać na zapasowym bez końca, gdy wybrano powrót. | spec-be §4.5 |
| 35 | Ustawia jako zapasowy inny model **tego samego** dostawcy (np. inny model Codex). | Przełącza się także w obrębie jednego dostawcy. W odbiorze W3-T3 to nie działało (wiersz 35 parytetu: przy limicie nie przełączyło, bo to ten sam dostawca). | Ignorować zapasowy, bo „dostawca ten sam”. | `parytet-0.68.md` wiersz 35; propozycja T1 |

### 1G. Użycie i karta limitu

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 36 | Otwiera stronę użycia. | Pokazuje dla dostawcy (i konta) procent zużycia z okien 5 godzin i tygodnia oraz czas resetu. Gdy dostawca nie podaje użycia, stan „unavailable” z powodem. Okno miesięczne: luki wymienia je w tabeli luk, zadanie W5-UI2 nie, więc poza W5 do decyzji. | Wymyślać procenty, gdy dostawca ich nie podał. | luki (W5-UI2, tabela luk); propozycja T1 (stan „unavailable”) |
| 37 | Patrzy na szynę boczną i wybór modelu. | Szyna pokazuje pierścienie użycia. W wyborze modelu widać, że dostawca jest na limicie i do kiedy. | Pokazywać dostawcę jako dostępnego, gdy jest na limicie. | luki (W5-UI2) |
| 38 | Trafia na limit w trakcie rozmowy. | W czacie pojawia się karta limitu: dostawca lub konto, kiedy reset, co program zrobił (przeszedł na konto lub model) albo co można zrobić (przejść, czekać). Karta odświeża się po resecie bez przeładowania. Treść i układ karty: brak w źródłach. | Ukrywać limit; zostawić pole wiadomości zablokowane bez opcji. | luki (W5-UI2); PLAN-W4 (zasada „Stop zawsze”, W4-BE2) |

---

## 2. Kryteria odbioru

**Skróty „Jak sprawdzić”:** **J** = test jednostkowy (atrapa CLI, atrapa serwera na loopbacku, folder tymczasowy), **E** = krok w `sandbox:e2e` (prawdziwe okno, atrapa Codex, osobne `COSGRAL_SANDBOX_ROOT`), **R** = ręcznie, wykonuje właściciel.

**Zasady testów:** atrapy CLI w testach jednostkowych; folder konta jako czarna skrzynka (test sprawdza tylko, że `CODEX_HOME` lub `CLAUDE_CONFIG_DIR` trafiło do procesu, nigdy nie otwiera plików w środku); klucz sztuczny `sk-test-…` i szukanie go w bazie, logach, zdarzeniach i rendererze (0 trafień); pobranie na atrapie serwera plików na loopbacku, nie z internetu (spec-be §7).

### 2A. Na atrapach (bez prawdziwych kont)

| Nr | Kryterium | Jak sprawdzić | Kto |
|---|---|---|---|
| C01 | Bez zgody na karcie nic się nie pobiera (wiersz 1). | J: menedżer CLI na atrapie serwera plików; zero żądań przed zgodą. E: karta w „Needs you”. | Backend (BE1), UI Designer (karta) |
| C02 | Po zgodzie widać postęp i fazy; zdarzenie `managed-cli-changed` przy każdej zmianie; agent rusza po instalacji bez restartu (wiersz 2). | J + E z atrapą serwera plików. | Backend (BE1) |
| C03 | Zła suma SHA-256: plik odrzucony i usunięty, stan „error”, nic nie uruchomione (wiersz 3). | J. | Backend (BE1) |
| C04 | Przerwane pobranie i brak sieci: błąd, „Try again”, brak półpliku uznanego za CLI (wiersz 3). | J (przerwanie w połowie, ponowienie). | Backend (BE1) |
| C05 | Folder per wersja pod katalogiem danych COSGRAL, bez uprawnień administratora, systemowe CLI nietknięte (wiersze 2, 8). | J (ścieżki w folderze tymczasowym; sprawdzenie, że systemowy plik atrapy się nie zmienił). | Backend (BE1) |
| C06 | Auto-aktualizacja (domyślnie włączona): nowsza wersja → pobranie, SHA-256, przełączenie bez karty; trwająca tura nie jest przerywana (wiersz 4). | J. | Backend (BE1) |
| C07 | Wyłączone „aktualizuj automatycznie”: nic się nie pobiera samo; „Sprawdź” i „Zaktualizuj” działają na żądanie (wiersz 5). | J + E. | Backend (BE1), UI Designer |
| C08 | Przypięta wersja nie jest podmieniana przy włączonej auto-aktualizacji; „odepnij” wraca do najnowszej (wiersz 6). | J. | Backend (BE1) |
| C09 | Kolejność wykrywania: własna ścieżka → pobrane (przypięte) → `PATH` → znane foldery; zła własna ścieżka daje czytelny błąd, bez zawieszenia (wiersz 7). | J z atrapami w czterech miejscach. | Backend (BE1) |
| C10 | „Usuń” usuwa tylko źródło „managed”; dla systemowego i własnej ścieżki odmowa (wiersz 8). | J (próba usunięcia systemowego pliku atrapy: plik zostaje). | Backend (BE1) |
| C11 | Karta potwierdzenia tylko przy pierwszej instalacji danego CLI; aktualizacje bez karty, ale z SHA-256 (wiersze 1, 4). | J. | Backend (BE1) |
| C12 | Jedno źródło prawdy o stanie CLI w onboardingu, Providers i Usage; test na rozbieżność jak W4-BE1. | J. | Backend (BE1) |
| C13 | Metody `subscriptions:*` są opcjonalne w `window.openbot`; zdalny serwer i telefon dostają błąd przy instalacji i usuwaniu. | J (kontrakt, preload). | Backend (BE1) |
| A01 | Nowe konto = osobny folder stanu w katalogu danych COSGRAL, stan „signed-out” (wiersz 9). | J (folder tymczasowy). | Backend (BE2) |
| A02 | Logowanie uruchamia oficjalne polecenie CLI jako proces potomny z `CODEX_HOME` lub `CLAUDE_CONFIG_DIR` na folderze konta; przeglądarkę otwiera CLI; stan wg wyniku (wiersz 10). | J: atrapa CLI zrzuca zmienne środowiska; test nie otwiera plików w folderze konta. | Backend (BE2) |
| A03 | Pole na kod trafia do stdin procesu i nie jest nigdzie zapisane (wiersz 11). | J: szukanie sztucznego kodu w bazie, logach, zdarzeniach (0 trafień). | Backend (BE2) |
| A04 | Błąd lub przekroczenie czasu logowania: „error”, ponowienie, proces zatrzymany (własny PID) (wiersz 12). | J (atrapa, która wisi). | Backend (BE2) |
| A05 | Lista kont pokazuje etykietę, e-mail, plan i stan; stan przeżywa restart; e-mail maskowany w logach diagnostycznych (wiersz 13). | J + E (restart programu w piaskownicy). | Backend (BE2), UI Designer |
| A06 | Wylogowanie: „signed-out”, agent pokazuje „Sign in required” bez awarii (wiersz 14). | J + E. | Backend (BE2) |
| A07 | Usunięcie konta kasuje tylko jego folder stanu; konto wskazujące na istniejące `~\.codex` lub `~\.claude` jest tylko odpinane (wiersz 14). **Test bezpiecznika z próbą ucieczki** (junction, ścieżka względna, katalog domowy). | J (folder tymczasowy, junction do „obcego” katalogu: cel zostaje). | Backend (BE2) |
| A08 | Żaden kod programu ani narzędzie agenta nie otwiera ani nie kopiuje plików logowania (wiersze 10, 17). | J (test + przegląd kodu wyszukiwaniem po ścieżkach folderów kont, wykonuje KK). | Backend (BE2), KK |
| P01 | Dwa konta tego samego dostawcy działają obok siebie, każde z własnym stanem (wiersz 15). | J + E (dwa konta, atrapa CLI). | KAPI (K1) |
| P02 | Dokładnie jedno konto domyślne na dostawcę (wiersz 16). | J. | KAPI (K1) |
| P03 | Agent z przypisanym kontem startuje CLI z folderem tego konta; „domyślne” = `null` (wiersz 17). | J (zmienna środowiska w atrapie) + E. | KAPI (K1) |
| P04 | Włączanie, wyłączanie i kolejność kont w puli zmieniają, na które konto program przechodzi najpierw; konto wyłączone nigdy nie jest wybierane (wiersz 18). Wymaga dopisania pola kolejności w kontrakcie. | J. | KAPI (K1) |
| P05 | Limit liczby kont w puli: domyślnie 3, zmienny; dodanie ponad limit odrzucone z komunikatem (wiersz 19). | J. | KAPI (K1) |
| P06 | Limit przed pierwszą akcją tury: przejście na następne konto puli, tura od początku, znacznik w UI (wiersz 20). | J (atrapa zgłasza limit) + E. | KAPI (K1) |
| P07 | Limit po pierwszej akcji tury: brak cichego przejścia, karta „limit, kontynuować na [konto]?” w „Needs you” (wiersz 21). | J + E. | KAPI (K1), UI Designer |
| P08 | Brak wolnego konta: stan limitu z godziną resetu, bez zawieszenia „Thinking”; po resecie konto wraca do puli (wiersz 22). | J. | KAPI (K1) |
| P09 | Kolejność warstw: najpierw inne konto tego samego modelu, potem następny model zapasowy (wiersz 33). | J. | KAPI (K1), Backend (BE4) |
| P10 | Pula nie startuje procesów CLI dla wszystkich kont naraz: jeden proces na aktywne konto, bezczynne wyłączane (RAM, R6). | J (liczba uruchomionych atrap). | KAPI (K1) |
| P11 | Brak funkcji udostępniania i eksportu konta; w UI ostrzeżenie o puli tylko z kont jednej osoby (wiersz 23). | J (brak takiego kanału w kontrakcie) + przegląd UI. | KAPI (K1), UI Designer |
| K01 | Klucz API jest tylko wejściem; odpowiedź i UI go nie zawierają (wiersz 24). | J. | Backend (BE3) |
| K02 | Klucz zapisany szyfrogramem `safeStorage`; sztuczny `sk-test-…` ma 0 trafień w bazie, logach, zdarzeniach i rendererze (wiersz 24). | J (szukanie ciągu). | Backend (BE3) |
| K03 | Klucz trafia do procesu CLI tylko jako zmienna środowiska, nigdy w argumentach polecenia (wiersz 25). | J: atrapa CLI zrzuca `argv` i środowisko. | Backend (BE3) |
| K04 | Usunięcie klucza kasuje szyfrogram; następny start bez zmiennej; błędy maskują klucz (wiersz 26). | J. | Backend (BE3) |
| E01 | Endpoint OpenAI-compatible: lista modeli, stan ok lub nieosiągalny, loopback domyślnie, inny host z ostrzeżeniem, tylko http/https (wiersz 27). | J (atrapa serwera Chat Completions na losowym porcie loopback). | KAPI (K2) |
| E02 | Agent na modelu `endpoint:<id>/<model>` rozmawia przez atrapę serwera; endpoint bez narzędzi oznaczony „tylko rozmowa” (wiersz 28). | J + E. | KAPI (K2) |
| E03 | Klucz endpointu traktowany jak K01–K04 (wiersz 27). | J. | KAPI (K2) |
| E04 | Wykrywanie lokalne sprawdza tylko 127.0.0.1:11434 i :1234; gdy nic nie nasłuchuje, lista jest pusta bez błędu (wiersz 29). | J (porty wstrzykiwane w teście). | KAPI (K2) |
| E05 | Gotowe ustawienia ACP (Gemini, OpenCode, Copilot, Cursor) wypełniają formularz i niczego nie instalują ani nie uruchamiają (wiersz 30). | J. | KAPI (K2) |
| E06 | Usunięcie endpointu: modele znikają z wyboru, agent dostaje czytelny błąd (wiersz 31). | J. | KAPI (K2) |
| F01 | Do 8 modeli zapasowych (`PROVIDER_LIMITS.fallbackModels` 4 → 8); dziewiąty odrzucony (wiersz 32). | J. | Backend (BE4) |
| F02 | Przejście przed pierwszą akcją przy błędzie limitu i błędzie sieci (wiersz 33). | J (dwa testy: limit, sieć). | Backend (BE4) |
| F03 | Powrót na pierwotny model po resecie przy `returnAfterReset` (wiersz 34). | J. | Backend (BE4) |
| F04 | Przełączenie działa także w obrębie jednego dostawcy (wiersz 35; błąd z odbioru W3-T3). | J + E (atrapa z dwoma modelami jednego dostawcy). | Backend (BE4), KK |
| U01 | Strona użycia: procent z okien 5 h i tygodnia oraz reset; „unavailable” z powodem, gdy dostawca nie podaje (wiersz 36). | J + test UI. | UI Designer (UI2) |
| U02 | Pierścienie użycia na szynie; w wyborze modelu widać limit i czas resetu (wiersz 37). | Test UI + E (atrapa limitu). | UI Designer (UI2) |
| U03 | Karta limitu w czacie z dostawcą lub kontem, resetem i tym, co program zrobił; odświeża się po resecie bez przeładowania (wiersz 38). | Test UI + E. | UI Designer (UI2) |
| B01 | Strona Dostawcy: wiersz na dostawcę z akcjami (pobierz, połącz, rozłącz, konta, modele); krok „połącz” w onboardingu. | Test UI + E. | UI Designer (UI1) |
| B02 | Zbiorczy skan sekretów po wszystkich funkcjach W5: 0 trafień sztucznych kluczy, kodów i e-maili w bazie, logach, zdarzeniach, rendererze i repo. | J + skan (przed odbiorem). | KK |
| B03 | `bun run check`, `check:ui` i `sandbox:e2e` zielone po każdej partii W5; wpisy w parytecie i `COSGRAL-CHANGES.md` w tym samym scaleniu. | Polecenia (jedno ciężkie naraz). | Lider, KK |

### 2B. Wymaga prawdziwych kont, kluczy albo prawdziwego źródła

Zasady wspólne: logowanie robi **tylko człowiek** w oknie programu, w piaskownicy albo na profilu testowym; agenci odczytują tylko stan (np. `loggedIn`, bez e-maila i bez plików logowania). Najwyżej 4–5 krótkich tur na konto („odpowiedz słowem OK”). Pobrania prawdziwych CLI tylko w piaskownicy lub na czystym koncie Windows, nigdy na zwykłym profilu właściciela.

| Nr | Kryterium | Jak sprawdzić | Kto |
|---|---|---|---|
| G01 | Źródło i suma SHA-256 oficjalnego CLI potwierdzone jednym prawdziwym pobraniem w piaskownicy; plik z pobrania nie jest uruchamiany poza piaskownicą. | R/KK: jedno pobranie, wynik w raporcie. | Backend (BE1), KK |
| G02 | Czysty Windows bez Codex i Claude: jedno kliknięcie pobiera oficjalne CLI, agent odpowiada „OK”. | R: konto lub maszyna z czystym Windows (jak W4-H2). | KK + właściciel |
| G03 | Logowanie Codex (konto ChatGPT) w oknie programu bez terminala; stan „signed-in”; tura „OK”. | R. | Właściciel (loguje), KK (odczyt stanu) |
| G04 | Logowanie Claude (konto Claude) w oknie programu bez terminala; stan „signed-in”; tura „OK”. | R. | Właściciel (loguje), KK (odczyt stanu) |
| G05 | Wylogowanie obu kont: stan „signed-out”, agent pokazuje „Sign in required” bez awarii. | R. | Właściciel |
| G06 | Dwa konta Claude na jednym komputerze: każde z osobnym logowaniem, agent A na koncie 1, agent B na koncie 2, obie tury „OK”. | R. | Właściciel (+ wspólnik albo drugie własne konto) |
| G07 | Przejście przy limicie na prawdziwych kontach potwierdzone (bramka G2). Celowe wyczerpywanie limitu: brak w źródłach; do ustalenia w T2 (np. potwierdzenie na atrapie limitu plus jedno przejście, gdy limit wystąpi naturalnie). | R, sposób do uzgodnienia. | KK + właściciel |
| G08 | Klucz API testowy (OpenAI i/lub Anthropic) z limitem wydatków ustawionym u dostawcy: wpisuje go człowiek w oknie programu; tura „OK”; po teście skan nie znajduje klucza w żadnym logu, bazie ani zdarzeniu. | R + skan. | Właściciel, KK |
| G09 | Aktualizacja i przypięcie na prawdziwym wydaniu CLI, jeśli jest nowsze od zainstalowanego. | R. | KK + właściciel |
| G10 | Ollama lub LM Studio, jeśli zainstalowane (dziś Ollamy nie ma): model lokalny odpowiada. Brak instalacji = krok pominięty z oznaczeniem, nie czerwony. | R, opcjonalnie. | Właściciel |
| G11 | Obaj wspólnicy podpinają swoje subskrypcje sami, bez instrukcji (bramka G2). | R: obserwacja bez podpowiedzi. | Właściciele |
| G12 | Warunki planów ChatGPT i Claude sprawdzone przed użyciem puli kont (R1). Wynik zapisany jednym zdaniem w kanale. | R. | Właściciel |

### Podsumowanie liczb

- **Razem kryteriów: 64** (52 na atrapach + 12 z prawdziwymi kontami, kluczami lub źródłem).
- **Wymaga właściciela: 11 z 12 w sekcji 2B** (logowanie, klucze i konto lub maszyna). G01 jest po stronie Backendu i KK w piaskownicy, bez konta.
- Wszystkie kryteria z sekcji 2A da się sprawdzić bez żadnego prawdziwego konta.

---

## 3. Poza zakresem W5

- **Komunikatory, katalog 200+ aplikacji, serwer na Linuksie, klient webowy, SSO** (decyzja lidera 1 w `PLAN-W4.md`; `spec-be` §8).
- **Router wielu subskrypcji per klient agencji**, przestrzenie klientów i budżety: W8.
- **Wątki, kontekst, plan, subagenci, akcje na wiadomościach:** W6.
- **Telefon poza domem, push, PIN:** W9. **Integracje:** W10.
- **Pobieranie i aktualizacja CLI innych dostawców niż Codex i Claude** (Gemini, OpenCode, Copilot, Cursor): w W5 tylko gotowe ustawienia ACP, bez pobierania ich CLI (`ManagedCliId` obejmuje `codex` i `claude`).
- **Limit wydatków klucza API w programie:** limit ustawia się w panelu dostawcy (luki, warstwa „klucze API z limitem”); w programie nie robimy własnego licznika kosztów. Kto płaci: brak w źródłach.
- **Okno użycia „miesiąc”:** luki wymienia je w tabeli luk, ale zadanie W5-UI2 mówi tylko o oknach 5 h i tygodniowym.
- **Agent logujący się sam na konta.** Człowiek loguje, agent odczytuje stan.
- **Dzielenie jednego konta między osoby**, eksport lub kopiowanie danych logowania.
- **Używanie prawdziwych kont klientów agencji** (reklamy, budżety, CMS) w testach: tylko konta testowe (luki, granice swobody).
- **Instalacja Ollamy lub LM Studio przez program.** Program tylko wykrywa je na loopbacku.
- **18 dostawców jak w OpenBocie 0.70:** u nas Codex i Claude natywnie, endpointy i modele lokalne, reszta przez ACP (decyzja lidera 3 w `PLAN-W4.md`).

---

## Czego nie sprawdziłem

- **Zachowania OpenBota 0.70 na żywo.** Nie uruchamiałem go ani nie czytałem jego kodu. Opieram się na dokumencie źródłowym `luki-070.txt`, który opisuje dostawców w kilku zdaniach, jednym wierszu tabeli luk i tabeli zadań W5. Raportu roboczego z „sekcji 3”, o którym wspomina tabela zadań, **nie ma** w `Shared\cosgral-docs` (jest tylko `luki-070.txt`). Szczegóły UI i kolejności w puli OpenBota: brak w źródłach.
- **Oficjalnych źródeł pobierania CLI, sum SHA-256 i poleceń logowania w trybie bez terminala** (ryzyka R2, R3). Nie sprawdzałem ich; zadanie BE1 i BE2.
- **Warunków planów ChatGPT i Claude** (R1) i kosztów kluczy API.
- **Kontraktu `ipc-subscriptions.ts`:** nie istniał w momencie pisania (Backend robi BE1). Pola, których wymagają decyzje właściciela, a których spec-be §4.2 nie ma: kolejność kont w puli, limit liczby kont, `autoUpdate`, `customPath` i kanał `subscriptions:set-cli-settings` (te trzy podał lider w zleceniu BE1). Kryteria P04 i P05 zakładają ich dopisanie.
- **Dzisiejszego stanu kodu** poza przeczytaniem `ipc-providers.ts` (limit 4 modeli zapasowych, `ProviderUsage`) i wiersza 35 parytetu. Nie uruchamiałem testów, typecheck ani biome (limit sprzętu, dokument to tylko Markdown).
- **Wymagań „propozycja T1”** (m.in. wiersze 3, 12, 14, 22, 31, 35): to moje dopowiedzenia, których nie ma w źródłach; lider ma je potwierdzić albo skreślić.
- **Zgodności liczb w podsumowaniu** z innymi dokumentami: policzyłem je z tabel w tym pliku.
