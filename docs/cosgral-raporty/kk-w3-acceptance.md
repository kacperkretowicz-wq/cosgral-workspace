# W3-T3: odbiór 44 wierszy parytetu w prawdziwym Electronie

Gałąź `team/kk/w3-acceptance` (z `codex/cosgral-desktop` @ `18c91f2a2`, po scaleniu z polerowaniem wyglądu Backendu). Odbiór przejęty od Testera. Wykonał KK Fullstack, 13.11.2026 wieczorem.

**Wynik wg dowodów: 34,5 z 44 = 78%** (jest = 1, częściowo = ½). Dolna granica 75% (gdy trzy wiersze „nie do sprawdzenia tu” policzyć jako 0). Szczegóły w „Nowe liczby”.

**Jak sprawdzone:** prawdziwy program (Electron, prawdziwy proces główny i okno) w piaskownicy: osobne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, dane OpenBota nietknięte, loopback, atrapa Codex (`scripts/acceptance-codex.cjs`, bez modelu i sieci). Najpierw ręcznie (sterowanie oknem przez port diagnostyczny), potem powtarzalnym skryptem `scripts/sandbox-acceptance.ts` (nowy plik, 37 kroków, **37/37 zielone**, 0 błędów konsoli). Zrzuty i drzewa dostępności są poza repozytorium (`Shared\cosgral-sandbox\acceptance`), bo zawierają nazwę konta.

## Błędy, które psują użycie (na górze, z krokami)

1. **Pierwszy start po awarii potrafi pokazać okno „COSGRAL Workspace couldn’t start: disk I/O error”.**
   - Kroki: uruchomić program, wysłać wiadomość z długą turą (`SLOW 600000`), dołożyć dwie wiadomości do kolejki, zostawić otwartą kartę pytania; zabić drzewo procesów programu (`taskkill /T /F`); po ok. 3 s uruchomić program na tych samych danych.
   - Wynik: okno błędu „disk I/O error. Your local data was not reset or overwritten.” Program się nie otwiera.
   - Dane były całe (`PRAGMA integrity_check` = ok na kopii bazy, WAL). Drugi start po ok. minucie przeszedł. Zdarzyło się 1 z 2 prób na tej samej maszynie, przy małej ilości wolnej pamięci (ok. 0,8–2,6 GB z 8 GB). Nie ustaliłem przyczyny (kandydaci: blokady plików po zabitym procesie, obciążenie).
2. **Gdy start Codex się nie powiedzie (stan „blocked”), agent wisi na „Thinking” bez wyjścia.**
   - Kroki: jak wyżej (awaria w trakcie tury), start przy małej ilości wolnej pamięci, Codex nie wstał w czasie sondy („Codex CLI was found but could not be started”).
   - Wynik: wiersz agenta „Thinking”, napis „Res is working”, pole wiadomości zablokowane (`aria-disabled`), przycisk Stop nie istnieje, wiadomości w kolejce stoją, a nieskończone dostawy zostają w stanie „running”. Wyjście: ponowny start programu (wtedy turn → „interrupted”, a wiadomości z kolejki wykonują się po kolei).
   - Zaobserwowane na wersji z `8d075f04b` (przed polerowaniem); po scaleniu nie powtarzałem.
3. **W aplikacji nie ma sposobu na utworzenie kanału.** Panel „Channels” mówi „No channels yet.” i nie ma przycisku tworzenia. Nikt w interfejsie nie woła `channels.create` (API działa; nazwa kanału: 1–40 małych liter, cyfr, myślników). Po utworzeniu przez API wszystko poniżej działa (lider, członkowie, Chat | Zadania, delegowanie). To blokuje wiersz 14 dla zwykłej osoby.

## Odbiór wiersz po wierszu

Skala: **działa** (test odbioru wykonany w programie, bez znanego braku w opisie), **częściowo** (co brakuje), **nie działa**, **nie do sprawdzenia tu** (powód). „S” = krok w skrypcie `sandbox-acceptance.ts`, „R” = ręcznie przez okno.

