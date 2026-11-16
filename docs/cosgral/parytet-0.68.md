# Parytet 0.68 — W1 + W2/W3/M (B2a + B2b)

Stan: 16.11.2026 (odbiór W4-T5 na integracji `4111f0e30`: 27 jest, 17 częściowo, 0 brak = 35,5 z 44, czyli 80,7%; wiersz 24 przeszedł z „częściowo” na „jest”, wiersze 26, 30 i 35 zostają „częściowo” z nowymi dowodami; poprzednio W4-T2: 35 z 44 = 79,5%). Baza COSGRAL = OpenBot 0.1.11 (`a6fe240`, opis w `package.json`). Opis zachowania 0.68: własnymi słowami, bez fragmentów kodu i bez kopiowania tekstów UI.

**Źródła:** mapa UX 0.67.1 (`docs/cosgral-raporty/claude-k-openbot-ux-map.md` na `codex/cosgral-workspace`), publiczny [README 0.68](https://github.com/nightly-labs/openbot/blob/v0.68.0/README.md) i [changelog v0.68.0](https://github.com/nightly-labs/openbot/releases/tag/v0.68.0), statyczna lista paczki `app.asar` (8250 wpisów + nazwy chunków; B2b: `Shared\cosgral-data\desktop-tester\rea-0.68-b2b`), kod worktree `desktop-tester` @ `codex/cosgral-desktop` `5934131e3`. REA CLI: timeout 600 s w B2a (6502 pliki, pusty wynik) → B2b nie powtarza tej samej próby; obowiązuje fallback statyczny.

**Legenda stanu (kolumna):** jest = pokryte end-to-end w bieżącym COSGRAL · częściowo = zalążek / brakuje stanów · brak = nie ma odpowiednika. Istnienie pliku nie dowodzi pełnej funkcji. **Odbiór W1-T2** (UI/rdzeń): `docs/cosgral/odbior-runda1.md` + `docs/cosgral-raporty/tester-w1-odbior.md`. **Odbiór W1-T3** (silnik kanałów/kart, API): `docs/cosgral-raporty/tester-w1-t3-odbior.md`. **Odbiór W2-T2** (pamięć, API): `docs/cosgral-raporty/tester-w2-t2-pamiec.md` @ `08e8cbbe4`. **Odbiór W2-T3** (skille + MCP, API): `docs/cosgral-raporty/tester-w2-t3-skille-mcp.md` @ `8de3a8380`. **Odbiór W2-T4** (Vault + rutyny/webhooki, API): `docs/cosgral-raporty/tester-w2-t4-vault-rutyny.md` @ `ad9a6a5b6`.

## W1 — nawigacja, czat, kanały, panel, kolejka, wyszukiwanie

| Nr | Obszar | Zachowanie 0.68 (własnymi słowami) | 0.1.11: stan / dowód | Fala | Test odbioru: kroki → wynik |
|---|---|---|---|---|---|
| 1 | Nawigacja · szyna serwerów | Skrajnie po lewej widać ten komputer oraz serwery zdalne/hostowane; można je wybierać, dopinać, wyciszać, ustawiać, opuszczać i przestawiać kolejność. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): nie do sprawdzenia tu (brak hosta): szyna ma „Local server” i okno „Join a COSGRAL team” (link zaproszenia); przełączenie na zdalny serwer i menu wycisz/opuść nie sprawdzone. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Dodać serwer zdalny i przełączyć lokalny ↔ zdalny → aktywny serwer zmienia kontekst listy agentów. |
| 2 | Nawigacja · szyna stron | Obok szyny serwerów jest szyna stron (Agenci, Harmonogram, Zadania, Przepływy, Użycie, Biblioteka, Marketplace, Ustawienia, Więcej, przypinanie). | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): wszystkie strony szyny otwierają się (Tasks i Usage prawdziwe po polerowaniu), powrót do Agents zachowuje agenta; brak „Więcej” i przypinania. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Otworzyć Harmonogram, wrócić do Agentów → stan listy agentów zachowany. |
| 3 | Nawigacja · pasek boczny | Lista agentów i kanałów; klik otwiera rozmowę; sekcja osób; wyszukiwanie na liście; menu wiersza (edycja, duplikat, nowy wątek, okno, ukryj, usuń, przeczytane). | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): osobne historie agentów, filtr po nazwie i podglądzie; menu wiersza tylko Edit/Move/Delete (brak duplikatu, nowego wątku, okna, ukrycia, „przeczytane”). Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Wybrać dwóch agentów kolejno → każdy ma własną historię. |
| 4 | Nawigacja · foldery | Użytkownik tworzy foldery (także zagnieżdżone), przenosi agentów/kanały, duplikuje i zmienia nazwę folderu. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): foldery: utworzenie, zagnieżdżenie, przeniesienie agenta, układ po restarcie ten sam; duplikat folderu nie kopiuje agentów. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Utworzyć folder, wrzucić agenta, zagnieździć folder → po restarcie układ ten sam. |
| 5 | Nawigacja · stan „myśli” | Wiersz agenta pokazuje, że agent właśnie pracuje (myśli / analizuje). | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): wiersz „Thinking” w trakcie tury, znika po odpowiedzi. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Wysłać wiadomość → w pasku widać stan pracy, po odpowiedzi znika. |
| 6 | Nawigacja · stan „czeka na Ciebie” | Wiersz (i zbiorczo Needs you) pokazuje oczekiwanie na pytanie, zatwierdzenie albo przejęcie przeglądarki. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): sekcja Needs you z liczbą, klik otwiera kartę, po odpowiedzi znika; karta nie przeżywa awarii (tura przerwana). Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Agent zada pytanie poza otwartą rozmową → w Needs you widać go z liczbą; klik otwiera kartę. |
| 7 | Nawigacja · stan „limit” | Wiersz pokazuje czekanie na limit użycia z godziną resetu. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): pełne okno limitu Codex → „Limit · resumes …” na wierszu, po resecie znika (tylko Codex). Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Symulować limit → wiersz pokazuje limit i czas; po resecie wraca do normalnego stanu. |
| 8 | Nawigacja · stan „błąd” | Wiersz pokazuje, że ostatnia praca padła błędem (widać to bez otwierania czatu). | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): nieudana tura → „Error · <komunikat dostawcy>” na wierszu, znika po udanej turze. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Wywołać błąd dostawcy → wiersz pokazuje błąd; po udanej turze znika. |
| 9 | Czat · rozmowa | Rozmowa pokazuje wiadomości człowieka i agenta, wątki, bogaty tekst, załączniki; historia zostaje po restarcie. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): wiadomość → odpowiedź, historia po restarcie na miejscu. W4-T1 (15.11.2026): chat potwierdzony też z prawdziwym Claude CLI 2.1.325 („OK” w 9 s) i prawdziwym Codex (Backend, 6 s). Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Wysłać wiadomość → odpowiedź widoczna i zachowana po restarcie. |
| 10 | Czat · karta pytania | Agent zadaje 1–3 pytania z opcjami (i własną odpowiedzią); bez odpowiedzi tura czeka. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): przyklejona Decyzja: wybór opcji i Skip dochodzą do agenta, tura idzie dalej. W4-T1: karta pytania z prawdziwym Claude (narzędzie pytające, odpowiedź przez okno, potem „OK” w 5 s) i prawdziwym Codex. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Agent pyta z opcjami → wybór wraca do agenta; pominięcie też kończy kartę. |
| 11 | Czat · karta zatwierdzenia | Agent prosi o zgodę na polecenie, zmianę plików albo uprawnienia; Zezwól / Odrzuć (i warianty „zawsze”). | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): Reject/Approve + „Always allow…” (prefiks komendy): pasująca komenda bez karty, inna i łańcuchowa dalej pytają. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Agent prosi o komendę → odmowa zatrzymuje, zgoda kontynuuje. |
| 12 | Czat · podgląd szkicu | Przed wysłaniem w imieniu użytkownika widać kartę z podglądem szkicu (np. wiadomość); Send / Edit / Keep draft. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): Send, Keep draft i Edit (pole tekstu, Request revision) dochodzą do agenta lub karty. W4-T1: karta zgody/szkicu (`cosgral_cards.confirm`) z prawdziwym Claude (decyzja Send, potem „OK” w 7 s) i prawdziwym Codex. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Agent pokazuje szkic → Send wysyła, Edit wraca do edycji, Keep draft zostawia bez wysyłki. |
| 13 | Czat · przejęcie przeglądarki | Gdy strona wymaga człowieka (logowanie, CAPTCHA itd.), pojawia się karta przejęcia; po oddaniu agent wraca do tej samej sesji. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): karta „Browser help requested”: Take over → Return to agent, agent dostał outcome returned i kontynuował. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Agent utknie na logowaniu → człowiek przejmuje, oddaje → agent kontynuuje tę samą kartę. |
| 14 | Kanały · lider i członkowie | Kanał ma nazwę, tytuł, instrukcje, członków-agentów i lidera; historia wspólna; stop / wznowienie / przejęcie pracy. | Jest — odbiór W4-T2 (15.11.2026, integracja `70bd42747`, prawdziwy program w piaskownicy z atrapą Codex, krok 14 w `scripts/sandbox-acceptance.ts`, pełny przebieg 38/38): kanał utworzony w oknie „Nowy kanał” z liderem i dwoma agentami (wybór lidera i członków), edycja tytułu, wiadomość człowieka w kanale → lider przydzielił zadania obu członkom i oba kończą „Done” (członkowie dostali wiadomość), odpowiedź na wiadomość z powiązaniem w silniku, na stronie Tasks Pause → Resume → Stop zadania zatrzymanego w trakcie pracy. Wcześniej (W3-T3): lider, członkowie, instrukcje, pamięć kanału, Chat|Tasks, Reassign przez API. Nie sprawdzone w oknie: przejęcie zadania innym członkiem (Reassign) i kanał na prawdziwym modelu z dwoma członkami (W4-T1: tylko lider-członek na Claude). Raport: `docs/cosgral-raporty/kk-w4-g1.md`. | W1 | Utworzyć kanał z liderem i dwoma agentami → wiadomość człowieka widzą wszyscy członkowie. |
| 15 | Kanały · zadania | Wiadomość człowieka staje się zadaniem z właścicielem, stanem i wynikiem; można przydzielać, przenosić, zatrzymywać, wznawiać, archiwizować. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): lider przydzielił zadania członkom, wyniki v1/v2 w czacie, zakładka Tasks z właścicielem, stanem Done i Reassign (kanał z API). W4-T1: kanał z liderem kończy „Done” na atrapie (naprawa W4-BE2, krok w `sandbox:e2e`) i z prawdziwym Claude (lider jest też członkiem: zadanie „done”, wynik „OK” w 8 s). Delegowanie do innego członka na prawdziwym modelu nie sprawdzone. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Przydzielić zadanie agentowi → w Zadaniach widać właściciela i stan; wynik wraca do kanału. |
| 16 | Panel boczny | Przy rozmowie otwiera się panel z okienkami (przeglądarka, pliki, ustawienia agenta, pytanie poboczne, głos, subagent); da się go zmienić rozmiarem i zmaksymalizować. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): panele Browser i ustawień agenta, zmiana szerokości z klawiatury; brak okienek pliki/pytanie poboczne/głos/subagent i maksymalizacji. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Otworzyć przeglądarkę i ustawienia agenta → panel zmienia rozmiar i nie gubi stanu przy przełączeniu. |
| 17 | Kolejka wiadomości | Wiadomości wysłane w trakcie pracy czekają w kolejce FIFO; da się je edytować, usuwać, przestawiać, kierować (steer) i wznawiać; kolejka przeżywa awarię. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): FIFO, edycja, usuwanie, Alt+↑, Steer, Stop → Resume; po awarii kolejka wykonuje się po kolei bez dubli; Steer dla ACP „niedostępne” z powodem. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Wysłać dwie wiadomości podczas pracy → wykonują się kolejno; po restarcie kolejka nadal tam jest. |
| 18 | Wyszukiwanie · w rozmowie | Wyszukiwarka w czacie prowadzi do kolejnych trafień w tej rozmowie. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): Ctrl+F: „Search conversation”, trafienie 1/1, Previous/Next. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Wyszukać unikalny tekst → podświetlenie i skok do właściwej wiadomości. |
| 19 | Wyszukiwanie · globalne | Globalne wyszukiwanie po rozmowach i agentach otwiera właściwy wątek. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): Ctrl+K: fraza z innej rozmowy → wynik → otwiera tę rozmowę; bez kanałów i zadań. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W1 | Wyszukać unikalną frazę z innej rozmowy → otwiera tę rozmowę na wiadomości. |

