# KK Fullstack: W5-T2a, odbiór części „CLI zarządzane” (C01–C13) w prawdziwym oknie

Data: 16.11.2026. Integracja `codex/cosgral-desktop` @ `ad216fe12` (W5-BE1 silnik pobierania CLI, W5-UI1a strona Dostawcy część CLI), gałąź robocza `team/kk/w5-t2a`. Prawdziwy Electron w piaskownicy (własny profil), atrapa Codex jako agent i **atrapa serwera plików na loopback** w roli oficjalnych serwerów (program przyjmuje `COSGRAL_CLI_TEST_BASE` tylko niespakowany i tylko na loopback). Zmieniłem tylko skrypt odbioru; kodu programu nie ruszałem.

## Wynik w jednej linii

**13 kroków odbioru (C01–C13) przechodzi w prawdziwym oknie (13/13, 0 błędów konsoli), plus krok O1 dla onboardingu bez CLI (1/1). Stan kryteriów: 9 „jest”, 4 „częściowo”, 0 „brak”.** Trzy usterki programu (żadna nie blokuje kryterium): surowy komunikat IPC przy złej ścieżce CLI, karta zgody trafia do pierwszego agenta z listy, mieszanie polskiego z angielskim w nowych ekranach.

## Wynik per kryterium

„Jest” znaczy: sprawdzone w oknie przez stronę Dostawcy lub kartę zgody i zgodne z kryterium. „Częściowo” znaczy: część sprawdzona, reszta wymaga prawdziwego CLI, właściciela albo osobnego testu (kolumna „Do T2”).

