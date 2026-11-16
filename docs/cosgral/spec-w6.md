# Spec W6: kryteria odbioru (wątki, kontekst, plan, subagenci, akcje, osobne okno)

**Stan: 16.11.2026, integracja `codex/cosgral-desktop` @ `934fd5c6a`. Autor: Tester (W6-T1), tylko dokument, bez kodu i bez uruchamiania programu.**

Opis zachowania „co program ma robić” i tabela kryteriów odbioru. Podstawa dla Backend (W6-BE1…) i UI. Kolejność fal: `PLAN-W4.md` (W6 = wątki, kontekst, plan, subagenci, akcje na wiadomościach). Bramka G3 w `luki-070.txt`: odbiór W6 bez błędów blokujących + przebieg na prawdziwym dostawcy.

## Na górze

- **Sytuacji do dostarczenia:** 6 grup, **36** wierszy „Użytkownik robi X → program robi Y” (sekcja 1).
- **Kryteriów odbioru: W01–W42** (sekcja 2). **Wymaga właściciela: 4** (W39–W42 — prawdziwy dostawca / długa rozmowa).
- **Rozdział:** większość na atrapie Codex w prawdziwym oknie (`sandbox:e2e` / acceptance). Prawdziwy długi kontekst i plan na żywym modelu — właściciel (sekcja 3).
- **Dziś w COSGRAL (z parytetu / luk):** jedna rozmowa na agenta; kolejka FIFO „jest” (wiersz 17); panel bez okienka subagenta i pytania pobocznego (wiersz 16 częściowo); menu wiersza bez „nowy wątek” i „osobne okno” (wiersz 3 częściowo); kompaktowanie historii bez UI.

**Oznaczenia w kolumnie „Źródło”:** `luki` = `Shared\cosgral-docs\luki-070.txt` (tabela luk + zadania W6-BE1…UI2); `PLAN-W4` = skrót fal; `parytet` = `parytet-0.68.md` wiersze 3 / 16 / 17; `zlecenie T1` = to polecenie lidera; **„do ustalenia”** = brak w źródłach; **„propozycja T1”** = moja rekomendacja do decyzji lidera (nie wymyślony fakt o 0.68/0.70).

**Zasada clean room:** własne słowa. Nie czytałem kodu OpenBota nowszego niż `a6fe240` / 0.1.11. Nie kopiuję tekstów 0.68/0.70.

**Poza zakresem tego specu (są w tabeli zadań W6 w lukach, ale nie w zleceniu T1):** bogata treść / załączniki 100 MB (W6-UI3); `$` skille i `@` w kompozytorze oraz rozszerzone wyszukiwanie (W6-UI4); grupy paska unread/pinned/hidden i pełne 9 akcji menu (część W6-UI2 — tu tylko „nowy wątek” i „osobne okno”); „prześlij do kanału” / „oznacz nieprzeczytane” / cytat (W6-UI1 w lukach) — wymienione w pytaniach otwartych.

---

## 1. Zachowanie do dostarczenia