## Współpraca UI (Needs you) — zachowanie 0.68

Agent jest „czeka na Ciebie”, gdy otwarta jest nierozstrzygnięta karta pytania, zatwierdzenia albo prośba o przejęcie przeglądarki w tej rozmowie. Ten stan widać na wierszu agenta i w zbiorczej sekcji Needs you na górze listy (z liczbą). Klik w Needs you otwiera rozmowę już przewiniętą do tej karty. Stan znika dopiero po odpowiedzi, pominięciu pytań, decyzji zatwierdzenia albo zakończeniu przejęcia — nie znika samym odczytaniem czatu.

## Współpraca UI (przyklejona Decyzja) — zachowanie 0.68

Nad polem wpisywania widać przyklejoną Decyzję: najstarszą otwartą kartę pytania lub zatwierdzenia w tej rozmowie. Pasek zostaje widoczny przy przewijaniu historii. Po decyzji (odpowiedź / pomiń / zezwól / odrzuć) pasek znika od razu; jeśli czeka kolejna karta, pojawia się następna najstarsza. Samo przewinięcie albo odczytanie wiadomości nie zamyka Decyzji.

## Współpraca UI (Chat \| Zadania) — zachowanie 0.68

W kanale jest przełącznik Chat | Zadania w tej samej rozmowie (bez zmiany kanału). Chat to oś wiadomości. Zadania to lista przydziałów: kto jest właścicielem, stan (kolejka / w toku / czeka / wynik / zatrzymane), oraz akcje Stop, Resume, Reassign, Archive, Restore. Przełączenie zachowuje kontekst kanału i otwarte karty Decyzji. Lista zadań pokazuje też zadania zatrzymane i pozwala je wznowić albo przydzielić ponownie.

