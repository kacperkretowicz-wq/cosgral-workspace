# Spec W1 — kanały, zadania, szkic, przejęcie przeglądarki

**Dla:** Backend (W1-BE2), UI.  
**Źródła:** obserwacja OpenBota 0.68 jako członek kanału (ten projekt), [README 0.68](https://github.com/nightly-labs/openbot/blob/v0.68.0/README.md), lista `docs/cosgral/parytet-0.68.md` wiersze 12–15. Bez kopiowania tekstów UI i bez kodu nowszego niż `a6fe240`.  
**Kontrakt uzgodniony (Backend↔UI):** `ChannelTask {id, channelId, ownerBotId, state: queued|running|waiting|done|failed|cancelled, title, requestMessageId, resultMessageId|null, updatedAt}`, zdarzenie `task-changed`, `channels.listTasks(channelId)`. Poniżej: gdzie 0.68 wymaga **więcej** pól lub stanów.

Stan: 13.11.2026. Odbiór silnika (API/smoke) W1-T3: `docs/cosgral-raporty/tester-w1-t3-odbior.md`. UI kanału/kart nadal do W1-UI3.

## 1. Kanał

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 1.1 | Tworzenie | Człowiek (lub agent z uprawnieniem) zakłada kanał; od razu ma nazwę, opcjonalny tytuł, instrukcje i listę członków-agentów oraz jednego lidera. | Utworzyć kanał z dwoma agentami → widać go na liście i da się otworzyć historię. |
| 1.2 | Nazwa | Krótki identyfikator widoczny na liście; unikalny w obrębie serwera / przestrzeni. | Dwa kanały z tą samą nazwą → drugi jest odrzucony albo wymuszona inna nazwa. |
| 1.3 | Tytuł | Dłuższy, ludzki opis nad rozmową; może być pusty. | Ustawić tytuł → po restarcie tytuł ten sam. |
| 1.4 | Instrukcje | Stałe reguły kanału wstrzykiwane członkom; mają **limit długości** (przy przekroczeniu zapis jest odrzucany lub ucinany z jasnym sygnałem). | Wkleić tekst powyżej limitu → zapis nie przechodzi albo widać limit; poniżej limitu — OK po restarcie. |
| 1.5 | Członkowie | Tylko wskazani agenci (i ludzie z dostępem do kanału) widzą historię i mogą dostać zadanie. | Agent spoza listy nie dostaje przydziału i nie widzi historii. |
| 1.6 | Lider | Jeden członek-agent jest liderem: koordynuje przydziały, może zatrzymać / wznowić / przenieść pracę, dostaje wyniki podzadań. | Lider dostaje wynik od członka → kontynuuje albo zamyka wątek bez drugiego przydziału tego samego wyniku. |
| 1.7 | Pamięć kanału | Osobna pula wspomnień kanału (nie miesza się z pamięcią 1:1 agenta), z limitem; przy izolacji nie wycieka do innych rozmów. | Zapisać fakt w pamięci kanału → w tej rozmowie agent go zna; w osobnej rozmowie 1:1 tego samego agenta — nie (gdy izolacja włączona). |
| 1.8 | Izolacja | Flaga izolacji: narzędzia / pamięć / kontekst trzymają się kanału; członkowie nie widzą cudzych czatów bocznych jako domyślnego kontekstu. | Włączyć izolację → prośba o dane spoza kanału jest ograniczona albo wymaga osobnej zgody. |

**Dodatek do kontraktu (kanał):** poza `ChannelTask` backend potrzebuje encji kanału: `id, name, title, instructions, leadAgentId, memberAgentIds[], isolated, memoryLimitBytes?, createdAt, updatedAt` oraz mutacje create/update/addMember/removeMember/setLead.

## 2. Wiadomość człowieka → zadanie

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 2.1 | Widoczność | Wiadomość człowieka w kanale widzą wszyscy członkowie (ludzie + agenci w kanale); trafia do wspólnej historii. | Dwa okna / dwóch agentów → ta sama wiadomość w historii obu. |
| 2.2 | Kiedy zadanie | Zwykła wiadomość do kanału **staje się zadaniem** z właścicielem (najczęściej liderem na start albo wskazanym agentem), stanem początkowym `queued` lub od razu `running`, tytułem ze skrótu treści i `requestMessageId` = id tej wiadomości. | Wysłać „Zrób X” → w liście Zadań pojawia się pozycja ze stanem i właścicielem. |
| 2.3 | Rola lidera | Lider (albo reguła kanału) decyduje, kto prowadzi: sam robi, albo `channel_assign` / przydział do członka; wyniki wracają do lidera / kanału przez wynik zadania (`channel_result`), nie jako cicha praca poza osią. | Przydzielić podzadanie → właściciel się zmienia; wynik pojawia się w kanale i zamyka / aktualizuje zadanie. |
| 2.4 | Bez zadania | Krótkie odpowiedzi członka na pytanie innego członka (limit odpowiedzi na prośbę) **nie** muszą tworzyć nowego pełnego zadania nadrzędnego; to wątek pomocniczy przy istniejącym zadaniu. | Agent pyta drugiego członka → odpowiedź wraca do pytającego bez nowej pozycji „root” na liście Zadań (albo z jasnym powiązaniem do rodzica). |

## 3. Zadania — cykl życia

Uzgodnione stany: `queued | running | waiting | done | failed | cancelled`.  
**Brakujące względem 0.68 (dopisać):** `paused` (człowiek / limit przydziałów wstrzymał automat; da się wznowić), `archived` (schowane z aktywnej listy, da się przywrócić). Albo `cancelled` + osobne pole `archivedAt` — byle Stop ≠ Archive.

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 3.1 | Przydział | Zadanie ma jednego `ownerBotId`; przydział zmienia właściciela i budzi go do pracy. | Przydzielić agentowi B → B zaczyna; A nie kontynuuje tego samego zadania. |
| 3.2 | Przekazanie własności | Lider lub uprawniony członek przenosi zadanie (`transfer`); historia i `requestMessageId` zostają. | Transfer A→B w trakcie → B jest właścicielem; stan nie resetuje się do pustego. |
| 3.3 | Zależności | Zadanie może czekać na inne (`dependencies`); nie startuje, dopóki zależności nie są `done` (lub anulowane według reguły). | Ustawić zależność → dziecko zostaje `queued`/`waiting`, póki rodzic nie skończy. |
| 3.4 | Zasoby / folder | Zadania oznaczone tym samym zasobem (np. ten sam folder roboczy) **idą po kolei**, nie równolegle. | Dwa zadania na ten sam folder → drugie startuje dopiero po zakończeniu pierwszego. |
| 3.5 | Wynik raz | Jedno zadanie ma **jeden** finalny wynik (`resultMessageId`); ponowny „result” bez nowego zadania jest odrzucany lub traktowany jako poprawka tylko gdy stan na to pozwala. | Dwa `channel_result` na to samo zadanie → drugi nie otwiera drugiego „done” albo nadpisuje według reguły lidera (wybrać jedną i trzymać się jej). |
| 3.6 | Pytanie do członka | Właściciel może zadać krótki wątek innemu członkowi z limitem odpowiedzi (np. 2); to nie zabiera własności zadania. | Zapytać członka → max N odpowiedzi; potem wątek się zamyka. |
| 3.7 | Stop / anulowanie | Człowiek lub lider **przerywa** pracę: stan `cancelled` lub `paused`; agent nie wznawia sam. | Stop w trakcie → brak dalszych tool-calli; w Zadaniach widać zatrzymane. |
| 3.8 | Wznowienie | Tylko człowiek (lub jawna reguła) wznawia zatrzymane / wstrzymane zadanie; wraca do `queued`/`running`. | Resume → agent dostaje kontekst i kontynuuje. |
| 3.9 | Archiwum | Archiwizacja chowa zadanie z aktywnej listy; Restore przywraca. | Archive → znika z aktywnych; Restore → wraca ze stanem sprzed archiwum. |
| 3.10 | Waiting | Stan `waiting` = czeka na człowieka (pytanie/zatwierdzenie) albo na zależność / odpowiedź członka — nie mylić z kolejką FIFO czatu 1:1. | Agent pyta w kanale → zadanie `waiting`; po odpowiedzi wraca `running`. |

**Pola do rozważenia ponad uzgodniony kształt:** `parentTaskId`, `dependencyTaskIds[]`, `resourceKey` (serializacja folderu), `pausedAt` / `archivedAt`, `assignmentCount` lub `revision` (limit automatycznych przydziałów).

## 4. Podgląd szkicu (wiersz 12)

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 4.1 | Kiedy | Zanim agent wyśle coś **w imieniu użytkownika** (np. wiadomość zewnętrzna), pokazuje kartę z podglądem treści. | Agent przygotowuje szkic → w czacie widać kartę z treścią, bez wysyłki. |
| 4.2 | Send | Zatwierdza i wysyła; karta znika; w historii widać skutek wysyłki. | Send → odbiorca dostaje treść; karta zamknięta. |
| 4.3 | Edit | Wraca treść do edycji (agent lub człowiek poprawia); bez wysyłki. | Edit → można zmienić tekst; ponowny podgląd przed Send. |
| 4.4 | Keep draft | Zostawia szkic bez wysyłki i bez utraty treści (draft zachowany). | Keep draft → brak wysyłki; draft da się otworzyć później. |
| 4.5 | Jedna decyzja | Jedno zatwierdzenie dotyczy tej karty i tych odbiorców raz; odrzucenie / brak zgody jest ostateczne dla tej próby. | Odrzucić → agent nie wysyła tą samą kartą ponownie bez nowej prośby. |

## 5. Przejęcie przeglądarki (wiersz 13)

| # | Temat | Zachowanie 0.68 | Test odbioru |
|---|---|---|---|
| 5.1 | Prośba | Gdy strona blokuje agenta (logowanie, CAPTCHA, płatność), pojawia się **osobna** prośba o przejęcie — to nie jest zwykłe `browser-control.waiting` po kliknięciu agenta. | Symulować blokadę → karta / stan „czeka na Ciebie w przeglądarce”. |
| 5.2 | Przejęcie | Człowiek przejmuje sterowanie tą samą kartą / sesją; agent nie klika w tym czasie. | Przejąć → człowiek może wpisać hasło; agent nie steruje równolegle. |
| 5.3 | Oddanie | Człowiek kończy przejęcie (gotowe / oddaj); sterowanie wraca do agenta. | Oddać → wskaźnik przejęcia znika. |
| 5.4 | Ta sama sesja | Po oddaniu agent kontynuuje **w tej samej sesji przeglądarki** (cookies, URL, stan strony). | Po logowaniu przez człowieka agent widzi zalogowaną stronę bez otwierania od zera. |

## 6. Pytania otwarte dla lidera

1. Czy dodajemy stany `paused` i `archived` osobno, czy archiwum to flaga przy `cancelled`/`done`?
2. Czy wynik zadania może nadpisać poprzedni `resultMessageId`, czy zawsze nowe zadanie na poprawkę?
3. Jaki dokładnie limit długości instrukcji kanału i limitu odpowiedzi na `channel_reply` (liczby)?
4. Czy zasób serializacji to ścieżka folderu, id workspace, czy etykieta z UI?
5. Czy przejęcie przeglądarki liczy się do Needs you (tak w 0.68) — Backend ma dodać typ prośby poza `prompt`/`approval`?
6. Czy podgląd szkicu to ten sam mechanizm co `ask_ui` confirm (Send/Edit/Keep draft), jeden typ karty w kontrakcie?

## Metoda

- Dowód „jako użytkownik”: praca w kanale OpenBot (przydziały, wyniki, stop/pauza, odpowiedzi członków, izolowana pamięć kanału).
- README 0.68: shared channel chats, delegation, Stop/Resume/Reassign/Archive/Restore.
- Kontrakt `ChannelTask` — baza; rozszerzenia w §3.
- Gałąź: `team/tester/w1-spec` od `codex/cosgral-desktop` (podgląd UI: e10abd46d).