### 1A. Wątki na agenta

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 1 | Z menu wiersza agenta (albo z rozmowy) wybiera „Nowy wątek”. | Powstaje pusty wątek tego samego agenta; lista wątków pokazuje go obok poprzednich; aktywny staje się nowy. Stary wątek i jego historia zostają. | Kasować poprzedni wątek; mieszać wiadomości między wątkami. | luki W6-BE1, W6-UI2; parytet wiersz 3; zlecenie T1 |
| 2 | Otwiera listę wątków agenta. | Widzi wątki z tytułem (albo placeholderem, gdy brak tytułu) i kolejnością **do ustalenia** (propozycja T1: ostatnio używane na górze). Archiwalne są oddzielone albo ukryte za filtrem. | Pokazywać wątki innego agenta na tej liście. | luki W6-BE1; propozycja T1 |
| 3 | Przełącza się na inny wątek tego agenta. | Widok rozmowy, kolejka i otwarte karty „Needs you” **tego wątku** są widoczne; drugi wątek nie miesza treści. Stan aktywnego wątku przeżywa restart. | Doklejać odpowiedź z wątku A do historii wątku B. | luki W6-BE1 („własny kontekst”); zlecenie T1 |
| 4 | Pracuje w wątku A (kolejka ma wiadomości albo jest otwarta karta), przełącza na wątek B. | Kolejka i karty wątku A **nie znikają** i nie wykonują się w B; po powrocie do A wracają w tym samym stanie. Zachowanie gdy agent **w trakcie tury** w A: **do ustalenia** (propozycja T1: tura A dokończa się w tle; wiersz agenta pokazuje stan; B da się czytać i kolejkować osobno). | Przenieść kartę Needs you z A do B; zgubić kolejkę A. | zlecenie T1; parytet wiersz 17 (kolejka per rozmowa dziś); propozycja T1 |
| 5 | Zmienia tytuł wątku. | Tytuł zapisuje się od razu i widać go na liście po restarcie. Puste / za długie: **do ustalenia** (propozycja T1: pusty → automatyczny skrót z pierwszej wiadomości albo „Nowy wątek”; limit znaków jak w innych etykietach UI). | Wymagać restartu; zmieniać tytuł innego wątku. | luki W6-BE1 („nazwa”); propozycja T1 |
| 6 | Archiwizuje wątek. | Wątek znika z domyślnej listy aktywnych, historia zostaje do odtworzenia; nie da się wysłać nowej wiadomości, dopóki nie przywróci. Usunięcie trwałe: **do ustalenia** (osobna akcja czy to samo co archiwum). | Kasować dysk bez potwierdzenia, jeśli to usuwanie; archiwizować „ostatni aktywny” bez wskazania innego aktywnego (**do ustalenia**, propozycja T1: po archiwizacji aktywny staje się najnowszy pozostały albo tworzy się nowy pusty). | luki W6-BE1 („archiwum”); propozycja T1 |
| 7 | Ma dwa wątki równolegle; w każdym pisze osobną historię. | Każdy wątek ma własną historię wiadomości i własny kontekst rozmowy. Po restarcie obie historie są na miejscu. | Scalać historie. | luki W6-BE1 (kryterium „dwa równoległe wątki… własnym kontekstem”) |
| 8 | Zapisuje wspomnienie agenta „zawsze” w jednym wątku, otwiera drugi. | Wspomnienia **agenta** (pula per agent z W2) są nadal dostępne w drugim wątku. Historia wiadomości pierwszego wątku **nie** wchodzi automatycznie do drugiego. Pamięć **per wątek** (osobna pula): **brak w źródłach** / do ustalenia. | Wyciek całej historii wątku A jako domyślnego kontekstu wątku B. | parytet / W2 pamięć; zlecenie T1; do ustalenia |

### 1B. Kontekst (zużycie, zwinięcie, restart)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 9 | Pisze w długiej rozmowie. | Obok pola wiadomości widać **wskaźnik zużycia kontekstu** (ile z limitu okna modelu jest zajęte). Źródło liczby (tokeny / znaki / szacunek dostawcy): **do ustalenia**. Gdy dostawca nie podaje — stan „niedostępne” z powodem, bez zmyślonych procentów. | Pokazywać 0% albo 100% bez danych. | luki W6-BE2; tabela luk „wskaźnik kontekstu” |
| 10 | Klika ręczne kompaktowanie / zwinięcie historii. | Program skraca kontekst rozmowy (streszczenie albo usunięcie starszych części z okna modelu — **dokładny mechanizm do ustalenia**). W UI widać, że kompaktowanie się odbyło; da się odczytać, że starsze wiadomości są zwinięte albo dostępne w „pełnej historii” (**do ustalenia**). | Kompaktować bez żądania użytkownika w tym samym momencie, gdy właśnie wybrał „ręczne” jako jedyną ścieżkę; usuwać pliki użytkownika z dysku. | luki W6-BE2; tabela luk (dziś: automatyczne bez UI) |
| 11 | Włącza / wyłącza automatyczne kompaktowanie (jeśli zostaje obok ręcznego). | Zachowanie auto vs tylko-ręczne: **do ustalenia** (propozycja T1: auto zostaje jako domyślne w tle przy zbliżeniu do limitu; ręczne zawsze dostępne; wskaźnik ostrzega przed limitem). | Ukryć, że historia została skrócona. | luki (auto dziś); propozycja T1 |
| 12 | Usuwa historię wątku (akcja z BE2). | Historia wiadomości tego wątku znika z UI i z kontekstu kolejnych tur; wątek może zostać pusty. Potwierdzenie w oknie przed skasowaniem. Wspomnienia agenta „zawsze” **nie** kasują się tą akcją (osobna pamięć). | Kasować pamięć agenta ani innych wątków. | luki W6-BE2 („usuwanie historii”); propozycja T1 (zakres) |
| 13 | Restartuje program w środku rozmowy ze wskaźnikiem i po kompaktowaniu. | Ten sam wątek, ta sama historia (albo stan zwinięty), ten sam odczyt wskaźnika wraca po starcie. | Resetować wskaźnik do pustego, gdy dane są na dysku. | zlecenie T1; propozycja T1 |