## Podsumowanie liczb

### Według fali

| Fala | Wiersze | Jest | Częściowo | Brak |
|---|---|---|---|---|
| W1 | 1–19 | 15 | 4 | 0 |
| W2 | 20–31 | 9 | 3 | 0 |
| W3 | 32–41 | 3 | 7 | 0 |
| M | 42–44 | 0 | 3 | 0 |
| **Razem** | **1–44** | **27** | **17** | **0** |

**Wynik (jest = 1, częściowo = ½): 35,5 z 44 = 80,7%.** Wiersze 1, 32 i 36 są „nie do sprawdzenia tu”: zostawiono im poprzedni stan (częściowo); gdyby policzyć je jako 0, wynik to 34 z 44 = 77,3%. Źródło: odbiór W3-T3 w prawdziwym Electronie (skrypt `scripts/sandbox-acceptance.ts`, 37/37 kroków), raport `docs/cosgral-raporty/kk-w3-acceptance.md`. Liczby z odbiorów na atrapach i API, które były tu wcześniej (1 / 32 / 11), zastąpiono wynikiem z uruchomionego programu.

**Po W4 (odbiór W4-T1, 15.11.2026):** skrypt odbioru 37/37 i `sandbox:e2e` 22/22 na integracji `5971de823`; test połączeń z prawdziwym Claude CLI 4/4 tur (`sandbox:real-claude`) i z prawdziwym Codex 4/4 (Backend, `sandbox:real-codex`). Żaden wiersz nie zmienił stanu: W4 naprawiło błędy rdzenia (kanał „Done” na atrapie, start CLI bez zawieszenia, „disk I/O error”, jeden stan dostawcy), a nowe funkcje (okno „Nowy kanał”, odpowiedź w kanale) czekają na scalenie. Liczba 34,5 z 44 (78,4%) pozostaje. Raport: `docs/cosgral-raporty/kk-w4-verify.md`.

