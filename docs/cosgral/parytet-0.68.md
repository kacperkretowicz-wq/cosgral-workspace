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
| 9 | Czat · rozmowa | Rozmowa pokazuje wiadomości człowieka i agenta, wątki, bogaty tekst, załączniki; historia zostaje po restarcie. | Częściowo — `Conversation.tsx` + magazyn wiadomości; działanie bez zewnętrznego konta i pełny zestaw kart/wstawek 0.68 do domknięcia. | W1 | Wysłać wiadomość → odpowiedź widoczna i zachowana po restarcie. |
| 10 | Czat · karta pytania | Agent zadaje 1–3 pytania z opcjami (i własną odpowiedzią); bez odpowiedzi tura czeka. | Częściowo — `ConversationPrompts.tsx` (`ApprovalCard` variant questions) + zdarzenie `prompt`; brak zbiorczego Needs you i sticky paska. | W1 | Agent pyta z opcjami → wybór wraca do agenta; pominięcie też kończy kartę. |
| 11 | Czat · karta zatwierdzenia | Agent prosi o zgodę na polecenie, zmianę plików albo uprawnienia; Zezwól / Odrzuć (i warianty „zawsze”). | Częściowo — `AgentApproval` (command / file-change / permissions) + karta w czacie; brak „zawsze zezwalaj” jak w mapie 0.68. | W1 | Agent prosi o komendę → odmowa zatrzymuje, zgoda kontynuuje. |
| 12 | Czat · podgląd szkicu | Przed wysłaniem w imieniu użytkownika widać kartę z podglądem szkicu (np. wiadomość); Send / Edit / Keep draft. | Brak — w bazie nie ma karty podglądu szkicu typu ask_ui; w paczce 0.68 jest chunk `UiBlockPrompt`. | W1 | Agent pokazuje szkic → Send wysyła, Edit wraca do edycji, Keep draft zostawia bez wysyłki. |
| 13 | Czat · przejęcie przeglądarki | Gdy strona wymaga człowieka (logowanie, CAPTCHA itd.), pojawia się karta przejęcia; po oddaniu agent wraca do tej samej sesji. | Częściowo — wbudowana przeglądarka i `BrowserControlState` (acting/waiting) w `Conversation.tsx`; brak osobnej karty „przejęcie” i przepływu request_takeover jak w 0.68. | W1 | Agent utknie na logowaniu → człowiek przejmuje, oddaje → agent kontynuuje tę samą kartę. |
| 14 | Kanały · lider i członkowie | Kanał ma nazwę, tytuł, instrukcje, członków-agentów i lidera; historia wspólna; stop / wznowienie / przejęcie pracy. | Brak — `TeamChatStore` to tylko rozmowy osoba↔osoba; brak modelu kanału z liderem i agentami jak w README 0.68 („shared desktop channel chats”). | W1 | Utworzyć kanał z liderem i dwoma agentami → wiadomość człowieka widzą wszyscy członkowie. |
| 15 | Kanały · zadania | Wiadomość człowieka staje się zadaniem z właścicielem, stanem i wynikiem; można przydzielać, przenosić, zatrzymywać, wznawiać, archiwizować. | Brak — w bazie nie ma listy zadań kanału ani przełącznika Chat \| Zadania. | W1 | Przydzielić zadanie agentowi → w Zadaniach widać właściciela i stan; wynik wraca do kanału. |
| 16 | Panel boczny | Przy rozmowie otwiera się panel z okienkami (przeglądarka, pliki, ustawienia agenta, pytanie poboczne, głos, subagent); da się go zmienić rozmiarem i zmaksymalizować. | Częściowo — `Conversation.tsx`: panel `browser` / `desktop` / `settings`; brak osobnych okienek pliki / pytanie poboczne / głos / subagent jak w mapie 0.68 (`ChatFilesPanel` w paczce 0.68). | W1 | Otworzyć przeglądarkę i ustawienia agenta → panel zmienia rozmiar i nie gubi stanu przy przełączeniu. |
| 17 | Kolejka wiadomości | Wiadomości wysłane w trakcie pracy czekają w kolejce FIFO; da się je edytować, usuwać, przestawiać, kierować (steer) i wznawiać; kolejka przeżywa awarię. | Częściowo — `QueuePanel.tsx` + zdarzenia `queue-changed`; README 0.68 potwierdza pause/resume/cancel i trwałość. Zachowanie po crashu w naszej bazie do potwierdzenia testem. | W1 | Wysłać dwie wiadomości podczas pracy → wykonują się kolejno; po restarcie kolejka nadal tam jest. |
| 18 | Wyszukiwanie · w rozmowie | Wyszukiwarka w czacie prowadzi do kolejnych trafień w tej rozmowie. | Jest — `ChatSearch.tsx` + `chat-search.ts` (nawigacja po trafieniach). | W1 | Wyszukać unikalny tekst → podświetlenie i skok do właściwej wiadomości. |
| 19 | Wyszukiwanie · globalne | Globalne wyszukiwanie po rozmowach i agentach otwiera właściwy wątek. | Częściowo — `GlobalSearch.tsx` po botach i wiadomościach 1:1; bez kanałów/zadań z 0.68. | W1 | Wyszukać unikalną frazę z innej rozmowy → otwiera tę rozmowę na wiadomości. |

