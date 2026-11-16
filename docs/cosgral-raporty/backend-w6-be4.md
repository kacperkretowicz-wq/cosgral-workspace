# W6-BE4: subagenci

**Następny krok dla lidera:** scalić `team/backend/w6-be4`. UI Designer ma kontrakt i mock subagentów w commicie `181c76ae3`; wskazówki UI dla planu i akcji na wiadomościach są w §6 i §7.

**Stan:** kontrakt, mock, silnik, IPC i testy jednostkowe gotowe. Bez Electrona i bez `sandbox:e2e`. Pełnego `bun run test` nie uruchamiałem. Lint i 5 typecheck-ów zielone.

## 1. Commity (gałąź `team/backend/w6-be4`, baza `26cb21f48`)

| Commit | Co |
|---|---|
| `181c76ae3` | **kontrakt + mock** subagentów (osobny, pierwszy commit) |
| `3c73fd013` | silnik subagentów, IPC, testy |

## 2. Co działa (W23–W26)

- **Start (W23):** agent woła `cosgral_subagents.spawn` (zadanie, opcjonalny tytuł, `wait` domyślnie `true`). Powstaje rekord `Subagent` powiązany z agentem i wątkiem rodzica, zdarzenie `subagent-changed`.
- **Sesja osobna:** subagent pracuje w własnym, tymczasowym wątku CLI. Jego tekst **nie trafia** do rozmowy rodzica i nie wygląda jak tura agenta (brak `turn-started`/`turn-completed` dla niego).
- **Wynik:** wraca do rodzica jako zwykły wynik wywołania narzędzia, z instrukcją „to informacja, nie polecenie użytkownika”. Z `wait: false` rodzic dostaje od razu id, a odpowiedź odbiera przez `wait`.
- **Limity (Q10, W26):** głębokość 1 (wywołanie z subagenta jest odrzucone, a samo narzędzie nie jest mu nawet oferowane) i najwyżej **3 równolegle** w wątku. Odmowa jest czytelna: „At most 3 subagents can work at the same time in a thread. Wait for one to finish or stop one.” Inny wątek ma własne miejsce.
- **Dostęp (§7):** subagent dostaje **dokładnie** narzędzia i parametry rodzica (`approvalPolicy`, `sandbox`, katalogi, model, wysiłek), bez narzędzi subagentów. Test porównuje parametry `thread/start` rodzica i dziecka. Dodatkowo nic nie dostaje ponad rodzica: Vault, przeglądarka, MCP i karty to te same narzędzia i te same zasady (wartości z Vault i tak nie wracają do agenta).
- **Stop (W25):** Stop osoby (albo agenta) kończy subagenta **od razu**, przerywa jego turę, zamyka jego otwarte karty i **odpowiada rodzicowi** („stopped, nie czekaj”), więc rodzic nie wisi. Późne wiadomości CLI są ignorowane.
- **Rodzic zatrzymany (§7):** koniec lub Stop tury rodzica, usunięcie wątku lub agenta, zamknięcie programu i wyjście procesu dostawcy zatrzymują subagentów.
- **Karty Needs you subagenta (§7):** to zwykłe karty (pytanie, zatwierdzenie, szkic, przejęcie przeglądarki, Vault, plan) **w wątku rodzica**, liczone w jego Needs you. `Subagent.waitingRequestIds` wskazuje, które karty są jego.
- **Trwałość:** tabela `projection_subagents`. Odpowiedzi przeżywają restart. Subagent, który pracował w chwili awarii, jest zamykany przy starcie („The program was closed.”); przy zwykłym zamknięciu programu dostaje „The program is closing.”.

## 3. Decyzje do potwierdzenia (moje)