**Po W4 (odbiór W4-T2, 15.11.2026):** integracja `70bd42747` (W4-BE, W4-H1/H1b, W4-UI1, W4-T1, W4-UI2): skrypt odbioru 38/38 (37 wcześniejszych kroków bez zmiany selektorów po przebudowie kontrolek w W4-UI2 + nowy krok wiersza 14) i bramka G1: `check:ui`, `lint`, `typecheck`, `test` (207 plików, 1326 testów), `test:api`, `test:browser`, `api:build`, `build-storybook`, `build` zielone; `test:storybook` i `test:visual` czerwone tylko dlatego, że na tym komputerze nie ma przeglądarek Playwright. Jedyna zmiana stanu: wiersz 14 → jest (26 jest, 18 częściowo = 35 z 44 = 79,5%). Raport: `docs/cosgral-raporty/kk-w4-g1.md`.

**Po W4 (odbiór W4-T5, 16.11.2026):** integracja `4111f0e30` (G1 zielone): skrypt odbioru z nowymi krokami wierszy 24, 26, 30 i 35 (30b, 26b, 24b, 24c, 35b oraz R2b i R3b po restarcie) w prawdziwym oknie. Wiersz 24 → jest; wiersze 26, 30 i 35 zostają częściowo, bo opisane w nich elementy (konektory Vault, siatka i zaznaczanie plików, wiele kont dostawcy) nadal nie istnieją albo nie były sprawdzone. Liczba: 27 jest, 17 częściowo = 35,5 z 44 (80,7%). Raport: `docs/cosgral-raporty/kk-w4-rows.md`.

### Według obszaru (skrót)

| Obszar | Jest | Częściowo | Brak |
|---|---|---|---|
| Nawigacja (W1) | 5 | 3 | 0 |
| Czat i karty (W1) | 5 | 0 | 0 |
| Kanały / panel / kolejka / search (W1) | 4 | 2 | 0 |
| Agenci / pamięć / skille / MCP / Vault (W2) | 4 | 3 | 0 |
| Rutyny / przepływy / tabele / pliki / przeglądarka+ (W2) | 4 | 1 | 0 |
| CU / remote / głos / dostawcy / zespół (W3) | 0 | 5 | 0 |
| Dok / wyspa / ustawienia / onboarding / marketplace (W3) | 3 | 2 | 0 |
| Telefon (M) | 0 | 3 | 0 |

## 10 najważniejszych braków W1

1. Szyna stron — częściowo (W1-UI1); większość stron to Coming soon.
2. Foldery agentów — backend OK (W1-BE1); UI paska w W1-UI2.
3. Needs you / karty po reloadzie okna — backend trzyma, UI gubi (W1-UI3).
4. Stan limitu na wierszu agenta — brak w UI odbioru.
5. Stan błędu na wierszu agenta — brak w UI odbioru.
6. Karta podglądu szkicu w UI — backend OK (W1-T3); UI W1-UI3.
7. Karta przejęcia przeglądarki w UI — backend OK (W1-T3); UI W1-UI3.
8. Widok kanału (lista, lider, historia) — silnik OK; UI W1-UI3.
9. Chat \| Zadania na prawdziwym kontrakcie — silnik OK; UI W1-UI3.
10. Przyklejona Decyzja nad kompozytorem — do W1-UI3.

## 10 najważniejszych braków W2

1. Pamięć — backend OK (W2-T2); brak UI ustawień/przeglądu wspomnień.
2. Skille lokalne + wersje + Marketplace skill install.
3. Panel i połączenia MCP użytkownika.
4. Vault (loginy, karty, kontakty, TOTP) bez sekretów w czacie.
5. Rutyny z harmonogramem i webhookami.
6. Przepływy pracy (płótno).
7. Szablony agentów / instalacja z katalogu.
8. Wspólne tabele między agentami (nie tylko markdown w czacie).
9. Biblioteka plików jako osobna powierzchnia.
10. Trwałość / dock / live view przeglądarki poza podstawowymi kartami W1.