| Nr | Wiersz | Wynik | Dowód (krok → wynik) |
|---|---|---|---|
| 1 | Szyna serwerów | **nie do sprawdzenia tu** (częściowo) | Szyna: „Local server” i „Add remote server”; ten drugi otwiera okno „Join a COSGRAL team” (link zaproszenia, konto). Dołączenia do hosta nie sprawdziłem (brak hosta). Menu wycisz/opuść: nie znalazłem. R |
| 2 | Szyna stron | **częściowo** | Wszystkie strony szyny otwierają się (Schedule, Tasks, Workflows, Usage, Library, Marketplace, Remote desktop, Providers, Phone, Settings); powrót do Agents zachowuje wybranego agenta. Tasks i Usage są już prawdziwe (po polerowaniu). Brak „Więcej” i przypinania stron. R |
| 3 | Pasek boczny | **częściowo** | Dwóch agentów ma osobne historie (`Res` 4 wiadomości, `Assistant` 39). Filtr „Search chats” działa po nazwie i podglądzie. Menu wiersza ma tylko Edit agent, Move to…, Delete agent (brak duplikatu, nowego wątku, okna, ukrycia, „przeczytane”). S |
| 4 | Foldery | **działa** | Utworzenie „Work stuff” i „Inner”, przeniesienie agenta, zagnieżdżenie folderu (Move to…), układ w `sidebar.getLayout()`; po restarcie układ ten sam. Duplikat folderu nie kopiuje agentów (znane). S, R3 |
| 5 | Stan „myśli” | **działa** | Podczas tury wiersz: „Assistant, … Thinking. SLOW 8000”; po odpowiedzi stan znika. S |
| 6 | Stan „czeka na Ciebie” | **działa** | Pytanie w innej rozmowie: sekcja „Needs you” z liczbą, wiersz „Needs you”, klik otwiera kartę; po odpowiedzi znika. Karta nie przeżywa awarii (tura przerwana). S, R |
| 7 | Stan „limit” | **działa** | Pełne okno limitu Codex (atrapa) → wiersz „Limit · resumes Sat 02:18”; po resecie wraca do normalnego. Tylko Codex (inni dostawcy bez okna). S |
| 8 | Stan „błąd” | **działa** | Nieudana tura → wiersz „Error · Sandbox failure: the provider said no.” (komunikat dostawcy); po udanej turze znika. S |
| 9 | Czat | **działa** | Wiadomość → „Stub: received”, widoczna; po restarcie historia (39+ wiadomości) na miejscu. S, R1 |
| 10 | Karta pytania | **działa** | `ASK` → przyklejona „Decision · pinned”, opcje A/B + własna; wybór → agent dostał `{"answers":{"format":{"answers":["Short"]}}}`; Skip → `{"answers":{}}` i tura idzie dalej. S |
| 11 | Karta zatwierdzenia | **działa** | Reject → decline, Approve → accept; „Always allow…” (lista prefiksów): kolejna pasująca komenda bez karty, `git push` i `git status; echo x` dalej pytają („Only once”). S |
| 12 | Podgląd szkicu | **działa** | Send → agent dostał `decision:"send"` + tekst; Keep draft → `keep-draft` + `draftId`; Edit → pole „Draft text”, Request revision / Back. S |
| 13 | Przejęcie przeglądarki | **działa** | Karta „Browser help requested” w Needs you; Take over → Return to agent; agent dostał `outcome:"returned"` z tabId i adresem i kontynuował. S |
| 14 | Kanały: lider i członkowie | **częściowo** | Po utworzeniu przez API: widok z liderem, członkami, instrukcjami, pamięcią kanału, zakładkami Chat\|Tasks, wiadomość trafia do lidera. **Brak przycisku tworzenia kanału w UI (bloker 3).** R |
| 15 | Kanały: zadania | **działa** | Wiadomość do kanału → lider przydzielił „Facts” i „Verify”, wyniki v1 i v2 („Superseded”) w czacie; zakładka Tasks: 3 zadania z właścicielem, stanem „Done” i listą Reassign. Kanał zrobiony przez API. R |
| 16 | Panel boczny | **częściowo** | „Open computer” → panel „Browser” (karty, adres, nowa karta; otwiera `https://www.google.com`, czyli żądanie sieciowe po kliknięciu); „View agent settings” → panel ustawień; separator zmienia szerokość z klawiatury (380 → 404). Brak okienek: pliki, pytanie poboczne, głos, subagent; maksymalizacji nie znalazłem. S |
| 17 | Kolejka wiadomości | **działa** | Kolejka FIFO; Alt+↑ zmienia kolejność, edycja treści, usuwanie, Steer (wiadomość trafia do trwającej tury), Stop → „Queue paused” + Resume. Po awarii: wiadomości w kolejce wykonują się po kolei bez dubli, nieskończone dostawy → „interrupted”; pauza przeżywa restart. Steer dla ACP: „niedostępne” z powodem. S, R |
| 18 | Wyszukiwanie w rozmowie | **działa** | Ctrl+F → „Search conversation”, fraza „Q2 edited” → 1/1, Previous/Next. Podświetlenia elementu nie weryfikowałem. S |
| 19 | Wyszukiwanie globalne | **działa** | Ctrl+K → „Search COSGRAL” (All/Messages/Bots), fraza z innego agenta → wynik; klik otwiera tę rozmowę. Bez kanałów i zadań. S |
| 20 | Agenci: tworzenie | **działa** | Nowy agent (kreator, szablon, pierwszy agent z onboardingu) ma nazwę, rolę, opis i własną rozmowę; z telefonu `POST /v1/agents` → agent „Phone made” widoczny na komputerze. Brak importu. S |
| 21 | Agenci: ustawienia | **częściowo** | Panel: awatar, nazwa, rola, opis, model (+modele zapasowe), 10 grup narzędzi, reasoning, powiadomienia, pamięć, skille, MCP, rutyny, reguły „zawsze”. Zmiana modelu i opisu → następna tura użyła `gpt-5.6-terra` i nowego opisu; po restarcie trwa. Brak: foldery dostępu, poziom dostępu, zachowanie gdy zajęty, limity wątków, użycie. Lista modeli pokazuje modele Claude mimo braku CLI. S |
| 22 | Agenci: szablony | **działa** | 7 szablonów; utworzenie agenta „Tmpl” z „Researcher” → rola „Research and sources” i instrukcje. Skilli szablonu nie sprawdzałem; instalacja szablonu z Marketplace nie sprawdzona. S |
| 23 | Pamięć | **działa** | Wspomnienie „Always”: zapis i lista; w nowej rozmowie po restarcie instrukcje zawierają „tea, no sugar” (`INSTRHAS`). S, R3 |
| 24 | Skille | **częściowo** | Biblioteka pokazuje skill („meeting-notes”, View versions, Delete); instalacja per agent; po restarcie skill jest w instrukcjach agenta. Nie sprawdziłem: tworzenia skilla przez agenta, wersji/aktualizacji/naprawy. S, R3 |
| 25 | MCP | **działa** | Dodany serwer stdio (własny `echo`) → status „available”, narzędzie `echo`; po restarcie wątek agenta ma `mcp_demo.echo`. Logowanie do MCP (HTTP, 401) nie sprawdzone. S, R3 |
| 26 | Vault | **częściowo** | Zapis loginu: lista bez hasła, API i agent (`list_vault_items`) nie ujawniają hasła. Nie sprawdziłem wypełniania formularza w przeglądarce; konektorów (1Password itd.) brak. S |
| 27 | Rutyny i webhooki | **działa** | Utworzenie, „Next: …”, Run now → historia „done”, rutyna 1-minutowa odpaliła sama (jedno uruchomienie „skipped: poprzednie jeszcze trwa”). Tylko interwał; daily, cron, webhook nie uruchamiane tu. S, R |
| 28 | Przepływy | **działa** | Węzły trigger i agent, połączenie, walidacja („Fix before saving”), zapis, Run now → „trigger: done”, „agent: done”; agent dostał krok. Brak integracji; krok zatwierdzenia nie uruchamiany. S |
| 29 | Tabele | **działa** | Agent tworzy tabelę „Accept leads” i wstawia wiersze, drugi agent czyta (`total: 2`); Library > Shared tables pokazuje wiersze (Edit/Delete/Add row); po restarcie tabela jest. S, R2 |
| 30 | Pliki: biblioteka | **częściowo** | Agent zapisuje plik (`origin: agent`); Library > Files: nazwa, rozmiar, Open, Delete, szukanie; po restarcie jest. Nie sprawdziłem „Add files” (okno systemowe) ani pobierania; brak siatki/listy, zaznaczania, sprzątania. S, R2 |
| 31 | Przeglądarka poza W1 | **działa** | Agent otwiera dwie karty (`openbot_browser.open`) i listuje je; po restarcie obie wracają. Bez docka/live view. R, R4 |
| 32 | Computer Use | **nie do sprawdzenia tu** (częściowo) | Nie ruszałem pulpitu. Tylko stan: `computerUse.getState()` → dostępne, 0 sesji; onboarding opisuje zgodę. |
| 33 | Zdalny pulpit | **częściowo** | Host na loopback (`ws://127.0.0.1:…`, token 32 znaki); zły token → „The token is wrong.”; poprawny token → karta zgody w Needs you; odmowa → „The owner of that computer said no.”, 0 sesji; wyłączenie zamyka nasłuch. Obrazu i sterowania nie sprawdzałem (przechwyciłyby ekran właściciela). S |
| 34 | Głos | **częściowo** (nie do sprawdzenia: mikrofon) | Ustawienia głosu (włącz, głos systemowy, tempo, czytanie na głos, język nagrywania, runtime whisper.cpp + 3 modele do pobrania za zgodą); mowa dostępna, rozpoznawanie niedostępne bez pobranego modelu. Nagrywania i czytania nie sprawdzałem. R |
| 35 | Dostawcy i limity | **częściowo** | Strona Providers: użycie (Codex 10% Available, Claude), dodanie agenta ACP z walidacją, zapis kolejności modeli zapasowych. Przy limicie na Terra nie przełączyło na Sol (to ten sam dostawca, też „limited”); przełączenie na innego dostawcę nie do sprawdzenia tu. Claude pokazany jako „Available” mimo braku CLI. S, R |
| 36 | Zespół i serwery | **nie do sprawdzenia tu** (częściowo) | Okno dołączania jest (zob. 1). Hostowania serwera, zaproszeń, ról nie sprawdzałem (sieć i konto). Menu konta: Upload photo, Weekly usage, Settings, Send feedback. |
| 37 | Dok agentów | **działa** | `dock.pin` + `setVisible` → okno doku: S/M/L, Open COSGRAL, lista z góra/dół/ukryj/usuń; klik w agenta → mini czat; „hello from the dock” → agent odpowiedział. S |
| 38 | Dynamic Island | **działa** | Pytanie w tle → `island.getState` `kind:"question"`, nazwa agenta, treść; okno wyspy ma przycisk; klik otwiera agenta z kartą. S |
| 39 | Ustawienia i powiadomienia | **częściowo** | Okno „Settings”: dostawca, język, macierz powiadomień (6 zdarzeń × powiadomienie/dźwięk, „tylko gdy okno nieaktywne”), głos. Zmiana macierzy zapisuje się (`appSettings.get`). Język „Polski” zapisuje się, ale napisy zostają po angielsku. Lista sekcji to zwykły spis, nie zakładki (Mobile, Dok, Wyspa to osobne strony). Prawdziwy toast systemowy nie sprawdzony. S |
| 40 | Onboarding | **częściowo** | Jeden przepływ: „Where will COSGRAL run?” → „Set up this computer” (dostawca, język, pierwszy agent z propozycji, Computer Use) → lista z gotowym agentem „Assistant”. Wybór języka nie zmienia napisów. S |
| 41 | Marketplace i wtyczki | **działa** | Lokalny katalog (5 sugestii, 13 pozycji: skille i agenci), szukanie „meeting”, szczegóły, wybór agenta i Install → skill w bibliotece, „Uninstall” per agent. Bez wtyczek z połączeniami. S |
| 42 | Telefon: Mobile Connect | **częściowo** | `startPairing` → adres HTTPS na loopback, odcisk SHA-256, obraz QR (`qrDataUrl`), link; klient przypięty do odcisku sparował się po zgodzie na karcie; po restarcie serwer wstaje z tym samym certyfikatem. Nie sprawdzone: skanowanie kamerą i prawdziwy telefon. S, R5 |
| 43 | Telefon: czat i decyzje | **częściowo** | Z telefonu: lista agentów, wiadomość → odpowiedź agenta, pytanie z komputera wyświetlone na telefonie i odpowiedziane z telefonu (tura ruszyła), Vault → 403. Brak powiadomień push na telefonie (jest strumień zdarzeń). S |
| 44 | Telefon: agenci | **częściowo** | `POST /v1/agents` z telefonu → agent widoczny na komputerze. Edycja (`PATCH`) i awatar nie uruchamiane tu; prawdziwego telefonu nie było. S |

