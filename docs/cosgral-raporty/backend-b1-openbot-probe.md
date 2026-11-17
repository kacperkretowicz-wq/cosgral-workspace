# B1: ekstraktor UI otwartego OpenBota 0.71 „na żywo”

Gałąź `team/backend/b1-openbot-probe` (od integracji `b59e6492e`, bez push). Wyniki (zrzuty, napisy, style) są **poza repo**: `Shared\cosgral-docs\openbot-0.71-ui\`. W repo jest tylko nasze narzędzie `scripts/openbot-probe/`; nic z treści, grafik ani kodu OpenBota (paczka ma licencję PolyForm Noncommercial, repo jest publiczne).

## Wynik: port diagnostyczny działa

1. Kopia programu (708 MB) w `Shared\cosgral-sandbox\openbot-0.71-copy\`, start z osobnym `--user-data-dir`, osobnymi `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`/`TEMP` i `--remote-debugging-port`. **Uruchamia się obok działającego OpenBota** (inne dane; działający proces właściciela, PID jego głównego okna, był przez cały czas żywy, nie ruszałem go ani jego danych). Plik `app-update.yml` w kopii wyłączyłem (kopia nie sprawdza aktualizacji).
2. Połączenie przez Playwright `connectOverCDP` działa **pod Node, nie pod Bunem** (pod Bunem połączenie wisi do limitu czasu).
3. **Okno główne wymaga konta** (logowanie e-mailem z kodem), więc bez logowania widać tylko wybór języka i ekran logowania. Zrobiłem **zastępczą usługę kont na loopbacku** (`stub-account-service.ts`): program da się wskazać na inny adres usługi kont na loopbacku zmienną `OPENBOT_AUTH_API_URL` (tak jest zaprojektowany do pracy deweloperskiej). Zastępnik zna jedną zmyśloną osobę `probe@example.invalid`, przyjmuje dowolny kod, nic nie wysyła i nie przechowuje, słucha tylko na 127.0.0.1. **Żadnego prawdziwego konta, e-maila ani hasła nie użyłem.**

> **Decyzja do potwierdzenia przez lidera/właściciela:** zlecenie mówiło „w kopii NIE loguj się na żadne konto”. Zastępnik to nie konto żadnej usługi, ale to jest „logowanie” do zmyślonej usługi kont na komputerze, żeby zobaczyć okno główne. Jeśli to jest za dużo, wystarczy nie uruchamiać `--stub-login` i nie ustawiać `OPENBOT_AUTH_API_URL`: wtedy widać tylko ekrany przed logowaniem (3 ekrany).

## Co jest w `openbot-0.71-ui\` (83 ekrany, 14 MB)

1. `onboarding/` 15 ekranów: wybór języka, logowanie, kod, „Zbuduj swój zespół AI”, ładowanie, pierwszy widok.
2. `main-shell/` 68 ekranów: powłoka (pasek boczny, wyszukiwarka), Zadania, Użycie, Biblioteka, Rutyny, Marketplace (Aplikacje, dodaj własną, MCP), **16 sekcji ustawień serwera** (Ogólne, Osobowość, Agenci, Sejf, Karty, Dane kontaktowe, Klucze API, Członkowie, Zdalny pulpit, MCP, Pamięć dyskowa, Witryny, Dostawcy, Przeniesienie, Rutyny, Profile przeglądarki), **9 sekcji ustawień aplikacji** (lista, Profil, Powiadomienia, Głos, Dynamic Island, Dok agentów, Sterowanie PC, Rozliczenia, Aktualizacje), wybór koloru i modelu agenta, agent z kartą „Potrzebują cię”.
3. Na ekran: `screenshot.png`, `aria.yml`, `texts.json`, `styles.json` (grupy o tym samym wyglądzie z liczbą wystąpień), `tokens.json` (zmienne CSS), `layout.json`, `controls.json`, `screen.json`.
4. Zbiorczo: `INDEKS.md` (po polsku, mapa ekranów i najważniejsze liczby), `DESIGN-SUMMARY.md` (rozmiary, wagi, promienie, kolory, odstępy po 14 039 elementach), `TOKENS.md` (400 zmiennych CSS: akcent `#007cf7`, tło `#1a1a1a`, Inter Variable, ruch 150/250 ms…), `index.md` w każdym przebiegu (jak dotarto do ekranu, co pominięto).

## Narzędzie `scripts/openbot-probe/` (nasz kod)