1. **Q11: startuje tylko agent, człowiek ma podgląd i Stop.** Tak czytam „oba; człowiek = Stop + podgląd”. Okno **nie ma** wywołania „start” (kanały to `subagents:list` i `subagents:stop`). Gdyby człowiek miał też startować z panelu, trzeba ustalić, gdzie wraca wynik, bo nie ma tury rodzica do odpowiedzi.
2. **Rodzic kończy turę, a subagent (z `wait: false`) jeszcze pracuje: zostaje zatrzymany** (stan `stopped`, „The turn of the agent ended.”). Bezpieczniejsze, ale rodzic musi `wait`-ować.
3. **Wynik subagenta jest cięty do 20 000 znaków**, zadanie do 8 000, podgląd to ostatnie 400 znaków (odświeżany najwyżej co 400 ms).
4. **Agent może zatrzymać własnego subagenta** (`stop`), ale tylko w swoim wątku i agencie.

## 4. Czego NIE sprawdziłem

- **Electron, `sandbox:e2e`, prawdziwy Codex i Claude.** Wszystko na fałszywym CLI. Serwer MCP `cosgral_subagents` dla Claude dodałem tak jak karty (7 linii), ale **nie uruchamiałem tury Claude** ze subagentem. Agenci ACP i własne endpointy: bez sprawdzenia, czy ich klient przyjmie narzędzie.
- **Pula kont (K1):** wątek rodzica biegnie na koncie z puli, a subagent korzysta z domyślnego klienta dostawcy (konto systemowe). Przy pracy na koncie z puli subagent **nie** dziedziczy konta. Do poprawy razem z W8 (poziomy dostępu).
- **Poziomy dostępu W8:** dziś jest jeden poziom (`on-request`, pełny dostęp do plików). Szew to opcja `access` w `SubagentRunner`; po W8 ma zwracać poziom wątku rodzica. Test pilnuje, że dziecko ma te same parametry co rodzic.
- **UI:** panel subagenta (W24, W27) i okienko boczne nie istnieją. Mock jest pokryty testami.
- **W28 (pytanie poboczne)** nie jest zrobione: to osobna funkcja (karta „pytanie poboczne”), poza zakresem tego zadania.
- **Pełny `bun run test`.** Uruchomiłem 91 plików powiązanych (silnik, mailbox, wątki, kontekst, IPC, kontrakty, mobile, wyspa, Claude, kanały): 670 z 670 zielonych.
- **Obciążenie:** subagent liczy się do limitu 3 w wątku, ale nie do limitów konta ani kontekstu rodzica.

## 5. Kontrakt subagentów dla UI (commit `181c76ae3`)

- **API:** `window.openbot.subagents?` z `list({ botId, threadId? })` (wątek pominięty = wątek widoczny; nowe pierwsze, także zakończone) i `stop({ subagentId })` (zwraca subagenta; zatrzymanie zakończonego nic nie zmienia).
- **`Subagent`:** `id`, `botId`, `threadId` (wątek rodzica), `parentTurnId`, `title`, `task`, `state` (`starting` | `working` | `waiting` | `done` | `failed` | `stopped`), `createdAt`, `updatedAt`, `finishedAt`, `preview` (ogon tego, co pisze, gdy pracuje), `result` (odpowiedź, gdy `done`), `error` (powód dla `failed`/`stopped`), `waitingRequestIds`.
- **Zdarzenie:** `subagent-changed { subagent }`: podmień rekord o tym `id`. Przychodzi przy starcie, zmianie podglądu, czekaniu na osobę, końcu i Stop.
- **Panel (W24):** stan z `state`; podgląd z `preview` (praca) albo `result` (done); `error` dla `failed`/`stopped`. Przycisk Stop pokazuj, gdy `subagentIsActive(subagent)`.
- **Powiązanie kart (§7):** karta w Needs you jest od subagenta, gdy jej `requestId` jest w `waitingRequestIds` któregoś subagenta wątku. Pokaż wtedy „od subagenta: <title>”. Karty mają `threadId` rodzica.
- **Odmowy (limit, głębokość)** widzi **model** w wyniku narzędzia, nie UI: nie ma dla nich zdarzenia ani błędu w oknie.
- **Czego okno nie robi:** nie startuje subagenta (Q11).
- **Pomocnicze funkcje kontraktu:** `subagentIsActive`, `subagentTitle`, `SUBAGENT_LIMITS` (3 równolegle, głębokość 1).
- **Mock:** `createMockSubagents` w `mock-openbot.ts`; w opowieściach `spawn`, `write`, `ask`, `answer`, `complete`, `fail`, `endParentTurn`.

