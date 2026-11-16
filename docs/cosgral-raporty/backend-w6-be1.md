# W6-BE1: wątki na agenta

**Następny krok dla lidera:** scalić `team/backend/w6-be1`. UI Designer (W6-UI2) ma kontrakt i mock w commicie `f91a7cb51`; silnik jest w kolejnych commitach.

**Stan:** kontrakt, mock, silnik, IPC i testy jednostkowe gotowe. Bez Electrona i bez `sandbox:e2e`.

## 1. Co zrobiłem

- **Kontrakt** (`packages/contracts/src/ipc-threads.ts`, preload, mock): wątki agenta, 8 wywołań, 2 zdarzenia.
- **Magazyn wątków** (`src/backend/thread-store.ts`): lista, utwórz, zmień nazwę, archiwizuj, przywróć, wybierz, usuń na zawsze i rozgałęź.
- **Kolejka per wątek** (`mailbox-store.ts`): wiadomość należy do wątku, który był aktywny, gdy ją wysłano.
- **Silnik** (`agent-service.ts`): tura w toku dokańcza się w swoim wątku po przełączeniu, startuje tylko kolejka aktywnego wątku, zdarzenia lekkie dla wątków w tle.
- **Wiersz agenta:** `AgentActivity.workingThread`.
- **IPC** tylko na tym komputerze (`src/main/threads-ipc.ts`).

## 2. Co silnik miał już z wątków (sprawdzone najpierw)

- Baza trzyma wiadomości, tury, sesje CLI, znaczniki odczytu i streszczenia **per `thread_id`**, a tabela `projection_threads` ma `agent_id`. Agent miał tylko jedno `threadId` w rekordzie. Nic nie trzeba było przenosić.
- **Migracja bez utraty rozmów:** obecna rozmowa agenta jest jego pierwszym wątkiem, bez kopiowania. Dochodzi tylko nowa tabela `projection_thread_meta` (tytuł, archiwum, rodzic rozgałęzienia), tworzona przez `CREATE TABLE IF NOT EXISTS`. Wątek bez wiersza w niej ma tytuł automatyczny. Wiadomości z kolejki sprzed W6 dostają wątek agenta przy starcie.
- **Kanały i konta K1 nie zostały ruszone:** kanały mają własne identyfikatory wątków, a wątek CLI konta nadal żyje w folderze konta. Każdy wątek agenta ma własną sesję CLI, a przy zmianie konta K1 sesje wątku są dezaktywowane i przekazywane jak dotąd.

## 3. Zasady działania (decyzje lidera Q1–Q5, Q14 i moje, do potwierdzenia)

| Zasada | Skąd |
|---|---|
| Jeden wątek jest aktywny: to ten, który pokazuje okno (`BotSummary.threadId`). | Q3, W03 |
| Tura w toku dokańcza się w swoim wątku, gdy osoba przełączy wątek. Odpowiedź ląduje w historii tamtego wątku. | Q1, W10 |
| **Jedna tura naraz na agenta**, w dowolnym wątku. Wiadomość wysłana w drugim wątku czeka w jego kolejce, aż tura się skończy. | **moja decyzja** |
| Wiadomości czekające w wątku, który nie jest aktywny, **nie startują**. Startują po powrocie do tego wątku, w tym samym stanie. | Q2, wiersz 4 spec; **doprecyzowanie moje** |
| Wiadomość od innego agenta trafia do **aktywnego** wątku odbiorcy. Wiersz „wysłano do X” zostaje w wątku nadawcy, który ją wysłał. | **moja decyzja** |
| Archiwizacja: wątek znika z domyślnej listy, historia zostaje, nic nie da się do niego wysłać (nie da się go wybrać). Gdy był aktywny, aktywny staje się najnowszy inny otwarty wątek, a gdy brak, powstaje nowy pusty. Dozwolona w trakcie tury: tura się dokańcza. | Q5, wiersz 6 |
| „Usuń na zawsze”: tylko z `confirm: true`, **odmowa, gdy w wątku trwa tura** (najpierw Stop). Kasuje historię, kolejkę, sesje i ślady w dzienniku zdarzeń. | Q5 |
| Rozgałęzienie: nowy aktywny wątek z historią do wskazanej wiadomości, link „z wątku X”, oryginał nietknięty. Skopiowana historia jest oznaczona jako przeczytana. CLI nowego wątku dostaje streszczenie skopiowanej historii przy pierwszej wiadomości. | Q14, W32 |
| Tytuł: pusty = automatyczny (pierwsza linia pierwszej wiadomości, do 60 znaków), a rozgałęzienie „Branch of <tytuł rodzica>”. Do 120 znaków. | wiersz 5, **moja decyzja** |
| Po usunięciu rodzica gałąź zachowuje jego nazwę, ale traci link. | **moja decyzja** |
| Pamięć zostaje per agent. Pauza kolejki jest per agent, nie per wątek. Do 200 wątków na agenta (archiwalne się liczą). | Q4, **moja decyzja** |

## 4. Kontrakt dla UI (commit `f91a7cb51`)