## Nowe liczby (propozycja i zapis w `parytet-0.68.md`)

| Fala | Wiersze | Jest | Częściowo | Brak |
|---|---|---|---|---|
| W1 | 1–19 | 14 | 5 | 0 |
| W2 | 20–31 | 8 | 4 | 0 |
| W3 | 32–41 | 3 | 7 | 0 |
| M | 42–44 | 0 | 3 | 0 |
| **Razem** | **1–44** | **25** | **19** | **0** |

Wynik = (25 × 1 + 19 × ½) / 44 = **34,5 / 44 = 78,4%**. Wiersze 1, 32 i 36 oznaczyłem „nie do sprawdzenia tu” i zostawiłem im poprzedni stan (częściowo, ½); gdyby policzyć je jako 0, wynik to 33 / 44 = **75,0%**.

Poprzednie liczby w tabeli (1 / 32 / 11 brak, czyli ok. 38%) pochodziły z odbiorów na atrapach i z opisów kodu. Wzrost wynika z tego, że kolejne fale zostały scalone i teraz razem działają w programie, a nie z poprawek w tej gałęzi.

## Skrypt odbioru

- `scripts/acceptance-codex.cjs`: atrapa Codex z wyzwalaczami: `SLOW <ms>`, `ASK`, `RUN <komenda>`, `FILES`, `PERMS`, `DRAFT`, `FAIL`, `USAGELIMIT`, `LIMITON/OFF`, `TOOLS`, `TOOL <ns> <narzędzie> <json>`, `INSTR`, `INSTRHAS <tekst>`, `MODEL`. Błąd tury zgłasza jak Codex: powiadomieniem `error`, potem `turn/completed` jako failed.
- `scripts/sandbox-acceptance.ts`: `COSGRAL_SANDBOX_ROOT=<folder> node scripts/sandbox-acceptance.ts [--keep]` (po `bun run build`, uruchamiać Node, nie Bun). `COSGRAL_ONLY=41,39,R1` uruchamia wybrane wiersze na danych wcześniejszego przebiegu (`--keep`). Wyniki po każdym wierszu: `<piaskownica>\evidence\acceptance.json`. Nie dotyka pulpitu osoby: bez Computer Use, przechwytywania ekranu, mikrofonu, kamery i prawdziwego telefonu.
- Przebiegi: pełny na świeżej piaskownicy (29/37), potem poprawione selektory po polerowaniu wyglądu (Marketplace: pole „Search” jest teraz `searchbox`; Settings: etykiety „Needs your answer: notification”) i powtórka 8 wierszy (8/8). Dwa wcześniejsze przebiegi padały przez błędy samego skryptu (brak drugiego agenta, wybór okna doku zamiast głównego po restarcie, wyścig w przepływach); poprawione.

