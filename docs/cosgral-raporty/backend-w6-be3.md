# W6-BE3: kontekst per wątek, plan, akcje na wiadomościach

**Następny krok dla lidera:** scalić `team/backend/w6-be3`. UI Designer ma kontrakt i mock w commicie `726f263fb` (plan i akcje) oraz hak kontekstu w `d51b086dc`.

**Stan:** krok 0, 1 i 2 gotowe (kontrakt, mock, silnik, IPC, testy jednostkowe). Bez Electrona i bez `sandbox:e2e`. Pełnego `bun run test` nie uruchamiałem (zgodnie z poleceniem).

## 1. Commity (gałąź `team/backend/w6-be3`, baza `6e0b7d3e4`)

| Commit | Co |
|---|---|
| `f9347f9a8` | fix: merge BE1+BE2 (krok 0) |
| `d51b086dc` | kontekst per wątek (krok 1) |
| `726f263fb` | **kontrakt + mock** planu i akcji na wiadomościach (osobny, pierwszy commit kroku 2) |
| `464b8ed4e` | silnik planu (W17–W22) |
| `b2a5b0aef` | silnik akcji na wiadomościach (W29–W35) |

## 2. Krok 0: co wymagało poprawki

- Scalenie BE1+BE2 było czyste: `typecheck:node`, `typecheck:renderer`, testy z listy zielone (36 plików, 311 testów).
- Jedyna poprawka: lint na **moim własnym** teście BE1 (`agent-service-threads.test.ts`, niesformatowany `.some(...)`). Commit `f9347f9a8`, bez zmiany zachowania.

## 3. Krok 1: kontekst per wątek

- **Pytanie o inny wątek niż widoczny** zwraca stan tamtego wątku z bazy, nie błąd „Only the conversation shown…”. Nieznany wątek: stan „unavailable” z powodem.
- **Kompakcja** tylko dla wątku aktywnego albo bezczynnego z sesją do wznowienia. Inaczej `canCompact=false` z powodem (zajęty agent, wątek zarchiwizowany, brak sesji).
- **Archiwizacja i usunięcie wątku** czyszczą jego kontekst (`forgetContext`).
- Wspólny fałszywy Codex do testów: `src/backend/testing/thread-cli.ts` (używają go testy wątków, kontekstu, planu i akcji).
- Przy okazji naprawiłem źródło rzadkich ostrzeżeń „unhandled rejection” po zamknięciu serwisu w testach (wyścigi przy zamykaniu): strażnik `#stopping` w obsłudze powiadomień i kompakcji, `.catch` na zakończeniu tury.

## 4. Krok 2A: plan (W17–W22)

- **Narzędzia agenta** `cosgral_cards.propose_plan` (czeka na decyzję) i `update_plan`. Są w istniejącej przestrzeni `cosgral_cards`, więc biorą je Codex, serwer MCP Claude i kanały bez zmian w kodzie klientów.
- **Tylko Zatwierdź / Odrzuć** (Q9). Brak edycji kroków. Brak odpowiedzi = **nic nie jest zatwierdzone**: karta wygasa razem z turą (`expired`).
- **Q8:** reguła w kontrakcie (`planRequired`: ≥3 kroki albo ≥2 kroki, z których jeden zmienia coś poza rozmową) i w instrukcji dla agenta. Silnik **nie wymusza** planu na modelu, tylko sprawdza plan, który przychodzi.
- **Pusty plan odrzucony** (W22), bez karty. Maksymalnie 20 kroków. Zakończony krok zostaje zakończony. Plan jest `completed`, gdy każdy krok jest `done` albo `skipped`.
- **Trwałość:** tabela `projection_plans`. Plan otwarty w chwili restartu zamyka się (zaproponowany → `expired`, zatwierdzony → `stopped`).
- **Needs you:** plan liczy się per wątek i w aktywności agenta. Usunięcie wątku lub agenta usuwa jego plany.
- **IPC:** `plans:respond`, `plans:list` (tylko ten komputer).

## 5. Krok 2B: akcje na wiadomościach (W29–W35)

