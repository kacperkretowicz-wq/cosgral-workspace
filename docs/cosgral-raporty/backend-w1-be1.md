# Backend W1-BE1: kontrakt W1, otwarte karty, stany wiersza, foldery (12.11.2026)

Gałąź `team/backend/w1-be1` od integracji `codex/cosgral-desktop` @ `6465782a8`, worktree `Shared\cosgral-wt\desktop-backend`. Czas: ok. 3 h.

## Następny krok

1. **Lider (ok. 20 min):** przegląd i scalenie 4 commitów (lista w sekcji 7).
2. **UI Designer (W1-UI2):** Needs you na trwałych danych, stany „limit” i „błąd”, foldery w pasku. Kontrakt jest w sekcji 2.
3. **Tester:** potwierdzić dwie rzeczy z opisu 0.68 (sekcja 6, punkty 1–2).

## Werdykt

| Cel W1-BE1 | Stan | Dowód |
|---|---|---|
| Kontrakt całego W1 jako pierwszy commit | ✓ `dd413e6e7`; wszystkie nowe metody opcjonalne | sekcja 2 |
| Otwarte karty po przeładowaniu okna + zdarzenia „rozwiązane” | ✓ `listPendingRequests`, `prompt-resolved`, `approval-resolved` | sekcje 3.1 i 5 |
| Stan wiersza „limit” (z `usage-changed`, tylko Codex) | ✓ z godziną resetu; po resecie wraca sam | sekcja 3.2 |
| Stan wiersza „błąd”, kasowany po udanej turze | ✓ krótki opis w jednej linii | sekcja 3.2 |
| Foldery w SQLite, trwałe po restarcie | ✓ zagnieżdżanie, przenoszenie, duplikowanie, zmiana nazwy, usuwanie | sekcje 3.3 i 5 |
| Kanały i zadania | tylko kontrakt; silnik w W1-BE2 po W1-T1 | sekcja 2.4 |
| Karta podglądu szkicu, przejęcie przeglądarki | tylko kontrakt | sekcja 2.5 |

## 2. Kontrakt dla UI

Wszystko jest w `packages/contracts/src`:

| Plik | Co zawiera |
|---|---|
| `ipc-attention.ts` | otwarte karty (`PendingAgentRequest`), sposób zamknięcia karty, stan wiersza (`AgentActivity`) |
| `ipc-sidebar.ts` | foldery i miejsca agentów (`SidebarLayout`), wejścia zmian, limity |
| `ipc-workspace-channels.ts` | `WorkspaceChannel`, `ChannelTask` (pola uzgodnione w PLAN.md, decyzja 4) |
| `ipc-action-cards.ts` | karta podglądu szkicu i przejęcie przeglądarki |
| `ipc-conversation.ts` | nowe zdarzenia w `AgentEvent` + walidacja w `isAgentEvent` |
| `ipc-desktop-apis.ts`, `ipc-channels.ts` | metody API (opcjonalne) i nazwy kanałów IPC |

Wszystkie nowe metody i przestrzenie (`sidebar`, `channels`) są **opcjonalne** (`?`), więc atrapy w Storybooku dalej się kompilują. Działa dziś: sekcje 2.1–2.3. Sekcje 2.4–2.5 to sam kontrakt.

### 2.1 Otwarte karty (Needs you na trwałych danych)

- `agent.listPendingRequests?(): Promise<PendingAgentRequest[]>` — wszystkie otwarte karty wszystkich agentów, **najstarsza pierwsza**.
  - `{ kind: "prompt", requestId, botId, threadId, turnId, questions, createdAt }` — te same pola co zdarzenie `prompt`.
  - `{ kind: "approval", approval, createdAt }` — to samo `AgentApproval` co zdarzenie `approval` (także karty oczu: `screen`, `camera`).
  - `draft-preview` i `browser-takeover` dojdą razem z silnikiem tych kart.