## 10 najważniejszych braków W3

1. Pełny Computer Use na Windows z `cua-driver` (dziś głównie capability + setup Mac).
2. Głos (STT/TTS + hosty).
3. Dostawcy poza Codex/Claude + modele zapasowe i limity w UI.
4. Dok agentów.
5. Dynamic Island / notch.
6. Marketplace agentów i skilli.
7. Macierz powiadomień i pełne zakładki ustawień (Mobile, Dok, Wyspa, …).
8. Onboarding z językiem i pierwszym agentem z propozycji.
9. Role z dostępem per agent + status maszyny hosta.
10. Zdalny pulpit jako produkt Windows (nie tylko Remote Mac).

## Metoda i limity sprawdzenia

- Mapa 0.67.1 i README/changelog 0.68 opisują powierzchnie; nie uruchamiano OpenBota 0.68 pod debuggerem w tym zadaniu.
- Statyczna paczka: 8250 ścieżek w `app.asar`; nazwy chunków W1 m.in. `QuestionPromptBubble`, `UiBlockPrompt`, `QueuePanel`, `GlobalSearch`, `BrowserPreviewSidebar`, `channel-*`, `LibraryPanel`, `WorkflowsPage`.
- REA CLI (`analyze-javascript-application` na `app.asar`): **timeout 600 s** w B2a po fazie „Processing 6502 selected application files”; wynik pusty → B2b używa fallbacku statycznego (lista + chunki), bez drugiej próby 600 s na tym samym celu.
- Testy odbioru z tabeli uruchomiono w W3-T3 (13.11.2026) w prawdziwym programie na atrapie Codex; kolumna stanu odzwierciedla ten odbiór. Wiersze „nie do sprawdzenia tu” (1, 32, 36) i fragmenty opisane w kolumnie nie były sprawdzane.

## W2 — agenci, pamięć, skille, MCP, Vault, rutyny, tabele, pliki, przeglądarka+