| Akcja | Silnik czy tylko okno | Zachowanie |
|---|---|---|
| Kopiuj | tylko okno | schowek |
| Rozgałęzienie | gotowe w BE1 (`threads.branch`) | nowy wątek (Q14) |
| **Ponów** | silnik | to samo pytanie wysłane jeszcze raz; **nowa odpowiedź jest DODANA** i oznaczona `regeneration`, stara zostaje (Q12) |
| **Edytuj** | silnik | tylko własne wiadomości; z `confirm: true`, gdy cokolwiek jest dalej; nowy tekst idzie do agenta, **wszystko po edytowanej wiadomości znika** (Q13) |
| **Usuń** | silnik | jedna wiadomość (osoby lub agenta), z `confirm: true`; nigdy cały wątek |
| **Przypnij** | silnik | tabela `projection_message_pins`, przeżywa restart, do 50 na wątek, działa też w trakcie odpowiedzi |

- **Model nie widzi usuniętych wiadomości:** po edycji lub usunięciu wątek CLI, który je pamięta, jest wycofany. Następna tura startuje nowy wątek CLI i dostaje przekazanie samej **pozostałej** historii (istniejący mechanizm przekazania między sesjami). Test sprawdza treść wysłaną do CLI.
- **FIFO (W35):** ponów, edytuj i usuń są odrzucane, gdy w wątku trwa tura albo wiadomość czeka w jego kolejce (zmiana kolejki idzie przez kolejkę). Pin działa zawsze.
- **Atomowość:** usunięcie wierszy wiadomości dzieje się w tym samym kroku bazy co nowy snapshot rozmowy. Mailbox usuwa wiadomość razem z plikami (ta sama kolejka usuwania plików co przy usuwaniu wątku).
- **IPC:** `message-actions:retry|edit|delete|pin|list-pins` (tylko ten komputer, parsery kontraktu przed jakąkolwiek pracą).

## 6. Decyzje do potwierdzenia (moje)

1. **Telefon nie zatwierdza planów** (typ „plan” tylko na komputerze), bo plan działa w imieniu osoby na tym komputerze.
2. **Ponów, edytuj, usuń tylko w widocznym wątku.** Inny wątek: „Select that thread first”. Pin działa na dowolnym wątku po id.
3. **Edycja = obetnij i wyślij na nowo:** nowa wiadomość ma nowy id i flagę `edited`.
4. **Jeden otwarty plan na wątek.** Druga propozycja jest odrzucana z powodem.
5. **Zatwierdzony plan, którego tura skończyła się przed ukończeniem kroków, ma stan `stopped`** (agent powinien zgłaszać każdy krok).
6. **Wiersze „wysłano do innego agenta” zostają po edycji.** Poczty już wysłanej nie da się cofnąć.

## 7. Czego NIE sprawdziłem

- **Electron, `sandbox:e2e`, prawdziwy Codex i Claude.** Wszystko na fałszywym CLI w procesie. Narzędzia planu dla Claude (serwer MCP) dzielą specyfikację z Codexem i przechodzą istniejące testy, ale nie uruchamiałem tury Claude z planem.
- **UI.** Mock jest pokryty testami, ale karty planu, menu akcji i okno potwierdzeń nie istnieją (to zadanie UI Designera).
- **Pełny `bun run test`.** Uruchomiłem 80 plików (silnik, mailbox, wątki, kontekst, IPC, kontrakty, mobile, wyspa): 587 z 588 zielonych, jedyny czerwony to nieaktualne wygenerowane pliki aplikacji telefonu (po mojej zmianie w `src/mobile-app`). Przebudowałem (`bun scripts/build-mobile-app.ts`, 2 linie w `mobile-app-assets.ts`, w commicie `b2a5b0aef`) i **ponownie uruchomiłem tylko** `mobile-app.test.ts` i `local-only-ipc.test.ts` (zielone), nie całą grupę. Po tym przebiegu zmieniłem jeszcze tylko `plan-cards.test.ts` (fałszywy magazyn, uciszenie lintu) i uruchomiłem go ponownie.
- **Lint** całego repo i 5 typecheck-ów (node, renderer, storybook, mobile-app, contracts) zielone na końcu. Commit `464b8ed4e` miał jeden błąd lintu w teście, poprawiony w `b2a5b0aef`.
- **Załączniki przy edycji:** pliki są kopiowane do nowej wiadomości, ale odwołania do załączników **wewnątrz tekstu** nie są ponownie linkowane. Nietestowane.
- **Dziennik zdarzeń:** stare snapshoty rozmowy w `orchestration_events` nadal zawierają usunięty tekst, dopóki nie usunie się wątku. Skasowanie ich zepsułoby odtwarzanie sesji dostawcy, więc tego nie robię.
- **Poza zakresem (UI1):** przekaż do kanału, cytuj, oznacz jako nieprzeczytane. Sub-agentów (§1D) nie ruszałem.