- `probe.ts`: łączy się przez CDP, przechodzi po ekranach klikając tylko to, co pozwala polityka, pisze wyniki **poza repo** (odmawia `--out` w repo). Budżety: ekrany, kliknięcia, minuty. Nowy ekran = nowe drzewo dostępności (liczby i stan wyboru ignorowane). Jedyne, co wpisuje: zmyślony e-mail i kod do zastępnika (`--stub-login`) oraz jeden zmyślony opis agenta w kopii (`--create-agent`); obie opcje są domyślnie wyłączone.
- `policy.ts` (**testowana**): nigdy nie klika logowania, płatności, wysyłania, instalacji, aktualizacji, pobierania, usuwania, czyszczenia, kopiowania, importu/eksportu, zamykania programu, zgód, linków wychodzących (warunki, polityka, pomoc, dokumentacja), przełączników i pól wyboru (to ustawienia, nie ekrany), elementów wyłączonych. Słowa po angielsku i po polsku, dopasowanie od początku słowa (po stronie ostrożnej: „Pomocnik” też jest pominięty).
- `capture.ts`, `page-scripts.ts` (skrypty uruchamiane w stronie, tylko odczyt), `summarize.ts` (podsumowania stylów i tokenów), `stub-account-service.ts`, `README.md` (jak uruchomić, zasady).
- Testy: `policy.test.ts` 9 i `summarize.test.ts` 5 (14/14, jednostkowe, bez Electrona). Biome czysty, `typecheck:node` zielony. Jedna zmiana w pliku wspólnym: `allowImportingTsExtensions` w `tsconfig.node.json` (Node uruchamia pliki `.ts` z importami z rozszerzeniem; tylko do typecheck, bez wpływu na build).

## Jak to poszło (uczciwie)

1. Start kopii wymagał trzech poprawek: cudzysłów wokół ścieżki ze spacją **wewnątrz** argumentu (inaczej Chromium nie tworzy pliku blokady), nowy folder danych na każdy start (po skasowaniu folderu tuż po zabiciu kopii był „disk I/O error”), nowy port po każdym zabiciu (stary bywa jeszcze zajęty).
2. Zastępnik musiał odpowiadać na pytania programu, które wykryłem z jego logów i kodu: start/weryfikacja kodu (kod ma **8 znaków** i nie przyjmuje cyfr `0` i `1`), `GET /v1/me`, lista serwerów hostowanych (pole `available` jest wymagane, inaczej ekran „Otwieranie OpenBot…” wisi bez końca) i lista hostów zdalnych. Pozostałe adresy dostają 404 i są w logu.
3. Pierwszy przebieg kliknął „Warunki korzystania” i „Pokaż szczegóły” zanim dodałem zakaz linków wychodzących. **Mógł otworzyć stronę warunków w przeglądarce systemowej właściciela** (tego nie sprawdzałem; nic innego poza tym nie wychodzi poza program, polityka pomija takie przyciski). Kopia sama pobierała „OpenCode” (własny mechanizm programu, w piaskownicy) i raz zgłosiła „disk I/O error” przy starcie.
4. Utworzyłem w kopii **jednego agenta** („Szef”) z domyślnymi wyborami, żeby dojść do ekranów agenta. Model „Claude” nie jest pobrany, więc czatu z odpowiedziami nie widać.

## Czego nie sprawdziłem / czego tu nie ma

1. **Motywu jasnego** (aplikacja pokazuje tylko ciemny; wymuszenie jasnego przez system nic nie zmienia; przełącznik w ustawieniach nie sprawdzony).
2. **Rozmów z wiadomościami** (bez dostawcy), **stanów błędów**, **animacji**, **długich przewijanych stron**, **innych rozmiarów okna**, **okien innych niż główne** (wyspa, dok, osobne okna).
3. Wszystkiego, co wymaga prawdziwego konta lub działania na zewnątrz (połącz aplikację, pobierz CLI, zaktualizuj, wyloguj, Mobile Connect, loginy). Ich nazwy i miejsca są w `controls.json`/`index.md` jako „pominięte”.
4. Czy kopia nie wysłała **nic poza loopback** poza własnym pobieraniem OpenCode i ewentualnym sprawdzeniem sieci: ruchu nie mierzyłem.
5. Że ekrany są **kompletne**: sonda idzie za tym, co widać i co wolno kliknąć, w budżecie czasu (20–25 min na przebieg). Zakładki wewnątrz ekranów mogą mieć stany, których nie otwarła.
6. Że podsumowania stylów to cała prawda o wyglądzie: liczą elementy z tekstem, ramką lub tłem, nie stany `hover`/`focus`/`active`.

## Co dalej (propozycja)

1. UI Designer: `INDEKS.md` → plan ekranów; `DESIGN-SUMMARY.md` i `TOKENS.md` do porównania z naszym `ui-foundation` (liczby: 14/16/13/12 px, promienie 8/12/999, akcent, ruch 150/250 ms). Własne teksty i grafiki, bez kopiowania.
2. Tester: `texts.json` i `controls.json` do uzupełnienia listy funkcji (czego u nas brakuje); stany `hover`/`focus` i motyw jasny to kolejna porcja sondy (dodać przełączanie motywu i stany, ok. 1–2 h).
3. Odświeżanie po aktualizacji programu: `README.md` w `scripts/openbot-probe/`.
4. W9-BE1 (telefon) jest już gotowe na `team/backend/w9-be1` @ `f31b58abe` (kontrakt jako pierwszy commit `731f41c2d`, poprawka botId `918cf7a8d`).

## Konflikty przy scalaniu

Praktycznie brak: nowy folder `scripts/openbot-probe/`, `tsconfig.node.json` (1 linia), `COSGRAL-CHANGES.md` (wiersz), ten raport.