| Nr | Obszar | Zachowanie 0.68 (własnymi słowami) | 0.1.11: stan / dowód | Fala | Test odbioru: kroki → wynik |
|---|---|---|---|---|---|
| 20 | Agenci · tworzenie | Tworzy się agenta z imieniem, opisem i przeglądem sekcji; da się importować i zakładać z poziomu desktopu i telefonu. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): agent z nazwą, rolą i opisem (przycisk, kreator, szablon, telefon) ma własną rozmowę; brak importu. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W2 | Utworzyć agenta z nazwą i opisem → pojawia się na liście i ma własną rozmowę. |
| 21 | Agenci · ustawienia | Awatar, kolor, dostawca/model (+ zapasowe), instrukcje z limitem, foldery dostępu, poziom dostępu, zachowanie gdy zajęty, limity wątków, skille, użycie. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): panel ustawień agenta (profil, model + zapasowe, 10 grup narzędzi, reasoning); zmiana modelu i opisu działa po restarcie; brak folderów dostępu, poziomu dostępu, zachowania gdy zajęty, limitów wątków, użycia. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W2 | Zmienić model i instrukcje → kolejna tura używa nowych ustawień po restarcie. |
| 22 | Agenci · szablony | Gotowe szablony (np. poczta, podróż) i instalacja z Marketplace / import. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): 7 szablonów, utworzenie agenta z szablonu z rolą i instrukcjami; skilli szablonu i instalacji z Marketplace nie sprawdzano. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W2 | Zainstalować szablon → nowy agent ma gotowe instrukcje i skille szablonu. |
| 23 | Pamięć | Wspomnienia „zawsze” vs „w razie potrzeby”, wyszukiwanie, ręczne dodawanie, osobna pula per agent i per kanał. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): wspomnienie „Always” trafia do instrukcji nowej rozmowy po restarcie; UI listy i zapisu działa. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W2 | Zapisać wspomnienie „zawsze” → widać je w kolejnej rozmowie bez ponownego podawania. |
| 24 | Skille | Lokalna biblioteka skilli, wersje, aktualizacja/naprawa, instalacja z Marketplace, przypisanie do agenta. | Jest — odbiór W4-T5 (16.11.2026, prawdziwy program w piaskownicy z atrapą Codex, kroki 24b, 24c, R2b, R3b): agent tworzy skill z tekstu SKILL.md (w bibliotece wersja 1, autor = ten agent), instaluje go sobie i poprawia (wersja 2; jego kopia zostaje na wersji 1 i widać dostępną aktualizację); zmieniona lokalnie kopia jest wykrywana, aktualizacja bez zgody jest odrzucona, z nadpisaniem naprawia kopię; biblioteka trzyma 2 wersje, cofnięcie do wersji 1 tworzy wersję 3; drugi agent dodaje ten sam skill, a kopia pierwszego się nie zmienia; po restarcie skill jest w bibliotece i w instrukcjach nowej rozmowy. Wcześniej (W3-T3): biblioteka, instalacja per agent z Marketplace, skill w instrukcjach po restarcie. Nie sprawdzone: skill z plikami dodatkowymi i tworzenie z folderu (`sourcePath`), aktualizacja skilla z Marketplace. Raport: `docs/cosgral-raporty/kk-w4-rows.md`. | W2 | Agent tworzy skill → widać go w bibliotece; drugi agent może go dodać. |
| 25 | MCP | Panel serwerów MCP, połączenie, narzędzia dostępne dla agentów, obsługa logowania do MCP. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): serwer stdio dodany → „available”, narzędzie w wątku agenta po restarcie; logowanie do MCP nie sprawdzone. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W2 | Dodać serwer MCP → agent widzi jego narzędzia w kolejnej turze. |
| 26 | Vault | Loginy, karty, kontakty, klucze API, TOTP; agent bierze element bez ujawniania sekretu w czacie; konektory 1Password/Bitwarden/Proton. | Częściowo — odbiór W4-T5 (16.11.2026, prawdziwy program w piaskownicy z atrapą Codex, krok 26b): login zapisany dla lokalnej strony (loopback); agent otwiera ją w wbudowanej przeglądarce i woła `fill_login`: wartości trafiają prosto do pól, formularz wysłany, strona dostała login i hasło; hasła nie ma w wyniku narzędzia, w rozmowie agenta, na liście Vault, w oknie ani w żadnym pliku profilu piaskownicy (sprawdzone bajtowo). Wcześniej (W3-T3): zapis loginu bez wycieku do UI, API i agenta. Do „jest” brakuje: konektorów 1Password, Bitwarden i Proton (nie ma ich w programie) oraz wypełniania karty, kontaktu, klucza API i TOTP w oknie (są w silniku i testach API, w oknie nie sprawdzane). Raport: `docs/cosgral-raporty/kk-w4-rows.md`. | W2 | Zapisać login → agent prosi o element i wypełnia formularz bez pokazania hasła w czacie. |
| 27 | Rutyny i webhooki | Harmonogram (kalendarz, strefa, następne uruchomienie), webhook z filtrami, historia uruchomień, feed na serwerze. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): utworzenie, „Next”, Run now, historia „done”, rutyna 1-minutowa odpala sama; daily/cron/webhook nie uruchamiane. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W2 | Utworzyć rutynę codzienną → odpala się o wskazanej godzinie i zostawia wynik. |
| 28 | Przepływy pracy | Płótno z węzłami, wyzwalacz, kroki z zatwierdzeniem, wyjścia, integracje. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): płótno: trigger + agent, połączenie, walidacja, zapis, Run now → kroki „done”; brak integracji, krok zatwierdzenia nie uruchamiany. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W2 | Zbudować prosty przepływ z jednym krokiem → uruchomienie kończy się widocznym wynikiem. |
| 29 | Tabele | Wspólne tabele agentów (kto prowadzi, usuwanie dla wszystkich), nie tylko tabela w markdownie czatu. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): tabela utworzona przez jednego agenta czytana przez drugiego, widoczna w Library, po restarcie jest. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W2 | Utworzyć wspólną tabelę → dwóch agentów czyta te same wiersze po restarcie. |
| 30 | Pliki · biblioteka | Biblioteka plików (siatka/lista), zaznaczanie, pobieranie, sprzątanie, pliki maszyny. | Częściowo — odbiór W4-T5 (16.11.2026, prawdziwy program w piaskownicy z atrapą Codex, krok 30b): „Add files” z dysku przez okno wyboru (okno wyboru odpowiedziane z głównego procesu, reszta to kod programu) dodaje plik z poprawnym rozmiarem; „Open” prosi powłokę o otwarcie kopii z biblioteki (treść identyczna z oryginałem); pobranie (`download`) zapisuje identyczną kopię w wybranym miejscu, „reveal” prosi powłokę o pokazanie pliku; po restarcie plik jest. Przycisków Download i Reveal w panelu nie ma (tylko Open, Attach, Delete): pobieranie i pokazywanie działają wyłącznie przez API. Pobieranie w profilu piaskownicy padało na „Failed to get 'downloads' path” (opis w raporcie). Nadal brak: siatki, zaznaczania, sprzątania, plików maszyny; otwarcie przez prawdziwy system nie sprawdzone. Raport: `docs/cosgral-raporty/kk-w4-rows.md`. | W2 | Wrzuć plik do biblioteki → widać go na liście i da się pobrać po restarcie. |
| 31 | Przeglądarka · poza W1 | Trwała przeglądarka, wiele kart, żywy podgląd, zapis zrzutu jako plik, profile, dock przeglądarki. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): dwie karty otwarte przez agenta wracają po restarcie; bez docka i live view. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W2 | Agent otwiera dwie karty → po restarcie sesja/karty wracają albo jasny komunikat o utracie. |