### 1C. Plan (karta planu)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 14 | Zleca agentowi dłuższe / wielokrokowe zadanie (albo agent sam uznaje, że potrzebuje planu). | Agent pokazuje **kartę planu**: uporządkowana lista kroków, zanim wykona skutki uboczne planu. Karta jest w rozmowie i w „Needs you”, jak inne karty decyzji. Warunek „kiedy dokładnie plan jest obowiązkowy”: **do ustalenia**. | Zaczynać serię narzędzi z efektami bez widocznego planu, gdy tryb planu jest wymagany (po ustaleniu). | luki W6-BE3; tabela luk „karta planu” |
| 15 | Patrzy na plan. | Widzi kroki po kolei (tytuł / krótki opis). Edycja kroków przez człowieka przed startem: **do ustalenia** (propozycja T1: co najmniej Zatwierdź / Odrzuć; edycja listy = późniejsza iteracja). | Pokazywać pustą kartę bez kroków. | luki W6-BE3; propozycja T1 |
| 16 | Zatwierdza plan. | Agent realizuje kroki; w UI widać postęp (który krok trwa / done) — **poziom szczegółu do ustalenia** (propozycja T1: odhaczanie na karcie lub w wiadomości statusu). | Traktować odrzucenie jako zgodę. | luki W6-BE3; propozycja T1 |
| 17 | Odrzuca / pomija plan. | Tura planu się kończy bez wykonania kroków; czytelny stan w rozmowie. Czy agent może zaproponować krótszy plan od razu: **do ustalenia**. | Kontynuować kroki po Odrzuć. | propozycja T1 |
| 18 | Plan jest w toku; użytkownik Stop. | Stop kończy bieżącą pracę planu (jak Stop tury); nieskończone kroki nie startują. | Zostawić wiszące „Thinking” bez Stop (zasada W4). | PLAN-W4 / zasady Stop; propozycja T1 |

### 1D. Subagenci

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 19 | Agent uruchamia subagenta (albo użytkownik z panelu — **kto może startować: do ustalenia**). | Powstaje widoczna sesja subagenta: karta / wpis oraz okienko w panelu bocznym (parytet wiersz 16). Widać, którego agenta-rodzica dotyczy. | Startować subagenta bez śladu w UI. | luki W6-BE3; parytet wiersz 16 |
| 20 | Patrzy na panel subagenta. | Widzi stan (pracuje / czeka / done / błąd) i skrót wyniku albo strumień — **dokładny układ do ustalenia**. Pytanie poboczne w panelu (osobne od subagenta) jest w tym samym zadaniu BE3 w lukach: krótko — osobna karta/panel „pytanie poboczne” bez mieszania z subagentem. | Mieszać historię subagenta z głównym wątkiem bez oznaczenia. | luki W6-BE3; parytet wiersz 16 |
| 21 | Klika Stop na subagencie. | Sesja subagenta kończy się od razu; rodzic dostaje czytelny sygnał przerwania (nie zawieszenie). | Zostawić proces subagenta bez kontroli. | luki W6-BE3; propozycja T1 |
| 22 | Próbuje uruchomić wielu subagentów naraz / bardzo głęboko. | Obowiązuje **limit** liczby równoległych i/lub głębokości — **wartości do ustalenia** (propozycja T1: mały limit, np. kilka równoległych, głębokość 1 w pierwszym podejściu; nadmiar = czytelna odmowa). | Nielimitowane drzewo procesów. | zlecenie T1 („limity”); propozycja T1 |
| 23 | Subagent kończy pracę. | Rodzic może użyć wyniku; panel pokazuje done; karta Needs you subagenta znika, gdy nie ma otwartego pytania. Dzielenie narzędzi / Vault / kont z rodzicem: **do ustalenia**. | Ujawniać sekrety Vault w wyniku subagenta inaczej niż u rodzica. | propozycja T1; do ustalenia |