| Nr | Stan | Dowód (krok, co widać) | Do T2 / czego brakuje |
|---|---|---|---|
| C01 | **jest** | C01 + O1: po „Pobierz” stan CLI ma fazę „Czeka na zgodę”, strona pisze „Czeka na zgodę w Needs you”, **0 żądań pliku** do czasu odpowiedzi. Karta „Download Codex CLI 1.0.0?” (rozmiar 90 MB, źródło, SHA-256, bez uprawnień administratora) jest w „Decision” agenta. „Cancel” → stan „idle” z komunikatem „The download was declined.”, 0 żądań, nic na dysku. O1: bez agenta pyta okno systemowe, „Not now” nic nie pobiera, „Download” pobiera | — |
| C02 | **częściowo** | C02: po „Confirm” strona pokazuje „Pobieranie” i **pasek postępu, który się rusza** (0–100%), 19 zdarzeń `managed-cli-changed`, 1 żądanie pliku, na końcu „Gotowe”, „Pobrana: 1.0.0” | Fazy „Sprawdzanie SHA-256” i „Instalowanie” trwają zbyt krótko, żeby je złapać na stronie. **„Agent rusza po instalacji bez restartu”: niesprawdzone**, bo agent odbioru działa na atrapie CLI z `OPENBOT_CODEX_PATH`, a pobrany plik to `node.exe`, nie prawdziwy Codex (w O1 po instalacji pole rozmowy pisze „Complete agent CLI setup to start”). Wymaga prawdziwego CLI (G01, G02) |
| C03 | **jest** | C03: aktualizacja z plikiem o złej sumie → błąd „The download failed the SHA-256 check; nothing was saved.”, **1 żądanie pliku (bez drugiej próby)**, wersja 1.0.0 zostaje, w folderze `cli/codex` tylko `1.0.0` (żadnego półpliku ani folderu 1.1.0), strona oferuje „Ponów”, błąd bez ścieżki profilu | — |
| C04 | **jest** | C04: jedno urwanie → program ponawia sam (2 żądania), wersja 1.1.0; dwa urwania → błąd, 1.1.0 zostaje, 2 żądania, w folderze `cli/codex` tylko `1.1.0`, „Ponów” oferowane; po powrocie sieci „Ponów” → 1.2.0 | — |
| C05 | **jest** | C05: plik w `cli/codex/1.0.0/` w danych programu (w profilu piaskownicy), jedyny folder to wersja, atrapa CLI programu ma po wszystkim ten sam SHA-256. Przebieg jako zwykły użytkownik | Sam brak potrzeby uprawnień administratora nie jest dowodzony osobno (przebieg jako zwykły użytkownik) |
| C06 | **częściowo** | C06: po restarcie przy włączonej auto-aktualizacji 1.2.0 stało się 1.3.0 **samo** (1 żądanie, bez karty, stary folder zniknął). Pobranie, SHA-256 i przełączenie sprawdzone | „Trwająca tura nie jest przerywana”: sprawdziłem tylko przy aktualizacji ręcznej w C07 (tura skończyła się), na atrapie CLI. Wymaga prawdziwej tury na pobranym CLI |
| C07 | **jest** | C07: po restarcie z wyłączoną auto-aktualizacją **0 pobrań w 15 s** (ustawienie przeżyło restart); „Sprawdź” pokazuje „Najnowsza: 1.4.0” **bez pobrania**; „Zaktualizuj” → 1.4.0 (1 żądanie), a trwająca tura (`SLOW 12000`) skończyła się | — |
| C08 | **jest** | C08: po restarcie z przypiętą 1.4.0 i dostępną 1.5.0 **nic się nie pobiera**, 1.4.0 zostaje; „Odepnij” + „Zaktualizuj” → 1.5.0 | — |
| C09 | **częściowo** | C09: własna ścieżka wygrywa (źródło „Własna ścieżka”), złą ścieżkę strona odrzuca czytelnym powodem („No file at that path. Choose the CLI's executable.”) bez zawieszenia, po wyczyszczeniu źródło wraca do „Pobrane”. **Usterka 1** (surowy prefiks IPC w komunikacie) | Kolejność „PATH → znane foldery” sprawdzona tylko testami jednostkowymi BE1 (`cli.test.ts`), nie w oknie |
| C10 | **jest** | C10: przy aktywnej własnej ścieżce „Usuń” skasowało tylko pobrany folder; plik własnej ścieżki ma ten sam SHA-256, źródło nadal „Własna ścieżka”; gdy nic nie jest pobrane, przycisku „Usuń” nie ma | — |
| C11 | **jest** | C11 + C03 + C04 + C06: po pierwszym „tak” ani ponowna instalacja po „Usuń”, ani aktualizacje (ręczne i automatyczna) nie pokazały żadnej karty; każdy plik był sprawdzony SHA-256 | — |
| C12 | **jest** | C12 + O1: silnik (źródło „Pobrane”, wersja 1.2.0), lista użycia (stan „ok”) i karta na stronie mówią to samo; w onboardingu bez CLI lista dostawców pisze „Not installed”, a karta „Brak” | — |
| C13 | **częściowo** | C13: siedem wywołań `subscriptions` (`listCli`, `checkCli`, `installCli`, `updateCli`, `removeCli`, `pinCli`, `setCliSettings`) jest w lokalnym oknie | Odmowa dla zdalnego serwera i telefonu („Agent CLIs are managed on this computer only.”) nie sprawdzona w oknie; tylko test jednostkowy BE1 |

Dodatkowy krok **O1** (onboarding bez CLI, UI1a): przycisk „Continue with …” zablokowany, karta mówi „Brak”, jest informacja „Logowanie wkrótce” i **brak martwego przycisku logowania**; „Pobierz i przejdź dalej” pyta w oknie systemowym, „Not now” nic nie pobiera i „Continue” zostaje zablokowany, „Download” pobiera i **okno konfiguracji zamyka się samo** (przycisk instaluje i idzie dalej). Zrzut: `cli-o1-blocked.png`.

## Jak sprawdzałem

- **Atrapa serwera na loopback** (w skrypcie): odpowiada jak wydania GitHub (metadane z `digest` SHA-256), serwuje kopię `node.exe` jako „plik CLI”, a do testów potrafi: zmienić „najnowszą” wersję, podać plik o złej sumie, urwać pobranie raz albo za każdym razem, wolno wysyłać plik (żeby było widać pasek). Liczy żądania pliku. Program wybiera ją tylko niespakowany i na loopback (zmienna `COSGRAL_CLI_TEST_BASE`); nic nie wychodzi poza komputer.
- **Interfejs, nie samo API:** przyciski „Pobierz”, „Sprawdź”, „Zaktualizuj”, „Usuń”, „Ponów”, „Przypnij”, „Odepnij”, „Zapisz ścieżkę”, „Wyczyść ścieżkę”, przełącznik „Aktualizuj automatycznie” na stronie Dostawcy oraz przyciski „Confirm” i „Cancel” karty w „Decision”. API (`window.openbot.subscriptions`) służyło tylko do odczytu stanu i do liczb (żądania pliku, foldery na dysku).
- **Restart dla C06–C08:** auto-aktualizacja, przypięcie i przełącznik działają przy starcie programu, więc po pierwszym uruchomieniu skrypt uruchamia program jeszcze 3 razy (restart istniejący plus dwa nowe).
- **O1** w osobnej piaskownicy (`COSGRAL_MODE=cli-onboarding`), z Codex wskazującym nieistniejący plik. Okno systemowe zgody odpowiedziane z procesu głównego (nie da się go obsłużyć z zewnątrz).

## Usterki programu (z odtworzeniem; kodu nie poprawiałem)

1. **Zła własna ścieżka CLI pokazuje surowy błąd IPC.** Odtworzenie: Providers → „Narzędzia CLI” → karta Codex → „Własna ścieżka do CLI” wpisz nieistniejącą pełną ścieżkę (np. `C:\nie\ma\codex.exe`) → „Zapisz ścieżkę”. Na górze sekcji pojawia się: „Error: Error invoking remote method 'subscriptions:set-cli-settings': Error: No file at that path. Choose the CLI's executable.” (zrzut `cli-c09-bad-path.png`). Powód jest czytelny, ale z technicznym prefiksem, a błąd jest nad kartami, nie na karcie, której dotyczy. Propozycja (UI): w obsłudze błędów `ManagedCliSection.tsx` wyciąć prefiks `Error invoking remote method '…': Error:` i pokazać komunikat na karcie danego CLI.
2. **Karta zgody na pierwsze pobranie trafia do pierwszego agenta z listy, nie tam, gdzie osoba kliknęła.** Odtworzenie: przy dwóch lub więcej agentach otwórz Providers i kliknij „Pobierz” przy Codex (pierwsza instalacja). Karta „Download Codex CLI 1.0.0?” pojawia się w „Needs you” i w rozmowie **pierwszego agenta na liście** (w odbiorze „Phone made”, agent niezwiązany z tym, co robiła osoba), a na stronie Dostawcy jest tylko tekst „Czeka na zgodę w Needs you”. Przyczyna z kodu: `AgentService.confirmForPerson(null, …)` bierze `bots[0]`. Propozycja: karta w aktualnie otwartej rozmowie albo wprost na stronie Dostawcy, przynajmniej podpowiedź, który agent ma kartę.
3. **Mieszanie języków.** Nowe ekrany (`Narzędzia CLI`, `Pobierz`, `Sprawdź`, `Przypnij`, `Połącz dostawcę`, `Logowanie wkrótce`) są po polsku, reszta aplikacji i komunikaty błędów po angielsku (np. „The download failed the SHA-256 check…”, „Not installed”). Wiem, że pełna lokalizacja to W7, ale na jednym ekranie wygląda to niespójnie; do decyzji, czy do W7 trzymać angielski jak reszta.

Uwagi bez zgłoszenia: w profilu piaskownicy, gdzie CLI podaje zmienna `OPENBOT_CODEX_PATH`, karta Dostawcy mówi „Brak” (źródło „none”), choć agent działa (to zmienna dla testów). Pasek postępu i faza „Pobieranie” działają, fazy „Sprawdzanie SHA-256” i „Instalowanie” są za krótkie, żeby je zobaczyć.

## Poprawki w skrypcie odbioru po drodze

Karta zgody ma przyciski „Confirm / Edit / Cancel” (nie „Send / Keep draft”), jej tytuł to „Download Codex CLI 1.0.0?”, a trafia do agenta z karty, nie do „Assistant”: krok czyta agenta z oczekującej karty. Przy błędzie każdy krok zapisuje zrzut i drzewo dostępności (poza repo), a komunikat błędu zachowuje pierwsze 6 linii (log Playwrighta). Licznik żądań C06 liczy od końca pierwszego uruchomienia (aktualizacja przy starcie dzieje się przed krokiem).

## Czego nie sprawdziłem

- **Prawdziwych źródeł i prawdziwego pobrania** (GitHub dla Codex, `downloads.claude.ai` dla Claude): cały odbiór jest na atrapie na loopback. Prawdziwe pobranie zrobił tylko Backend (Claude Code, bez uruchamiania pliku). Kryteria G01, G02, G09 zostają dla T2 i właściciela.
- **Claude CLI.** Atrapa serwera udaje wydania Codex; nie ma atrapy manifestu Claude. Wszystkie kroki dotyczą karty Codex.
- **Agenta na pobranym CLI**: pobrany plik to `node.exe`, nie Codex, więc „agent rusza po instalacji bez restartu” (C02) i „tura nie jest przerywana przez auto-aktualizację” (C06) nie są dowiedzione.
- **Kolejności PATH i znanych folderów** (C09), odmowy dla zdalnego serwera i telefonu (C13), „bez uprawnień administratora” jako osobnego dowodu (C05).
- **Zegara 6 h** auto-aktualizacji (tylko start programu; timer nie był czekany).
- **Spakowanej aplikacji** (`isPackaged`, oficjalne hosty w działającym programie): atrapa działa tylko niespakowana, więc tej drogi nie widziałem.
- **Okna systemowego** w innym układzie niż w O1 (np. po zamknięciu okna konfiguracji).
- **Wygląd i dostępność strony poza zrzutami** (klawiatura, czytnik ekranu, mały ekran): oglądałem zrzuty, nie sprawdzałem ręcznie.
- **Stabilności**: każdy krok po jednym końcowym przebiegu (13/13 w jednym, ok. 2,5 min); wcześniejsze próby padały na błędach mojego skryptu, nie na programie.
- Pełnego `bun run check` po tych zmianach (zmieniłem tylko skrypt odbioru; `typecheck:node` i Biome na pliku zielone).

## Pliki

`scripts/sandbox-acceptance.ts` (kroki C01–C13, O1, atrapa serwera, pomocniki), `docs/cosgral/spec-w5.md` (tabela stanu C01–C13), `COSGRAL-CHANGES.md`, ten raport. Zrzuty i logi (mają nazwę konta): poza repo, `Shared\cosgral-sandbox\acceptance\rows-final\evidence` i `cli-onb\evidence`.