- Zdarzenia zamknięcia karty (przychodzą do każdego okna):
  - `{ type: "prompt-resolved", requestId, botId, resolution: "answered" | "skipped" | "expired" }`
  - `{ type: "approval-resolved", requestId, botId, resolution: "accepted" | "declined" | "expired" }`
  - `skipped` = zamknięta bez odpowiedzi (przycisk Skip wysyła puste odpowiedzi). `expired` = tura skończyła się albo zatrzymała, zanim ktoś odpowiedział (także restart dostawcy i zamknięcie programu).
- Jak użyć w rendererze:
  1. Przy starcie okna: `listPendingRequests()` i wypełnić mapy kart.
  2. `prompt` / `approval`: dodać kartę.
  3. `prompt-resolved` / `approval-resolved`: usunąć kartę o tym `requestId`. Nie trzeba już zgadywać po `turn-completed`.
- Uwaga: renderer trzyma dziś jedną kartę pytania i jedną zatwierdzenia na agenta (`Record<botId, …>`). Lista może mieć kilka kart jednego agenta (np. dwa zatwierdzenia w jednej turze). Sticky Decyzja = najstarsza karta agenta.

### 2.2 Stan wiersza agenta

- `agent.listActivity?(): Promise<AgentActivity[]>` przy starcie okna, potem zdarzenie `{ type: "activity-changed", activity }` (tylko przy prawdziwej zmianie).
- `AgentActivity = { botId, kind, pendingRequests, limit, error, updatedAt }`
- `kind`, od najważniejszego: `waiting` (otwarta karta) > `working` (tura albo dostawa `starting`/`running`, ta sama reguła co dziś w pasku) > `limited` > `error` > `idle`.
- `pendingRequests`: liczba otwartych kart agenta (do znaczka).
- `limit: { provider: "codex", limitId, resetsAt } | null`:
  - `resetsAt` w **sekundach Unix**, jak `AccountUsageWindow.resetsAt`; `null` = nieznany czas resetu;
  - ustawione, gdy któreś okno limitu Codex ma 100 % i jeszcze się nie zresetowało; przy kilku pełnych oknach liczy się to, które resetuje się najpóźniej;
  - po czasie resetu backend sam przelicza stan i odczytuje świeże zużycie;
  - `limit` i `error` są wypełnione także wtedy, gdy `kind` pokazuje coś ważniejszego (np. agent pracuje mimo starego błędu).
- `error: { code, message, at } | null`:
  - powstaje z błędów `agent_error`, `delivery_start_failed`, `context_compaction_failed` albo z tury zakończonej `failed` (wtedy `code: "turn_failed"`, `message: "The last turn failed."`);
  - `message`: pierwsza niepusta linia, najwyżej 200 znaków;
  - znika po następnej turze zakończonej `completed`; przerwanie tury przez użytkownika go nie kasuje.
- Proponowane mapowanie na dzisiejsze `SidebarAgentState`: `waiting` → `needs-you`, `working` → `working`, `limited` → nowy stan „limit” z godziną resetu, `error` → nowy stan „błąd” z `message` w podpowiedzi. `unread` i `responded` zostają po stronie renderera.

### 2.3 Foldery w pasku

- `window.openbot.sidebar?` (dostępne teraz w preload):

| Metoda | Zwraca | Uwagi |
|---|---|---|
| `getLayout()` | `SidebarLayout` | `{ folders, placements }` |
| `createFolder({ name, parentId })` | `{ folder, layout }` | nowy folder na końcu rodzeństwa |
| `updateFolder({ folderId, name?, collapsed? })` | `SidebarLayout` | zmiana nazwy i zwinięcie |
| `moveFolder({ folderId, parentId, position })` | `SidebarLayout` | z podfolderami; nie do siebie ani do swoich podfolderów |
| `duplicateFolder({ folderId })` | `{ folder, layout }` | kopia „<nazwa> copy” z podfolderami, **bez agentów** (agent jest w jednym miejscu); zaraz za oryginałem |
| `deleteFolder({ folderId })` | `SidebarLayout` | usuwa tylko folder; podfoldery i agenci przechodzą do rodzica |
| `moveItem({ itemKind: "agent", itemId, folderId, position })` | `SidebarLayout` | `folderId: null` = poziom główny |