- **API:** `window.openbot.threads?` z `list`, `create`, `rename`, `archive`, `restore`, `delete`, `select`, `branch`. Każde wywołanie zwraca całą `ThreadList` agenta: `{ botId, activeThreadId, threads[] }`, najnowsze pierwsze.
- **`ThreadSummary`:** `id`, `title` (zawsze czytelny), `titled`, `state` (`running` | `waiting` | `idle` | `archived`), `active`, `unread`, `queued`, `needsYou`, `createdAt`, `updatedAt`, `archivedAt`, `preview`, `parentThreadId`, `parentTitle`, `branchedFromMessageId`.
- **`delete`** wymaga `confirm: true`. Okno pyta osobę, silnik też odmawia bez flagi.
- **Zdarzenia:**
  - `threads-changed` (cała lista agenta) po każdej zmianie;
  - `thread-activity` (`threadId`, `state`, `unread`, `queued`, `needsYou`) przy starcie i końcu tury, zmianie kolejki, otwarciu i zamknięciu karty, nowej wiadomości w tle.
- **Co okno ma zrobić po zmianie aktywnego wątku:** silnik sam wysyła wtedy `threads-changed`, `bots-changed` (`BotSummary.threadId` jest nowy), `queue-changed` (kolejka nowego aktywnego wątku) i `conversation` (nowy aktywny wątek).
- **Ważne dla UI:** okno trzyma jedną listę żywych wiadomości na agenta i nie patrzy na `threadId`. Dlatego silnik **nie wysyła** `conversation` ani `conversation-delta` dla wątku, który nie jest aktywny. Tura w tle jest zapisywana, a okno dostaje tylko `thread-activity`. UI ma przeładować rozmowę po zmianie `activeThreadId`.
- **Karty „Needs you”:** każda ma `threadId`. Widok zbiorczy może pokazać tytuł wątku z listy `ThreadSummary`. `needsYou` i stan `waiting` wątku liczą te karty.
- **Kolejka:** `QueueDelivery.threadId` (opcjonalne), a `listQueue`/`queue-changed` pokazują kolejkę **aktywnego** wątku.
- **Wiersz agenta:** `AgentActivity.workingThread?: { id, title, background }`. `background: true` znaczy, że agent pracuje w wątku, którego osoba nie ogląda.
- **Mock:** `createMockThreads(emit, seed?)` z tymi samymi regułami i metodą `simulate` (stan tury, nieprzeczytane, kolejka, karty). Jest też w `window.openbot.threads` mocka Storybooka.

## 5. Testy

| Co | Wynik |
|---|---|
| Kontrakt `ipc-threads.test.ts` | 9/9 |
| Mock `mock-threads.test.ts` | 7/7 |
| Kolejka per wątek w skrzynce, `mailbox-store-threads.test.ts` | 8/8 |
| `ThreadStore` na prawdziwej bazie, `thread-store.test.ts` | 19/19 |
| Silnik na prawdziwym `AgentService` z atrapą CLI, `agent-service-threads.test.ts` | 13/13 |
| `local-only-ipc.test.ts` (odmowa dla innego serwera i telefonu, 8 kanałów) | 6/6 |
| Regresja wszystkich plików o rozmowach, kolejce, aktywności i bazie (25 plików) | 316/316 |
| Kontrakty i mock (31 plików) | 143/143 |
| Main (38 plików) | 186/186 |
| `lint`, `typecheck:node`, `typecheck:renderer` | zielone |

Granice z polecenia: 0, 1 i wiele wątków, archiwizacja w trakcie tury, usunięcie wątku z kolejką, dwa agenty naraz, restart z historią, migracja starej bazy (tabela usunięta, rozmowa zostaje pierwszym wątkiem), a do tego: brak wycieku strumienia z wątku w tle do okna, karta zostaje w swoim wątku, rozgałęzienie z przekazaniem historii do CLI.

## 6. Czego nie sprawdziłem

1. Electrona, `sandbox:e2e` i okna: UI nie obsługuje jeszcze wątków (W6-UI2), więc zachowanie okna po przełączeniu (przeładowanie rozmowy) opisuję z kontraktu, nie z oglądania.
2. Prawdziwych Codex i Claude: wszystkie testy idą na atrapie CLI. Że prawdziwe CLI dobrze wznawia osobny wątek CLI po restarcie i po rozgałęzieniu, to założenie, a rozgałęzienie opiera się na streszczeniu historii, nie na wspólnym wątku CLI.
3. Steerowanie wiadomości z kolejki do tury w toku działa tylko w obrębie jednego wątku (dla innego rzuca czytelny błąd). Nie ma osobnego testu tego błędu.
4. Kontekst rozmowy (zadanie KK W6-BE2): nie zmieniałem. Kompaktowanie bierze sesję aktywnego wątku, więc jest zgodne z tą wersją, ale „per wątek” tam jeszcze nie sprawdzałem.
5. Kolejność wykonania wiadomości z różnych wątków jednego agenta, gdy osoba wraca do wątku z kolejką po dłuższej przerwie: startują po kolei w tym wątku. Czy to wystarczy, to decyzja do potwierdzenia (alternatywa: kolejki innych wątków też startują w tle po zakończeniu tury).
6. Jeden zbiorczy przebieg 94 plików naraz (645 testów, wszystkie zielone) wypisał ostrzeżenie o nieobsłużonym błędzie i dał kod wyjścia 1. Każda z trzech grup osobno (backend, kontrakty, main) przechodzi z kodem 0. Przyczyny nie ustaliłem; nie powtarza się w grupach.