## Współpraca UI (Needs you) — zachowanie 0.68

Agent jest „czeka na Ciebie”, gdy otwarta jest nierozstrzygnięta karta pytania, zatwierdzenia albo prośba o przejęcie przeglądarki w tej rozmowie. Ten stan widać na wierszu agenta i w zbiorczej sekcji Needs you na górze listy (z liczbą). Klik w Needs you otwiera rozmowę już przewiniętą do tej karty. Stan znika dopiero po odpowiedzi, pominięciu pytań, decyzji zatwierdzenia albo zakończeniu przejęcia — nie znika samym odczytaniem czatu.

## Współpraca UI (przyklejona Decyzja) — zachowanie 0.68

Nad polem wpisywania widać przyklejoną Decyzję: najstarszą otwartą kartę pytania lub zatwierdzenia w tej rozmowie. Pasek zostaje widoczny przy przewijaniu historii. Po decyzji (odpowiedź / pomiń / zezwól / odrzuć) pasek znika od razu; jeśli czeka kolejna karta, pojawia się następna najstarsza. Samo przewinięcie albo odczytanie wiadomości nie zamyka Decyzji.

## Współpraca UI (Chat \| Zadania) — zachowanie 0.68

W kanale jest przełącznik Chat | Zadania w tej samej rozmowie (bez zmiany kanału). Chat to oś wiadomości. Zadania to lista przydziałów: kto jest właścicielem, stan (kolejka / w toku / czeka / wynik / zatrzymane), oraz akcje Stop, Resume, Reassign, Archive, Restore. Przełączenie zachowuje kontekst kanału i otwarte karty Decyzji. Lista zadań pokazuje też zadania zatrzymane i pozwala je wznowić albo przydzielić ponownie.

## Podsumowanie W1 (liczby)

Policzono wiersze 1–19 tej tabeli.

| Stan w 0.1.11 | Liczba |
|---|---|
| jest | 1 |
| częściowo | 11 |
| brak | 7 |

## 10 najważniejszych braków W1

1. Szyna stron (Agenci / Harmonogram / Zadania / …) — brak w shellu bazy.
2. Foldery agentów (z zagnieżdżeniem) — brak modelu.
3. Sekcja Needs you + stan „czeka na Ciebie” w pasku — tylko powiadomienia i karty w otwartej rozmowie.
4. Stan limitu na wierszu agenta — brak.
5. Stan błędu na wierszu agenta — brak.
6. Karta podglądu szkicu (ask_ui) — brak; w 0.68 jest `UiBlockPrompt`.
7. Karta / przepływ przejęcia przeglądarki dla człowieka — tylko kontrola agenta acting/waiting.
8. Kanały z liderem i agentami — brak (jest tylko DM osób).
9. Lista zadań kanału i Chat \| Zadania — brak.
10. Przyklejona Decyzja nad kompozytorem — brak w bazie (cel B4-UI).

## Metoda i limity sprawdzenia

- Mapa 0.67.1 i README/changelog 0.68 opisują powierzchnie; nie uruchamiano OpenBota 0.68 pod debuggerem w tym zadaniu.
- Statyczna paczka: 8250 ścieżek w `app.asar`; nazwy chunków W1 m.in. `QuestionPromptBubble`, `UiBlockPrompt`, `QueuePanel`, `GlobalSearch`, `BrowserPreviewSidebar`, `channel-*`, `LibraryPanel`, `WorkflowsPage`.
- REA CLI (`analyze-javascript-application` na `app.asar`): **timeout 600 s** po fazie „Processing 6502 selected application files”; `rea-out.json` pusty → obowiązuje fallback statyczny (lista plików + nazwy chunków).
- Testów odbioru z tabeli nie uruchomiono. Reszta obszarów = zadanie B2b.