- Każda zmiana wysyła też `{ type: "sidebar-layout-changed", layout }`.
- `SidebarFolder = { id, name, parentId, position, collapsed, createdAt, updatedAt }`; `SidebarItemPlacement = { itemKind, itemId, folderId, position }`.
- Zasady:
  - `position` liczy od 0 osobno dla folderów i dla agentów jednego rodzica; foldery są przed agentami;
  - agent bez wpisu w `placements` jest na poziomie głównym, w zwykłej kolejności;
  - za duża `position` = na koniec;
  - usunięty agent sam znika z folderu.
- Limity (`SIDEBAR_LIMITS`): nazwa 1–80 znaków (przycinane spacje), najwyżej 5 poziomów, najwyżej 200 folderów.
- Komunikaty błędów (po angielsku, jak reszta UI):
  - „A folder name has 1–80 characters.”
  - „Folders nest at most 5 levels.”
  - „A folder cannot move into itself or its subfolders.”
  - „This folder no longer exists.”
  - „This agent no longer exists.”
  - „Channels are not available yet.”
  - „Folders are available only on this computer for now.”
- Na serwerze zdalnym: `getLayout()` zwraca pusty układ, zmiany kończą się ostatnim komunikatem.

### 2.4 Kanały i zadania (tylko kontrakt; silnik w W1-BE2)

- `ChannelTask = { id, channelId, ownerBotId, state, title, requestMessageId, resultMessageId | null, updatedAt }`, `state`: `queued | running | waiting | done | failed | cancelled`. Pola są takie jak w atrapie UI, bez `ownerBotName`: nazwę UI bierze z listy agentów.
- `WorkspaceChannel = { id, name, title, instructions, leadBotId | null, memberBotIds, archived, createdAt, updatedAt }`.
- `window.openbot.channels?.list()`, `channels?.listTasks(channelId)`; zdarzenia `channels-changed`, `task-changed`.
- Preload jeszcze **nie** wystawia `channels`. Pojawi się z silnikiem, więc UI może sprawdzać `if (window.openbot.channels)`.

### 2.5 Karta podglądu szkicu i przejęcie przeglądarki (tylko kontrakt)

- Podgląd szkicu:
  - zdarzenie `draft-preview` z kartą `{ requestId, botId, threadId, turnId, title, recipient | null, channel | null, preview, createdAt }`;
  - odpowiedź `agent.respondToDraftPreview?({ requestId, decision: "send" | "edit" | "keep-draft", feedback? })`;
  - zamknięcie: `draft-preview-resolved` z `resolution` (decyzja albo `expired`).
- Przejęcie przeglądarki:
  - zdarzenie `browser-takeover` z `{ requestId, botId, threadId, turnId, tabId, url, reason, createdAt }`;
  - odpowiedź `agent.respondToBrowserTakeover?({ requestId, action: "take-over" | "return" | "decline" })`;
  - zmiany fazy: `browser-takeover-changed` z `phase: requested | taken-over | returned | declined | expired`.
- Nazwy pól mogą się zmienić po opisie Testera W1-T1.

## 3. Jak to działa (backend)

### 3.1 Otwarte karty

- `AgentService` zapisuje przy każdej karcie czas i kolejność. Dotyczy kart pytań Codex (`item/tool/requestUserInput`), pytań narzędzi (Claude i Codex przez `item/tool/call`), zatwierdzeń poleceń, plików i uprawnień oraz zgód na oczy agenta.
- Karty żyją w pamięci procesu głównego, więc przetrwają przeładowanie okna. Nie przetrwają restartu programu: prośba dostawcy umiera razem z jego procesem.
- Zdarzenie zamknięcia idzie przy:
  - odpowiedzi;
  - końcu tury;
  - wyjściu dostawcy;
  - zatrzymaniu serwisu.