### 1E. Akcje na wiadomościach

Zakres zlecenia T1: kopiuj, ponów, edytuj i wyślij ponownie, rozgałęź od tej wiadomości, usuń, przypnij. (Luki W6-UI1 dodają też: nieprzeczytane, prześlij do kanału, cytat — poza minimalnym T1, pytanie otwarte.)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 24 | Kopiuje wiadomość. | Treść trafia do schowka (plain text; bogate kopiowanie: poza T1 / UI3). | Kopiować sekrety z masked UI jako jawne, jeśli wiadomość ich nie zawierała. | zlecenie T1 |
| 25 | Wybiera „Ponów” na odpowiedzi agenta (albo na swojej — **do ustalenia**). | Program ponawia generację od tej pozycji (nowa odpowiedź agenta). Czy stara odpowiedź zostaje / jest zastępowana: **do ustalenia** (propozycja T1: stara zostaje, nowa dopisana albo oznaczona jako regeneracja). | Ponawiać po cichu inną wiadomość. | zlecenie T1; propozycja T1 |
| 26 | Edytuje swoją wiadomość i wysyła ponownie. | Treść wiadomości człowieka jest zmieniona; od tego miejsca historia do modelu jest liczona na nowo (kolejne odpowiedzi agenta po tej wiadomości: **do ustalenia** — propozycja T1: usunąć lub unieważnić odpowiedzi poniżej edycji, z potwierdzeniem jeśli są). | Zmieniać wiadomość agenta jako „edycję człowieka”; edytować cudzą wiadomość w kanale tym samym API bez reguł kanału. | zlecenie T1; propozycja T1 |
| 27 | Wybiera „Rozgałęź od tej wiadomości”. | Powstaje **nowy wątek** (lub gałąź) z historią **do i z** tą wiadomością; dalsza rozmowa idzie w gałęzi, oryginał nietknięty. Relacja „rodzic / gałąź” w UI: **do ustalenia**. | Kasować oryginalny wątek przy rozgałęzieniu. | zlecenie T1; propozycja T1 |
| 28 | Usuwa wiadomość. | Wiadomość znika z UI; czy znika też z kontekstu modelu: **tak (propozycja T1)** po potwierdzeniu. Usuwanie tylko własnych vs też agenta: **do ustalenia** (propozycja T1: obie, z potwierdzeniem). | Usuwać bez śladu w audycie, jeśli kiedyś będzie wymagany; kasować całe wątki pod pozorem „usuń jedną”. | zlecenie T1; luki W6-UI1; propozycja T1 |
| 29 | Przypina wiadomość. | Wiadomość jest oznaczona jako przypięta i łatwa do znalezienia w tej rozmowie (pasek / sekcja przypięć — **układ do ustalenia**). Odepnij działa. Przypięcie przeżywa restart. | Przypinać w sposób niewidoczny po restarcie. | zlecenie T1; luki W6-UI1 |
| 30 | Wykonuje akcję na wiadomości, gdy agent pracuje / kolejka niepusta. | Akcje nie psują FIFO: **do ustalenia** per akcja (propozycja T1: kopiuj/przypnij zawsze; edycja/ponów/usuń — blokada albo potwierdzenie gdy tura poniżej jest w toku). | Zepsuć kolejkę (wiersz 17) bez komunikatu. | parytet wiersz 17; propozycja T1 |