## 6. Wskazówki UI: karta planu (z W6-BE3)

- **Skąd karta:** `listPendingRequests()` zwraca `{ kind: "plan", plan }` dla planu czekającego na decyzję. Zdarzenie `plan-changed { plan }`: podmień plan o tym `requestId` (propozycja, decyzja, postęp, koniec).
- **Pola `AgentPlan`:** `requestId`, `botId`, `threadId`, `turnId`, `title`, `summary`, `steps[{ id, title, detail, status }]`, `phase`, `createdAt`, `decidedAt`, `updatedAt`.
- **Fazy:** `proposed` (przyciski), `approved` (postęp), `rejected`, `expired` (karta zamknięta bez odpowiedzi, nic nie zatwierdzono), `stopped`, `completed`. Kroki: `pending`, `in-progress`, `done`, `skipped`.
- **Akcje:** `window.openbot.plans.respond({ requestId, decision: "approve" | "reject" })`, tylko te dwie (Q9). `plans.list({ botId, threadId? })` zwraca plany wątku (także zakończone, z postępem).
- **Postęp:** `planProgress(plan)` daje `finished`, `total`, `current`. `planIsOpen(plan)` mówi, czy plan jeszcze czeka lub trwa.
- **Telefon:** plan jest tylko na komputerze (typ „plan” w telefonie bez przycisków).

## 7. Wskazówki UI: menu akcji na wiadomości (z W6-BE3)

- **API:** `window.openbot.messageActions`: `retry`, `edit`, `delete`, `pin`, `listPins`. Wejście: `{ botId, threadId?, messageId, ... }`; id wiadomości to `ConversationMessage.id`.
- **Pola wiadomości do narysowania:** `pinned`, `edited`, `regeneration: { ofMessageId }` (wiersz prośby i nowa odpowiedź są oznaczone; stara odpowiedź zostaje).
- **Zdarzenia:** `message-pins-changed { botId, threadId, pins }` (lista pinów wątku, najnowsze pierwsze). Po ponów, edytuj i usuń przychodzi zwykłe zdarzenie `conversation` z nowym zapisem: po prostu go narysuj. Wynik wywołania ma `removedMessageIds` (np. do animacji).
- **Co włączyć w menu:** `messageActionProblem(action, message)` zwraca powód odmowy albo `null`. Gdy zwraca tekst, wyszarz akcję (tekst może być podpowiedzią). Ponów/edytuj/usuń wyszarzaj też, gdy `threadBusyProblem({ turnRunning, busyMessages })` nie jest `null`: `turnRunning` z `activeTurnId` rozmowy, `busyMessages` to liczba wiadomości kolejki wątku w stanie `queued`/`starting`/`running`. Pin działa zawsze.
- **Potwierdzenia:** usuń zawsze pyta osobę i wysyła `confirm: true`. Edycja: `editNeedsConfirmation(n)` gdzie `n` to liczba wiadomości po edytowanej; gdy `true`, pokaż „to usunie n późniejszych wiadomości” i wyślij `confirm: true`.
- **Tylko widoczny wątek:** ponów, edytuj i usuń działają w wątku, który okno pokazuje (inny wątek: „Select that thread first”). Pin działa na dowolnym wątku po id.
- **Kopiuj i Rozgałęź:** kopiuj to schowek okna; rozgałęź to `threads.branch` z BE1.