### 3.2 Stan wiersza

- Nowy moduł `src/backend/agent-activity.ts` (`AgentActivityTracker`) śledzi każde zdarzenie, które `AgentService` wysyła (bez strumienia `conversation-delta`), i z nich liczy stan.
- Źródła:
  - otwarte karty;
  - aktywna tura i kolejka;
  - ostatnie `usage-changed` Codex;
  - błędy.
- Wyjątek w tym liczeniu nigdy nie psuje samego zdarzenia.
- Timer resetu limitu jest `unref` i kończy się przy `stop()`.

### 3.3 Foldery

- `src/backend/sidebar-store.ts`, dwie nowe projekcje w tej samej bazie `openbot.db`:
  - `projection_sidebar_folders`;
  - `projection_sidebar_placements`.
- `CREATE TABLE IF NOT EXISTS`, więc starsze bazy dostają je przy starcie.
- Każda zmiana to jedno polecenie w dzienniku zdarzeń (`sidebar.folder-created`, `sidebar.item-moved` itd.) i zapis całego układu w jednej transakcji. Klucze obce są odroczone do końca transakcji.
- Najpierw sprawdzam cały układ w pamięci (nazwa, głębokość, cykle, limity), potem zapisuję. Pozycje są zawsze 0..n-1.
- IPC: `sidebar:*` w `src/main/index.ts`, wejścia sprawdza `src/main/ipc/sidebar-inputs.ts`. Usunięcie agenta (`bots-changed`) czyści jego miejsce.

## 4. Zmienione pliki

- Kontrakt: `packages/contracts/src/{ipc,ipc-conversation,ipc-channels,ipc-desktop-apis}.ts`, nowe `ipc-attention.ts`, `ipc-action-cards.ts`, `ipc-sidebar.ts`, `ipc-workspace-channels.ts`, test `ipc-w1.test.ts`.
- Backend: `src/backend/agent-service.ts`, nowe `agent-activity.ts`, `sidebar-store.ts`, `openbot-database-schema.ts` (2 tabele), testy.
- Main i preload: `src/main/index.ts`, nowe `src/main/ipc/sidebar-inputs.ts`, `src/preload/index.ts`.
- Renderera nie ruszałem: to zadanie W1-UI2.

## 5. Testy i dowody

### 5.1 Testy (TDD: najpierw czerwone, potem zielone)

| Plik | Nowe testy | Co sprawdza |
|---|---|---|
| `packages/contracts/src/ipc-w1.test.ts` | 6 | walidacja nowych zdarzeń, listy kart i układu folderów |
| `src/backend/agent-service.test.ts` | 5 | karty po „przeładowaniu” (lista, kolejność, `createdAt`), `answered` / `declined` / `expired` / `skipped`; wiersz: pracuje → czeka → pracuje → błąd → bezczynny; tura `failed` bez komunikatu; limit Codex z resetem po 2 s |
| `src/backend/agent-activity.test.ts` | 4 | wybór limitu (100 %, reset w przeszłości, najpóźniejszy, nieznany), kolejność stanów, skracanie błędu |
| `src/backend/sidebar-store.test.ts` | 5 | trwałość po zamknięciu bazy, kolejność rodzeństwa, przenoszenie bez cykli, limity, duplikowanie, usuwanie, czyszczenie usuniętych agentów |
| `src/main/ipc/input-parsers.test.ts` | 2 | wejścia `sidebar:*` i komunikaty błędów |

- Cały zestaw na Windows: **68 plików, 505/505 testów zielonych** (przed W1-BE1: 483), 550 s. Log: `Shared\cosgral-data\desktop-backend\logs\b1\w1-be1-test.log`.
- `bun run typecheck` (contracts, node, web, storybook, api): bez błędów.
- `biome check` na zmienionych plikach: bez błędów.

