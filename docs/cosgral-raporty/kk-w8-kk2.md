# KK Fullstack W8-KK2: budżety i licznik kosztu

Data: 16.11.2026. Gałąź `team/kk/w8-kk2` (od `team/kk/w8-kk1` @ `42c6fbcfa`). Spec: `spec-w8.md` §1E, W8-25…29; decyzje Q6, Q7, Q11. Tylko testy jednostkowe, bez Electrona.

## Wynik w jednej linii

**Kontrakt i mock w osobnym pierwszym commicie `74504718e`. Silnik (licznik w bazie przestrzeni, bramka przed nową turą, preferowany tańszy model, eksport CSV, IPC) w nowych plikach, wpięty w `main`. `agent-service.ts` nietknięty: dwa hooki, bez których nic nie jest liczone ani zatrzymywane, opisałem niżej jako prośbę do Backendu. Dopóki ich nie ma, budżet można ustawić, ale zużycie zostaje na zero.**

## 1. Co jest

| Element | Zasada |
|---|---|
| Zakres | budżet **agenta** albo **przestrzeni**, na której program działa; okres: dzień lub miesiąc kalendarzowy (UTC) |
| Limit | tokeny (liczba całkowita) i/lub dolary; pusty limit = brak sprawdzania |
| Dolary (Q6, W8-29) | **tylko z cen, które dostawca podał.** Tura bez ceny dodaje tokeny, nie dolary; licznik mówi `costComplete: false` („dolary to dolna granica”). Limit dolarowy bez żadnej ceny i bez limitu tokenów jest oznaczony `enforceable: false` i niczego nie zatrzymuje, a powód to mówi wprost |
| Stan | `ok` → `warning` (od udziału, domyślnie 80 %) → `exhausted` |
| Twardy stop (W8-26) | przy `hardStop` nowa tura płatna nie startuje; powód w jednym zdaniu. Tura w toku nie jest przerywana (bramka pyta tylko przed startem). Bez `hardStop` tylko ostrzeżenie |
| Tańszy model (Q7, W8-27) | `preferredModel`: tańszy model jest wybierany **tylko spośród modeli dozwolonych agentowi** (jego model i lista zapasowa), dla prostej pracy albo w stanie `warning` (opcja). Nigdy nie dodaje modelu, konta ani zgody; konta i listy zapasowe W5 działają po tym bez zmian |
| CSV (W8-28) | kolumny: dzień, zakres, id agenta, tokeny, tury, dolary (puste, gdy nie podano), kompletność. Bez nazw, tekstów, ścieżek. Komórka zaczynająca się od `=`, `+`, `-`, `@`, tabulatora lub CR dostaje apostrof (formuły w arkuszu). IPC zwraca tekst; okno zapisuje plik (nic nie zapisuję po stronie programu) |
| Izolacja (W8-K1) | budżet i licznik leżą w bazie **przestrzeni**, na której program działa, więc budżet klienta A nie miesza się z klientem B (test na dwóch bazach) |

Kontrakt: `window.openbot.budgets` (`list`, `set`, `clear`, `exportCsv`), zdarzenie `budgets-changed` z całym przeglądem, `BudgetStatus` ma `state`, `blocked`, `reason`, `tokenPercent`, `costPercent`, `enforceable`, `usage` (tokeny, tury, dolary, `pricedTurns`, `costComplete`). Kanały `budgets:*` tylko dla tego komputera (obcy serwer i telefon dostają odmowę; dopisane do `local-only-ipc.test.ts`).

**Dla UI:** pokazać stan i `reason` (spokojny napis), przy `costComplete: false` dopisek „koszt niepełny”, przy `enforceable: false` podpowiedź „ustaw limit tokenów”, przy `blocked` kartę z powodem (zdanie z `reason`). Brak ceny to „koszt niedostępny”, nigdy 0 USD.

## 2. Hooki dla Backendu (prośba, `agent-service.ts` nietknięty)

Silnik ma gotowe `BudgetMeter` i `UsageDeltaTracker` (`src/backend/budget-meter.ts`). Brakują dwa wywołania w `AgentService`:

1. **Liczenie zużycia** (po turze): w obsłudze `thread/tokenUsage/updated` Codex podaje narastającą sumę wątku `tokenUsage.total.totalTokens` (dziś silnik czyta tylko `last` do kontekstu). `const used = tracker.observeTotal(threadId, total)` daje tokeny od ostatniego raportu (nowy wątek liczy całość; po restarcie wznowionego wątku najpierw `tracker.baseline(threadId, total)`). Potem `meter.record({ botId, tokens: used, costUsd: null })`. Codex nie podaje ceny, więc `null`.
2. **Bramka przed nową turą**: w `#drainBot` przed `#startDelivery(context)` wywołać `meter.gate(botId)`. Przy `allowed: false` wiadomość zostaje w kolejce, a osoba dostaje kartę lub komunikat z `reason` (to samo zdanie dla agenta i dla przestrzeni; `stoppedBy` mówi, który budżet). Kolejka rusza po podniesieniu limitu lub nowym okresie: wystarczy wywołać `#scheduleDrain` po zdarzeniu `budgets-changed` (np. `meter` ma ten sam `emit`).
3. **Opcjonalnie, tani model**: tam, gdzie wybierany jest model tury, `meter.preferred(botId, [model, ...fallbacki], simpleWork)`. Heurystyka „prosta praca” jest po stronie silnika (jej nie zgaduję).
4. **Claude:** wynik SDK (`result`) ma pole `total_cost_usd` (jest w `sdk.d.ts`), ale adapter go nie przekazuje. Do rozważenia: przekazać jako `costUsd`. Uwaga do decyzji: dla kont z subskrypcją to szacunek „jak za API”, nie rachunek. Proponuję liczyć je jako cenę podaną przez dostawcę, ale w oknie podpisać „szacunek dostawcy”.
5. `meter` w `main/index.ts` to `budgetMeter` (powstaje razem z magazynem bota, na bazie bieżącej przestrzeni); do `AgentService` można go podać tak jak `useEndpoints(...)`.

## 3. Testy

| Plik | Co | Wynik |
|---|---|---|
| `ipc-budgets.test.ts` (kontrakt) | okresy (luty, grudzień), stany i zdania, dolary bez ceny i niepełne, tańszy model tylko spośród dozwolonych, CSV bezpieczny, parsery (limity, okres, ostrzeżenie, scope, daty), strażnik statusu, zdarzenie w `AgentEvent` | 9/9 |
| `mock-budgets.test.ts` | te same reguły w mocku, CSV | 6/6 |
| `budget-meter.test.ts` | prawdziwa baza: liczenie, bramka agenta i przestrzeni, miękki budżet, dolary tylko z cen i dokładna suma, nowy okres, restart, czyszczenie zostawia licznik, zachowanie niewypowiedzianych pól, zdarzenia bez powtórek, tańszy model, CSV, dwie przestrzenie nie mieszają się, uszkodzony zapis = brak budżetu; `UsageDeltaTracker` | 14/14 |
| `budgets-ipc.test.ts` | prawdziwy licznik z zaufaniem okna: lista, ustawienie, zatrzymanie i zdjęcie, eksport jako tekst, odmowy (parser, inny serwer, niezaufana strona) | 3/3 |
| `local-only-ipc.test.ts` | 4 kanały `budgets:*` odmawiają obcym serwerom i telefonowi | 6/6 |
| `src/main`, `stories`, budżety, przestrzenie razem | | 57 plików, 308/308 |
| `bun run lint` (881 plików), `typecheck:node`, `typecheck:renderer` | | zielone |

## 4. Czego nie sprawdziłem i decyzje do potwierdzenia

1. **Zużycie nie jest jeszcze liczone ani nie zatrzymuje tur**, dopóki Backend nie wpisze hooków z pkt 2. Dziś potwierdzone jest tylko to, co robi licznik po wywołaniu, nie to, że prawdziwa tura go wywoła.
2. **Nie sprawdziłem, co dokładnie podaje prawdziwy Codex** w `tokenUsage.total` (czy rośnie monotonicznie po wznowieniu i kompakcie); delta ma na to zabezpieczenie (niższa suma = nowy start), ale z atrapy, nie z prawdziwego CLI. Cen z Codex nie ma.
3. **Router „tańszy model” (W8-27)** to reguła i funkcja z testami; wybór modelu w silniku jej jeszcze nie woła. Nie ma heurystyki „prosta praca”.
4. Dzień i miesiąc są w **UTC**, nie w czasie lokalnym (decyzja do potwierdzenia: północ UTC to 1:00 lub 2:00 w Polsce).
5. Po zmianie okresu budżetu z miesiąca na dzień licznik przelicza się z tych samych danych dziennych (nic nie jest tracone).
6. Eksport zwraca tekst; zapis pliku (okno dialogowe) to UI. Limit 20 000 wierszy; powyżej odmowa z prośbą o krótszy zakres.
7. Dane sprzed licznika (wcześniejsze tury) nie istnieją: zaczyna od zera.
8. Nie uruchamiałem Electrona ani nie widziałem interfejsu (go jeszcze nie ma).
9. Konflikty przy scalaniu: `ipc-channels.ts`, `ipc-conversation.ts`, `ipc-desktop-apis.ts`, `ipc.ts`, `preload/index.ts`, `mock-openbot.ts`, `main/index.ts`, `local-only-ipc.test.ts`: zostawić obie strony.