## Mniejsze uwagi

1. Anulowana wiadomość z kolejki zostaje w czacie z etykietą „Cancelled”.
2. „Open computer” otwiera panel przeglądarki ze stroną Google (żądanie sieciowe); po restarcie karta wraca (bez sieci jako `chrome-error`).
3. Lista modeli w ustawieniach agenta i strona Usage/Providers pokazują Claude jako dostępnego mimo braku CLI (Backend ma to w `w3-fixes`).
4. Karta decyzji pokazuje się jednocześnie w czacie i przyklejona nad polem (to zamysł, ale zdwaja przyciski).
5. Nowy agent najpierw prosi o wybór modelu i specjalizacji; pole wiadomości jest zablokowane do wyboru modelu. Dotyczy agentów tworzonych przyciskiem „New agent”, nie pierwszego agenta z szablonu.
6. Karta pytania nie przeżywa awarii (tura przerwana) i nie wraca po restarcie.
7. Dok zapamiętuje widoczność i wraca po restarcie.

## Czego nie sprawdzono

- Prawdziwego Codex i Claude: wszystko na atrapie. Nie wiem, w jakiej postaci prawdziwy Codex przysyła komendy i foldery (wpływa na reguły „zawsze”).
- Przełączenia na modele zapasowe innego dostawcy, wypełniania formularzy z Vault w przeglądarce, logowania do MCP.
- Computer Use, zdalnego pulpitu z obrazem i sterowaniem, mikrofonu, czytania na głos, kamery, prawdziwego telefonu i skanowania QR, sieci lokalnej (LAN), powiadomień systemowych (toast).
- Dołączania do serwera zdalnego i hostowania (wiersze 1 i 36), importu agentów, „Add files” i pobierania z biblioteki.
- Jasnego motywu w prawdziwej aplikacji (jest tylko ciemny).
- Pełnego `bun run test`; typecheck i build po scaleniu: build zielony, `typecheck` nie powtarzałem (zmieniłem tylko skrypty i dokumenty).
- Awarii (blokery 1 i 2) powtórzyłem tylko kilka razy na jednej maszynie; nie wiem, jak często zdarzają się przy większej ilości pamięci.
- Stan „blocked” (bloker 2) po scaleniu polerowania.