### 5.2 Piaskownica (build z tej gałęzi, atrapa Codex)

Osobne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, sterowanie przez DevTools na 127.0.0.1. Atrapa Codex dostała tryb „ASK ME”: zadaje jedno pytanie z opcjami i kończy turę po odpowiedzi. Atrapa leży poza repo, w `Shared\cosgral-data\desktop-backend\stub-codex`.

Przebieg `w1-be1-cards-folders`:

1. Wiadomość „ASK ME which plan to use” → `listPendingRequests()` zwraca 1 kartę pytania. Wiersz: `working`, potem `waiting` (1 karta). Na ekranie: Needs you (1) i przypięta Decyzja z pytaniem.
2. **Przeładowanie okna** → `listPendingRequests()` dalej zwraca tę samą kartę (ten sam `requestId` i `createdAt`), a `listActivity()` zwraca `waiting`. Dzisiejszy renderer po przeładowaniu **nie pokazuje karty**, bo nie czyta jeszcze listy. To jest zadanie W1-UI2 (sekcja 2.1).
3. Odpowiedź „Pro” przez API → `prompt-resolved` (`answered`), wiersz `working`, potem `idle`. Atrapa dostała odpowiedź i skończyła turę.
4. Foldery:
   - utworzone „Sales” z podfolderem „Leads”;
   - agent przeniesiony do „Leads”;
   - duplikat „Sales copy” (z kopią „Leads”, bez agenta);
   - zmiana nazwy na „Sales EU” i zwinięcie.

Przebieg `w1-be1-restart` (ten sam profil, nowe uruchomienie):

- układ folderów i miejsce agenta identyczne jak przed restartem (te same `id`, pozycje, `collapsed`, czasy);
- brak otwartych kart (tura się skończyła);
- wiersz `idle`.

Oba przebiegi zamknęły się czysto: 0 procesów po zamknięciu, prawdziwy `%APPDATA%\COSGRAL Workspace Dev` nietknięty. Dowody: `Shared\cosgral-data\desktop-backend\evidence\b1\w1-be1-cards-folders\` i `…\w1-be1-restart\` (`cdp-drive-log.json`, zrzuty PNG). Prawdziwego Codex ani Claude nie używałem.

## 6. Ograniczenia i pytania

1. **Tester:** czy „duplikuje folder” w 0.68 kopiuje też agentów? Przyjąłem: kopia folderu i podfolderów bez agentów, bo agent może być tylko w jednym miejscu.
2. **Tester:** czy w 0.68 foldery i agenci mieszają się w jednej kolejności? Przyjąłem: najpierw foldery, potem agenci. Jedna kolejność to zmiana tylko w `position`.
3. Limit Codex: każde pełne okno limitu Codex oznacza wszystkich agentów Codex. Nie wiem, czy osobne `limitId` dotyczą konkretnych modeli. Claude: bez stanu limitu, zgodnie z zadaniem.
4. Serwer zdalny (host zespołu) nie wystawia jeszcze kart, stanów ani folderów. Zwracam puste listy. Do zrobienia w API hosta.
5. `biome check src` zgłasza błędy w plikach, których nie zmieniałem: B4 w rendererze (`ChannelTasksPanel*`, `StickyDecision*`, `Sidebar.tsx` i inne) oraz `src/main/central-auth-manager.ts` i `src/main/development-profile.ts`. Moje pliki są czyste.

## 7. Commity (gałąź `team/backend/w1-be1`, od `6465782a8`)

1. `dd413e6e7` contracts: W1 contract - open cards, agent row state, folders, channels, action cards
2. `8712a4fb6` backend: open cards survive a window reload, agent row states
3. `d26d338b6` backend: sidebar folders saved in the local database
4. docs: W1-BE1 report and change log (ten raport i `COSGRAL-CHANGES.md`)

Bez push. Wszystkie z trailerem `Co-authored-by: OpenBot`.
