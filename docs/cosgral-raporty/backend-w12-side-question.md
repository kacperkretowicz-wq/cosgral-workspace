# Backend W12 – wykonawca pytania bocznego (BE-D, krok 2)

Port `ask` z `ComposerService` (W11) ma teraz wykonawcę: UI dostaje odpowiedź zamiast błędu "not connected".

## Jak działa
1. `runSideQuestion` (`side-question-runner.ts`) otwiera wątek dostawcy: `ephemeral: true`, `sandbox: read-only`, `approvalPolicy: never`, bez `dynamicTools` (żadnych narzędzi programu).
2. Czat jest czytany tylko jako tekst: ostatnie wiadomości (12 000 znaków łącznie, 1 500 na wiadomość), pytanie jest ostatnie, instrukcja każe odpowiedzieć bez poleceń i zmian.
3. Wątek pytania nie jest zarejestrowany w `AgentService` (`#threadToBot`), więc zwykła obsługa powiadomień go ignoruje: wątek agenta, jego kolejka i pamięć nie widzą pytania ani odpowiedzi. Runner słucha powiadomień osobnym nasłuchem (`client.off` dodane do interfejsu `AgentClient`, każdy klient to EventEmitter).
4. Odpowiedź narasta (cały tekst naraz) przez `onText`, `ComposerService` wysyła `side-question-changed`.
5. Anulowanie: `turn/interrupt`, koniec bez błędu. Błąd tury: słowa dostawcy. Cisza 180 s: "took too long".

## Szew w agent-service.ts
`runSideQuestion(run)`: ~20 linii (klient agenta, historia z bazy, transport = `client.request` i `client.on/off`). W `main/index.ts` jedna linia: `ask: (run) => service.runSideQuestion(run)`.

## Testy
`side-question-runner.test.ts` 6/6 (wątek tylko do odczytu, strumień, obce wątki ignorowane, błąd, anulowanie, limit czasu, prompt); `agent-service.test.ts -t W12` 3/3 (pytanie na prawdziwym serwisie z atrapą: odpowiedź jest, czat i kolejka bez zmian, sesja agenta nietknięta); typecheck node, Biome (1 ostrzeżenie dotyczące kolejności sygnatur naprawione).

## Nie sprawdzone / ograniczenia
- Prawdziwy Codex/Claude: tylko atrapa. `sandbox: read-only` i `ephemeral` to pola protokołu Codex; Claude Agent SDK może je ignorować (wtedy pytanie opiera się na instrukcji "bez narzędzi").
- Agent ACP i endpoint: nie sprawdzano.
- Pytanie nie zużywa budżetu agenta w naszym liczniku (nie przechodzi przez `budget-meter`).
