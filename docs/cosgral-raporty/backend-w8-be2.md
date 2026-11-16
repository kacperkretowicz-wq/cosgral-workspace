# W8-BE2: budżety w silniku (krok 1) i izolacja procesów (krok 2)

## Krok 1: budżety KK W8-KK2 podpięte w `agent-service.ts`

**Stan:** gotowe. Tylko testy jednostkowe na prawdziwym `AgentService` z atrapą Codex (`agent-service-budgets.test.ts`, 10 testów).

1. **Liczenie (Q6).** Przy `thread/tokenUsage/updated` silnik czyta `tokenUsage.total.totalTokens`, liczy przyrost od ostatniego raportu wątku i dopisuje go do tury. Przy końcu tury (zakończona, nieudana albo zatrzymana; także tura subagenta, na koncie agenta-rodzica) jedno `meter.record({ botId, tokens, costUsd: null })`. Cena jest zawsze `null`: Codex jej nie podaje, a adapter Claude nie przekazuje `total_cost_usd`, więc dolarów nie zgaduję.
2. **Restart.** Ostatnia suma każdego wątku leży w bazie (`projection_budget_thread_totals`, nowy plik `budget-thread-totals.ts`), więc wątek wznowiony po restarcie liczy tylko przyrost, nie całość od zera. Licznik i budżet leżą w bazie przestrzeni (KK2).
3. **Bramka.** W `#drainBot` przed nową turą `meter.gate(botId)`. Przy `allowed: false` wiadomość zostaje w kolejce (status `queued`), a kolejka dostaje `heldReason` (nowe opcjonalne pole `QueueSnapshot.heldReason`, jedno zdanie z budżetu: agenta albo przestrzeni). Tura w toku nie jest przerywana (test: brak `turn/interrupt`, odpowiedź dochodzi).
4. **Odblokowanie.** Po zmianie limitu (`budgets-changed` → `service.budgetsChanged()` w `main/index.ts`) oraz co minutę, gdy ktoś czeka (nowy dzień lub miesiąc UTC nie wysyła zdarzenia). Timer jest `unref` i kończy się, gdy nikt nie czeka.
5. **Nie podpięte (celowo):** `meter.preferred(...)` (tańszy model). Reguły „prosta praca" nie ma i nie będę jej zgadywać, a wariant „przy ostrzeżeniu" musi współgrać z dostępnością modeli i listą zapasowych W5. Propozycja: osobne małe zadanie po decyzji, co jest „prostą pracą". Cena Claude: adapter jej nie ma; wymaga zmiany w `claude-client.ts` (propozycja poza tym krokiem).

**Czego nie sprawdziłem (krok 1):** prawdziwego Codex (co dokładnie jest w `tokenUsage.total` po kompakcie i wznowieniu; zabezpieczenie: spadek sumy liczy się jako nowy start), Claude (nie podaje tokenów w tym zdarzeniu, więc jego tury dziś nie zwiększają licznika), interfejsu (UI musi pokazać `heldReason`), Electrona.