### 1F. Osobne okno rozmowy

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 31 | Z menu wiersza wybiera osobne okno (dla agenta / aktywnego wątku). | Otwiera się osobne okno Electron z tą rozmową (historia, pole, Decyzja, Needs you tej rozmowy). Główne okno zostaje. | Otwierać dok mini-czatu zamiast pełnej rozmowy pod tą akcją (dok to wiersz 37, już „jest” — inna powierzchnia). | parytet wiersz 3; luki W6-UI2; zlecenie T1 |
| 32 | Pisze w osobnym oknie. | Wiadomości i stany synchrónizują się z tym samym wątkiem w głównym oknie (jedno źródło prawdy). Które okno „trzyma” fokus karty: **do ustalenia** (propozycja T1: oba pokazują te same karty; decyzja w jednym zamyka w drugim). | Dwie rozjechane historie tego samego wątku. | propozycja T1 |
| 33 | Zamyka osobne okno. | Wątek zostaje; można wrócić z głównego. Trwająca tura nie jest zabijana samym zamknięciem okna (**propozycja T1**). | Usuwać wątek przy zamknięciu okna. | propozycja T1 |
| 34 | Otwiera dwa osobne okna na **różne** wątki tego samego agenta. | Oba działają; stany wątków osobne (jak 3–4). Limit liczby okien: **do ustalenia**. | Mieszać wątki między oknami. | zlecenie T1; propozycja T1 |
| 35 | Restart programu z otwartym osobnym oknem. | Czy okna wracają same: **do ustalenia** (propozycja T1: nie trzeba przywracać pozycji okien w W6; wystarczy wątek w głównym). | Tracić historię wątku. | do ustalenia |
| 36 | Maximizes / zmienia rozmiar panelu w osobnym oknie. | Panel boczny (gdy jest) zachowuje się jak w głównym w zakresie już dostępnym; brakujące okienka subagent/pytanie = ten sam dług co wiersz 16, domykany z BE3. | Wywalić się przy braku panelu. | parytet wiersz 16; propozycja T1 |

---

## 2. Kryteria odbioru

**Skróty:** **J** = test jednostkowy (atrapa, folder tymczasowy); **E** = krok w prawdziwym oknie / `sandbox:e2e` (atrapa Codex); **R** = ręcznie, właściciel.

### 2A. Wątki (W01–W10)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W01 | „Nowy wątek” tworzy pusty wątek tego agenta; stary zostaje z historią (wiersz 1). | E | Backend BE1, UI |
| W02 | Lista wątków pokazuje ≥2 wątki jednego agenta z tytułami/placeholderami; nie miesza agentów (wiersze 2, 7). | E | BE1, UI |
| W03 | Przełączenie wątku zmienia tylko historię aktywnego; po restarcie wraca aktywny wątek (wiersz 3). | E | BE1, UI |
| W04 | Kolejka i karty Needs you są **per wątek**: przełączenie A→B nie przenosi kart; powrót do A odtwarza stan (wiersz 4). | J + E | BE1 |
| W05 | Tytuł wątku zapisuje się i przeżywa restart (wiersz 5). | E | BE1, UI |
| W06 | Archiwizacja chowa wątek z domyślnej listy; historia odtwarzalna; brak wysyłki na zarchiwizowanym bez przywrócenia (wiersz 6). | E | BE1, UI |
| W07 | Dwa równoległe wątki: osobne historie po restarcie (wiersz 7) — kryterium „gotowe” z luk W6-BE1. | E | BE1 |
| W08 | Wspomnienie agenta „zawsze” widać w drugim wątku; historia pierwszego nie jest wklejana jako kontekst drugiego (wiersz 8). | E | BE1 |
| W09 | Menu wiersza agenta ma pozycję „Nowy wątek” (parytet 3 / W6-UI2). | E | UI |
| W10 | Przy turze w toku w A przełączenie na B nie gubi pracy A (zgodnie z decyzją lidera po pytaniu otwartym). | E | BE1 |

### 2B. Kontekst (W11–W16)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W11 | Wskaźnik kontekstu widoczny obok pola w rozmowie z historią (wiersz 9). | E | BE2, UI |
| W12 | Brak danych od dostawcy → „niedostępne”, bez zmyślonego % (wiersz 9). | J | BE2 |
| W13 | Ręczne kompaktowanie zmienia stan kontekstu i jest widoczne w UI (wiersz 10). | E | BE2, UI |
| W14 | Usunięcie historii wątku wymaga potwierdzenia; czyści wiadomości wątku, nie pamięć agenta (wiersz 12). | E | BE2 |
| W15 | Po restarcie wskaźnik i stan po kompaktowaniu wracają (wiersz 13). | E | BE2 |
| W16 | Automatyczne kompaktowanie (jeśli zostaje) nie ukrywa faktu skrócenia (wiersz 11) — po decyzji lidera. | E | BE2 |

### 2C. Plan (W17–W22)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W17 | Przed długim zadaniem (wg reguły po decyzji) pojawia się karta planu z ≥2 krokami w Needs you (wiersz 14). | E (atrapa narzędziowa) | BE3, UI |
| W18 | Zatwierdź → kroki startują; widać postęp (wiersz 16). | E | BE3 |
| W19 | Odrzuć → zero skutków ubocznych kroków (wiersz 17). | E | BE3 |
| W20 | Stop w trakcie planu kończy pracę; brak wiszącego Thinking (wiersz 18). | E | BE3 |
| W21 | Karta planu przeżywa przełączenie wątku jak inne karty (zgodnie z W04) albo jest jasno związana z wątkiem. | E | BE3 |
| W22 | Puste kroki / karta bez listy = błąd walidacji, nie start (wiersz 15). | J | BE3 |