## W3 — Computer Use, zdalny pulpit, głos, dostawcy, zespół, dok/wyspa, ustawienia, onboarding, marketplace

| Nr | Obszar | Zachowanie 0.68 (własnymi słowami) | 0.1.11: stan / dowód | Fala | Test odbioru: kroki → wynik |
|---|---|---|---|---|---|
| 32 | Computer Use | Osobny sterownik `cua-driver` na Windows/macOS/Linux; agent steruje pulpitem poza przeglądarką; setup uprawnień. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): nie do sprawdzenia tu (pulpit właściciela): stan computerUse dostępny, 0 sesji; sterowanie nie uruchamiane. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W3 | Włączyć Computer Use → agent opisuje/klika element poza przeglądarką; Stop kończy sesję. |
| 33 | Zdalny pulpit | Podgląd i sterowanie zdalnym pulpitem hosta (VNC/tunnel), konfiguracja po stronie właściciela. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): host na loopback, zły token odrzucony, karta zgody, odmowa kończy bez sesji, wyłączenie zamyka nasłuch; obraz i sterowanie nie sprawdzane (przechwyciłyby ekran). Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W3 | Połączyć się z hostem → widać pulpit i da się rozłączyć bez zawieszenia. |
| 34 | Głos | Mowa → tekst i tekst → mowa w kompozytorze / panelu; osobne hosty przetwarzania. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): ustawienia głosu, mowa dostępna, whisper.cpp wymaga pobrania modelu za zgodą; nagrywania i czytania na głos nie sprawdzano (mikrofon). Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W3 | Nagrać komendę głosową → pojawia się jako tekst i agent odpowiada. |
| 35 | Dostawcy i limity | Wiele dostawców (Codex, Claude, Grok, Gemini, OpenCode, Cursor, …), konta, modele zapasowe, pierścienie użycia i limity. | Częściowo — odbiór W4-T5 (16.11.2026, prawdziwy program w piaskownicy z atrapą Codex i atrapą agenta ACP, krok 35b): pełne okno limitu Codex przenosi agenta na model zapasowy INNEGO dostawcy: agent odpowiada z agenta ACP (model aktywny `acp:demo-acp`), strona Providers pisze „Assistant is using Demo ACP (ACP) instead of Terra” i pokazuje komunikat o przełączeniu (komunikat tylko gdy strona jest otwarta), po zdjęciu limitu następna wiadomość wraca na własny model. Wcześniej (W3-T3, W4-T1): strona Providers, dodanie agenta ACP, zapis modeli zapasowych, stan dostawcy z jednego źródła; prawdziwy Claude i Codex wstają i odpowiadają. Nie sprawdzone lub brak: prawdziwy agent ACP (Gemini, OpenCode i inne), wiele kont jednego dostawcy (W5), komunikat o przełączeniu w widoku rozmowy, pierścienie użycia jako wykres. Raport: `docs/cosgral-raporty/kk-w4-rows.md`. | W3 | Dodać drugiego dostawcę → agent przełącza model; przy limicie widać reset. |
| 36 | Zespół i serwery | Członkowie, role, zaproszenia (link/QR), hostowanie serwera, status maszyny, klient webowy. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): nie do sprawdzenia tu (sieć i konto): okno dołączania jest, hostowanie, zaproszenia i role nie sprawdzane. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W3 | Wystawić host i dołączyć drugą osobę zaproszeniem → obie widzą obecność i mogą pisać DM. |
| 37 | Dok agentów | Mini-czaty z ulubionymi agentami poza głównym oknem; ukrywanie, kolejność, rozmiar. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): okno doku: pin, rozmiary, kolejność, mini czat wysyła i dostaje odpowiedź. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W3 | Przypiąć agenta do doku → mini-czat działa przy zamkniętym głównym układzie listy. |
| 38 | Dynamic Island | Nakładka ze stanem (pracuje, wiadomość, pytanie, zatwierdzenie, przejęcie, błąd). | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): pytanie w tle → wyspa pokazuje stan i nazwę agenta, klik otwiera agenta z kartą. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W3 | Agent zada pytanie w tle → wyspa pokazuje stan; klik otwiera kartę. |
| 39 | Ustawienia i powiadomienia | Zakładki: ogólne, agenci, powiadomienia (macierz), głos, Computer Use, profil, Mobile Connect, dok, wyspa, aktualizacje, rozliczenia, hosty, transfer. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): macierz powiadomień (6 zdarzeń) zapisuje się; język „Polski” zapisuje się, ale napisy zostają po angielsku; sekcje to lista, nie zakładki; toast systemowy nie sprawdzony. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W3 | Wyłączyć powiadomienia desktop → zdarzenie „needs input” nie pokazuje toastu systemowego. |
| 40 | Onboarding | Język, pierwszy dostawca, pierwszy agent z propozycji, Computer Use. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): jeden przepływ: gdzie → dostawca, język, pierwszy agent z propozycji, Computer Use → lista z agentem; wybór języka nie zmienia napisów. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W3 | Świeża instalacja → przejście setupu kończy się listą z pierwszym agentem gotowym do czatu. |
| 41 | Marketplace i wtyczki | Katalog skilli/agentów, instalacja, sugestie marketplace, wtyczki z własnymi połączeniami. | Jest — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): lokalny katalog (skille i agenci), szukanie, szczegóły, Install włącza skill u wybranego agenta; bez wtyczek z połączeniami. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | W3 | Wyszukać skill w Marketplace → instalacja włącza go u wybranego agenta. |

