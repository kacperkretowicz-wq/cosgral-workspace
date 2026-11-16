# W5-BE5: konta (K1), modele zapasowe (BE4) i punkty końcowe (K2) w jednym silniku

**Następny krok dla lidera:** scalić `team/backend/w5-be5`. Potem pełny `bun run check` (chwiejny test jest teraz deterministyczny).

**Stan:** zrobione na atrapach, tylko testy jednostkowe. Electron i `sandbox:e2e` nie były uruchamiane.

## 1. Test silnika (nowy plik `src/backend/agent-service-fallback-accounts.test.ts`)

Prawdziwe `AgentService`, `ProviderRegistry`, `EndpointStore` i `EndpointAgentClient`. Codex każdego konta to atrapa w procesie (osobna dla każdego konta, jak u K1). Punkt końcowy to serwer HTTP na 127.0.0.1 z dwoma modelami. Pula: konto tego komputera, Work, Home.

| Przypadek | Co sprawdza | Wynik |
|---|---|---|
| (a) | Limit przed akcją przełącza na Work z tym samym modelem. Brak `model-fallback`, punkt końcowy nie pytany, model własny dalej używalny w rejestrze. | zielony |
| (b) | Wszystkie 3 konta wyczerpane. Kolejność: `switched`, `switched`, `exhausted`, potem model. Używana jest **własna** lista, a nie ogólna. | zielony |
| (b) | Agent bez własnej listy idzie za listą ogólną `"*"`. Własna **pusta** lista wygrywa: po kontach nic więcej nie jest próbowane. | zielony |
| (c) | Lista `[gpt-5.6-terra, endpoint…]`. Żadne konto nie dostaje tury z `terra`, wybrany jest punkt końcowy. | zielony |
| (d) | Model punktu końcowego jako zapasowy. Model **usuniętego** punktu jest pomijany i pokazany w `unavailable`. | **był czerwony**, naprawione |
| (e) | Po resecie wraca na pierwsze konto i własny model. Jest `model-fallback` z powrotem i aktywne konto tego komputera. | zielony |
| (e) | Pierwsze konto zwolniło się wcześniej (10 min) niż pozostałe (1 h, 2 h). Agent wraca od razu. | **był czerwony**, naprawione |
| okno | Okno zużycia Codex konta tego komputera na 100 % przy wolnym Work nie przeskakuje puli na model zapasowy. | **był czerwony**, naprawione |

## 2. Błędy złączenia BE4/K1/K2 i poprawki (minimalne)

1. **Usunięty punkt końcowy w liście zapasowej.**
   - Błąd: rejestr znał tylko usunięte agenty ACP. Model `endpoint:<usunięty>/…` był wybierany, `turn/start` rzucał błąd i wiadomość kończyła się bez próby następnego modelu.
   - Poprawka: `ProviderRegistry.useEndpointLookup(exists)`, którą podpina `AgentService.useProviders`. Taki model trafia do `unavailable` i nie jest próbowany. Bez podpiętego sklepu działa jak dawniej.
2. **Blokada dostawcy trzymała agenta na modelu zapasowym, choć konto było wolne.**
   - Błąd: po wyczerpaniu puli rejestr blokował cały Codex do resetu **ostatniego** konta. Gdy pierwsze konto zwolniło się wcześniej, agent dalej siedział na modelu zapasowym.
   - Poprawka: `chooseModel(botId, model, tried, accountFree?)`. `AgentService` podaje `accountFree` z `AccountRouter.route(...).kind === "use"`, tylko dla Codex i Claude. Wolne konto znosi blokadę dostawcy znaną rejestrowi. Kiedy wolnego konta nie ma, (c) dalej obowiązuje. Wybór modelu nadal nie wybiera konta.
3. **Okno zużycia konta tego komputera blokowało całą pulę.**
   - Błąd: `account/rateLimits` czyta tylko klient systemowy. Okno 100 % blokowało wszystkie modele Codex, więc agent przeskakiwał od razu na model zapasowy, mimo wolnego Work.
   - Poprawka: ta sama co w punkcie 2. Teraz tura idzie na konto tego komputera, dostaje limit i przechodzi na Work. To jedna szybka, nieudana próba, bez modelu zapasowego.

Zmienione linie: `provider-registry.ts` (+~25), `agent-service.ts` (+8, 2 wywołania), komentarz `unavailable` w `ipc-providers.ts`. Kształt kontraktu, `activeModel` i `model-fallback` się nie zmieniły.

## 3. Chwiejny test „reads the canonical SQLite conversation during an active stream”

- **Przyczyna:** wyścig w teście, nie w kodzie. Test czytał rozmowę zaraz po statusie `running`. Ten status przychodzi z `turn/started`, a delta „Streaming” to osobny zapis atrapy na stdout. Pod obciążeniem delta przychodzi w późniejszym kawałku, więc odczyt nie miał jeszcze tekstu.
- **Dowód:** atrapa dostała `OPENBOT_FAKE_DELTA_DELAY`. Przy 400 ms stara asercja padała **za każdym razem**, w tym samym miejscu (`expect(snapshot.messages)…`).
- **Poprawka:** test ustawia opóźnienie 400 ms (wyścig jest zawsze obecny) i czeka na zdarzenie `conversation-delta` tej tury. To zdarzenie wychodzi po zapisie do SQLite. Dopiero potem test czyta raz. Asercja „bez `thread/read`” zostaje.
- Commit `7a1e989f5`.

## 4. Testy i kontrole

| Co | Wynik |
|---|---|
| `agent-service-fallback-accounts.test.ts` (nowy) | 8/8 (przed poprawką 5/8) |
| `provider-registry.test.ts` (+2 testy) | 20/20 |
| Razem: nowy plik, `agent-service-accounts`, `agent-service-endpoints`, `provider-registry`, `account-router`, `agent-service`, `ipc-fallback-models` | 7 plików, 152/152 |
| `bun run lint` | zielony (kod wyjścia 0) |
| `typecheck:node`, `typecheck:renderer` | zielone |

Testy uruchamiałem przez `node node_modules/vitest/vitest.mjs run <pliki>`.

## Czego nie sprawdziłem

1. Electrona, `sandbox:e2e` i pełnego `bun run check`. Stabilność chwiejnego testu w pełnym przebiegu pod obciążeniem potwierdzi dopiero Twój `check`.
2. Prawdziwego Codex i Claude: czy prawdziwy CLI przy oknie 100 % od razu zwraca błąd limitu. Atrapa tak robi, więc „jedna szybka nieudana próba” z punktu 2.3 jest założeniem.
3. Claude w puli: tylko kod (`accountFree` obejmuje `claude`), bez testu silnika. Atrapy Claude dla kont nie ma.
4. Wiersz agenta i strona Usage: rejestr nadal pokazuje limit Codex do resetu ostatniego konta, choć agent już pracuje na wolnym koncie. Nie zmieniałem tego, to tylko wyświetlanie.
5. „Per dostawca”: bez zmian, zgodnie z decyzją (lista ogólna i lista agenta).