### 2D. Subagenci (W23–W28)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W23 | Start subagenta → widoczna karta/panel, powiązanie z rodzicem (wiersz 19). | E | BE3, UI |
| W24 | Panel pokazuje stan pracuje/done/błąd (wiersz 20). | E | UI, BE3 |
| W25 | Stop subagenta kończy sesję; rodzic nie wisi (wiersz 21). | E | BE3 |
| W26 | Przekroczenie limitu równoległych/głębokości = czytelna odmowa (wiersz 22). | J | BE3 |
| W27 | Okienko subagenta w panelu bocznym (domknięcie luki wiersza 16). | E | UI |
| W28 | Pytanie poboczne w panelu nie myli się z subagentem (osobny wpis UI) — zakres BE3 w lukach. | E | UI, BE3 |

### 2E. Akcje na wiadomościach (W29–W35)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W29 | Kopiuj → schowek zawiera tekst wiadomości (wiersz 24). | E | UI |
| W30 | Ponów → nowa odpowiedź agenta związana z tą pozycją (wiersz 25; szczegóły po decyzji). | E | BE + UI |
| W31 | Edytuj i wyślij ponownie → treść człowieka zmieniona; reguła wobec odpowiedzi poniżej zgodna z decyzją lidera (wiersz 26). | E | BE + UI |
| W32 | Rozgałęź → nowy wątek/gałąź z historią do wskazanej wiadomości; oryginał nietknięty (wiersz 27). | E | BE1 + UI |
| W33 | Usuń → wiadomość znika z UI (i z kontekstu, jeśli tak zdecydowano) po potwierdzeniu (wiersz 28). | E | BE + UI |
| W34 | Przypnij / odepnij → stan widoczny po restarcie (wiersz 29). | E | UI + BE |
| W35 | Akcje nie psują kolejki FIFO przy turze w toku (wiersz 30; po decyzji). | E | BE |

### 2F. Osobne okno (W36–W38)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W36 | Menu → osobne okno z tą samą rozmową/wątkiem (wiersz 31). | E | UI |
| W37 | Wiadomość wpisana w osobnym oknie widać w głównym dla tego wątku (i odwrotnie) (wiersz 32). | E | BE + UI |
| W38 | Zamknięcie okna nie kasuje wątku ani nie zabija tury (wiersz 33). | E | UI + BE |

### 2G. Bramka G3 — właściciel (W39–W42)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W39 | Na **prawdziwym** dostawcy: dwa wątki, przełączanie, osobne historie (powtórka W07 bez atrapy). | R | właściciel (+ Tester przy odbiorze) |
| W40 | Na prawdziwym dostawcy: wskaźnik kontekstu rusza się w długiej rozmowie (nie stoi w miejscu przy oczywistym wzroście). | R | właściciel |
| W41 | Na prawdziwym dostawcy: karta planu przy realnym wielokrokowym zleceniu + Zatwierdź/Odrzuć. | R | właściciel |
| W42 | Odbiór W6 bez błędów **blokujących** w oknie (bramka G3); lista znalezionych usterek w raporcie Testera. | R + E | Tester + właściciel |

---

## 3. Co wymaga właściciela

1. **W39–W41** — prawdziwy Codex/Claude (nie atrapa): wątki, kontekst, plan.
2. **W42** — akceptacja bramki G3 (czy usterka jest blokująca).
3. Logowanie na prawdziwe konta — bez zmian względem W5 (agenci nie logują się sami).
4. Ewentualne decyzje produktowe z sekcji 4, jeśli lider odroczy je do właściciela (domyślnie: **lider**).

---

## 4. Pytania otwarte do lidera (z rekomendacją)

