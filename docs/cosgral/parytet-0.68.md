# Parytet 0.68 — fala W1 (B2a)

Stan: 12.11.2026. Baza COSGRAL = OpenBot 0.1.11 (`a6fe240`, opis w `package.json`). Opis zachowania 0.68: własnymi słowami, bez fragmentów kodu i bez kopiowania tekstów UI.

**Źródła W1:** mapa UX 0.67.1 (`docs/cosgral-raporty/claude-k-openbot-ux-map.md` na `codex/cosgral-workspace`), publiczny [README 0.68](https://github.com/nightly-labs/openbot/blob/v0.68.0/README.md) i [changelog v0.68.0](https://github.com/nightly-labs/openbot/releases/tag/v0.68.0), statyczna lista paczki `app.asar` (8250 wpisów + nazwy chunków renderera; poza repo w `Shared\cosgral-data\desktop-tester\rea-0.68`), kod worktree `desktop-tester` po merge `codex/cosgral-desktop` @ `f42d104d6`. REA CLI: próba z limitem 600 s; przy braku wyniku obowiązuje metoda statyczna.

**Legenda stanu w 0.1.11:** jest = zachowanie pokryte end-to-end w bazie · częściowo = jest zalążek, brakuje stanów albo powierzchni · brak = nie ma odpowiednika. Istnienie pliku nie dowodzi pełnej funkcji. Żaden test odbioru z tej tabeli nie został uruchomiony w runtime.

## W1 — nawigacja, czat, kanały, panel, kolejka, wyszukiwanie

| Nr | Obszar | Zachowanie 0.68 (własnymi słowami) | 0.1.11: stan / dowód | Fala | Test odbioru: kroki → wynik |
|---|---|---|---|---|---|
| 1 | Nawigacja · szyna serwerów | Skrajnie po lewej widać ten komputer oraz serwery zdalne/hostowane; można je wybierać, dopinać, wyciszać, ustawiać, opuszczać i przestawiać kolejność. | Częściowo — `ServerRail.tsx` + `ServerSummary`: lokalny i zdalne, dodawanie i host; bez pełnego menu wycisz/opuść/ukryj i bez hostowanych stron jak w 0.68. | W1 | Dodać serwer zdalny i przełączyć lokalny ↔ zdalny → aktywny serwer zmienia kontekst listy agentów. |
| 2 | Nawigacja · szyna stron | Obok szyny serwerów jest szyna stron (Agenci, Harmonogram, Zadania, Przepływy, Użycie, Biblioteka, Marketplace, Ustawienia, Więcej, przypinanie). | Brak — w rendererze bazy nie ma szyny stron; ustawienia to modal, biblioteka/przepływy nie są osobnymi stronami w shellu. W paczce 0.68 widać m.in. chunki `LibraryPanel`, `WorkflowsPage`. | W1 | Otworzyć Harmonogram, wrócić do Agentów → stan listy agentów zachowany. |
| 3 | Nawigacja · pasek boczny | Lista agentów i kanałów; klik otwiera rozmowę; sekcja osób; wyszukiwanie na liście; menu wiersza (edycja, duplikat, nowy wątek, okno, ukryj, usuń, przeczytane). | Częściowo — `Sidebar.tsx`: ludzie + agenci, filtr, usuwanie, konto; brak kanałów grupowych na liście i części akcji menu z 0.68. | W1 | Wybrać dwóch agentów kolejno → każdy ma własną historię. |
| 4 | Nawigacja · foldery | Użytkownik tworzy foldery (także zagnieżdżone), przenosi agentów/kanały, duplikuje i zmienia nazwę folderu. | Brak — lista to stałe sekcje ludzie/agenci, bez modelu folderów użytkownika. Changelog 0.68 potwierdza foldery w folderach. | W1 | Utworzyć folder, wrzucić agenta, zagnieździć folder → po restarcie układ ten sam. |
| 5 | Nawigacja · stan „myśli” | Wiersz agenta pokazuje, że agent właśnie pracuje (myśli / analizuje). | Częściowo — `SidebarAgentState.kind = working` + kropki w `Sidebar.tsx`, gdy trwa tura lub kolejka `starting`/`running`. | W1 | Wysłać wiadomość → w pasku widać stan pracy, po odpowiedzi znika. |
| 6 | Nawigacja · stan „czeka na Ciebie” | Wiersz (i zbiorczo Needs you) pokazuje oczekiwanie na pytanie, zatwierdzenie albo przejęcie przeglądarki. | Częściowo — powiadomienia „Needs your input/approval” w `agent-notifications.ts` oraz karty w aktywnej rozmowie; **brak** osobnego stanu w pasku i sekcji Needs you (stany to tylko working/unread/responded). | W1 | Agent zada pytanie poza otwartą rozmową → w Needs you widać go z liczbą; klik otwiera kartę. |
| 7 | Nawigacja · stan „limit” | Wiersz pokazuje czekanie na limit użycia z godziną resetu. | Brak — `AccountUsage` istnieje w kontraktach, ale pasek boczny nie renderuje stanu limitu na agencie. | W1 | Symulować limit → wiersz pokazuje limit i czas; po resecie wraca do normalnego stanu. |
| 8 | Nawigacja · stan „błąd” | Wiersz pokazuje, że ostatnia praca padła błędem (widać to bez otwierania czatu). | Brak — błędy tur są w rozmowie; brak dedykowanego stanu wiersza. | W1 | Wywołać błąd dostawcy → wiersz pokazuje błąd; po udanej turze znika. |

## Współpraca UI (Needs you) — zachowanie 0.68

Agent jest „czeka na Ciebie”, gdy otwarta jest nierozstrzygnięta karta pytania, zatwierdzenia albo prośba o przejęcie przeglądarki w tej rozmowie. Ten stan widać na wierszu agenta i w zbiorczej sekcji Needs you na górze listy (z liczbą). Klik w Needs you otwiera rozmowę już przewiniętą do tej karty. Stan znika dopiero po odpowiedzi, pominięciu pytań, decyzji zatwierdzenia albo zakończeniu przejęcia — nie znika samym odczytaniem czatu.

*(Wiersze czatu, kanałów, panelu, kolejki i wyszukiwania dopisywane w kolejnych commitach B2a.)*