## M — Telefon (etap po Windows)

### Zachowanie telefonu w OpenBot 0.68 (opis dla Backendu i UI)

OpenBot 0.68 ma **osobną aplikację mobilną** (Expo / iOS, także Android w release pipeline) obok desktopu. Telefon nie uruchamia silnika agentów: łączy się z kontem / hostem desktopowym przez **Mobile Connect** (parowanie kodem QR albo stałym linkiem `openbot://` / biletem developerskim). Po sparowaniu z telefonu da się m.in.: tworzyć i edytować agentów (instrukcje, awatar), czytać i pisać w rozmowach, dostawać powiadomienia (w tym Live Activity na iPhonie), kontynuować pracę gdy desktop czeka na decyzję. Aktualizacje JS mogą iść OTA przy tej samej wersji natywnego runtime. Desktytopowe `bun run mobile:*` i `dev:mobile` w README służą do buildu, symulatora i parowania bez skanowania QR w trybie deweloperskim.

W paczce desktop 0.68 widać ślad powierzchni telefonu (np. asset `smartphone-*`); pełny kod aplikacji leży w `apps/mobile` repozytorium OpenBot (nie w samym `app.asar` desktopu).

| Nr | Obszar | Zachowanie 0.68 (własnymi słowami) | 0.1.11: stan / dowód | Fala | Test odbioru: kroki → wynik |
|---|---|---|---|---|---|
| 42 | Telefon · Mobile Connect | Parowanie telefonu z komputerem (QR / link / bilet); telefon używa tego samego konta/hosta. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): pairing przez TLS z odciskiem i obrazem QR, zgoda na karcie, serwer wraca po restarcie; nie sprawdzono skanowania kamerą ani prawdziwego telefonu. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | M | Z telefonu zeskanować QR z desktopu → sesja sparowana, widać listę agentów. |
| 43 | Telefon · czat i decyzje | Z telefonu: czytanie/pisanie czatu, powiadomienia o „czeka na Ciebie”, odpowiadanie na pytania/zatwierdzenia. | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): z telefonu: lista agentów, czat, odpowiedź na pytanie odblokowuje turę, Vault 403; brak powiadomień push na telefonie. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | M | Agent pyta na desktopie → powiadomienie na telefonie; odpowiedź z telefonu odblokowuje turę. |
| 44 | Telefon · agenci | Tworzenie i edycja agentów z telefonu (instrukcje, awatar, przegląd sekcji). | Częściowo — odbiór W3-T3 (13.11.2026, prawdziwy program w piaskownicy z atrapą Codex): agent utworzony z telefonu widoczny na komputerze; edycja i awatar nie uruchiamane, prawdziwego telefonu nie było. Raport: `docs/cosgral-raporty/kk-w3-acceptance.md`. | M | Utworzyć agenta na telefonie → widać go na desktopie po odświeżeniu. |

### Decyzje do podjęcia (Backend + UI)

1. **Klient:** natywny (Expo/Capacitor) vs PWA do hosta na Windows (plan COSGRAL dopuszcza PWA/Tailscale na start).
2. **Transport:** tylko loopback+LAN vs tunel; jak wystawić Mobile Connect bez chmury OpenBot.
3. **Zakres MVP telefonu:** czat + Needs you + powiadomienia najpierw; tworzenie agentów i OTA później.

### W4-UI1 — uzupełnienie wierszy 14–15 (15.11.2026)

Częściowo: New channel w pasku bocznym i workspace, tworzenie i edycja tytułu/składu/lidera/instrukcji, flaga odpowiedzi w preload. Krótka nazwa nie jest edytowalna w kontrakcie. Testy UI i krok `channel UI: create, edit and reply` w `scripts/sandbox-e2e.ts`; odbiór okna i zrzut oczekują. Raport: `docs/cosgral-raporty/ui-w4-ui1.md`.

### W4-UI4 — wiersze 2 i 3, kod do odbioru (16.11.2026)

Status obu wierszy pozostaje **częściowo**, bez zmiany wyniku procentowego. Doszły responsywne **More pages** i **Mark as read** z menu agenta; komponenty sprawdzone jednostkowo i w Chromium/Storybooku. Dwa nowe kroki sandbox:e2e oczekują na KK. Pozostałe luki: duplikat agenta, nowy wątek, osobne okno, ukrywanie i trwałe przypinanie stron — brak odpowiednich kontraktów. Dokładna lista metod i proponowanych kształtów: `docs/cosgral-raporty/ui-w4-ui4.md`. Historyczny odbiór W3 opisany w tabeli nie został zastąpiony niepotwierdzonym statusem „jest”.