| # | Pytanie | Rekomendacja T1 |
|---|---|---|
| Q1 | Co z turą w toku przy przełączeniu wątku? | Tura dokończa się w tle w swoim wątku; drugi wątek niezależny; wiersz agenta pokazuje stan. |
| Q2 | Jedna kolejka na agenta czy per wątek? | **Per wątek** (spójne z „własnym kontekstem” i wierszem 17). |
| Q3 | Karty Needs you: per wątek czy zbiorczo na agencie z filtrem? | Per wątek w treści; zbiorcze Needs you jak dziś, z oznaczeniem wątku. |
| Q4 | Pamięć: tylko per agent, czy też per wątek? | W6: zostawić pamięć per agent; historii wątków nie mieszać. Osobna pamięć per wątek = później, jeśli potrzeba. |
| Q5 | Archiwum vs usuń wątek na zawsze? | Archiwum odwracalne; „usuń na zawsze” osobno z potwierdzeniem. |
| Q6 | Jednostka wskaźnika kontekstu? | Szacunek tokenów jeśli model/CLI podaje; inaczej „niedostępne”. Bez zmyślonych %. |
| Q7 | Auto-kompakt vs tylko ręczne? | Zostawić auto w tle + zawsze ręczne + ostrzeżenie na wskaźniku. |
| Q8 | Kiedy obowiązkowa karta planu? | Heurystyka „wiele kroków / narzędzia z efektem” po stronie silnika; w W6 wystarczy wyzwalacz testowy + reguła w kontrakcie. |
| Q9 | Edycja planu przez człowieka? | W6: tylko Zatwierdź / Odrzuć; edycja listy w następnej iteracji. |
| Q10 | Limity subagentów? | Max kilka równoległych, głębokość 1 na start; wartości w kontrakcie. |
| Q11 | Kto startuje subagenta: tylko agent czy też człowiek z panelu? | Oba; człowiek = Stop + podgląd. |
| Q12 | Ponów: zastąpić odpowiedź czy dodać nową? | Dodać nową (albo oznaczyć regenerację), starej nie kasować po cichu. |
| Q13 | Edycja wiadomości człowieka a odpowiedzi poniżej? | Potwierdzenie: unieważnij / usuń odpowiedzi poniżej. |
| Q14 | Rozgałęzienie = nowy wątek na liście? | Tak, z linkiem „z wątku X”; oryginał bez zmian. |
| Q15 | Czy W6-UI1 (nieprzeczytane, prześlij do kanału, cytat) wchodzi w tę samą bramkę G3? | Tak jako część W6, ale **po** akcjach z T1; osobne kryteria UIxx w odbiorze Testera. |
| Q16 | Osobne okno: przywracać po restarcie? | Nie w W6; wystarczy wątek w głównym. |
| Q17 | Czy „osobne okno” to to samo co dok? | **Nie** — dok = mini-czat (37); osobne okno = pełna rozmowa (menu wiersza). |

---

## 5. Czego nie wiadomo (brak w źródłach)

1. Dokładne zachowanie OpenBota 0.70 dla rozgałęzień, limitu subagentów, formatu karty planu i wzoru wskaźnika kontekstu — w `luki-070.txt` są tylko skróty zadań i tabela luk, bez zrzutów ani kroków.
2. Czy 0.68 w ogóle miał pełne wątki per agent (parytet 0.68 wymienia „nowy wątek” w menu, ale odbiór W3 pokazał brak) — traktuję wątki jako cel W6 z luk 0.70, nie jako już opisane E2E 0.68.
3. Format IPC / nazwy metod — **nie projektuję tu kontraktu**; to Backend po decyzjach Q1–Q14.
4. Teksty UI EN/PL — poza W6 (W7 język).
5. Bogata treść, `$` / `@` w kompozytorze, grupy paska, 100 MB załączników — poza T1 (inne ID w lukach).
6. Nie uruchamiałem programu ani nie czytałem kodu nowszego niż `a6fe240` do tego opisu.

---

## 6. Mapowanie na zadania z luk

| ID luk | Zakres w tym specu |
|---|---|
| W6-BE1 | §1A, W01–W10, W32 |
| W6-BE2 | §1B, W11–W16 |
| W6-BE3 | §1C–1D, W17–W28 |
| W6-UI1 | §1E (+ Q15), W29–W35 |
| W6-UI2 | §1A W09, §1F W36–W38 (fragment: nowy wątek + osobne okno; reszta menu/grup poza T1) |
| W6-T1 (odbiór w lukach) | później: przebieg W01–W42; ten dokument to **spec wejściowy**, nie raport odbioru |

---

## Commity

Zobacz SHA w wyniku kanału na `team/tester/w6-spec`.
