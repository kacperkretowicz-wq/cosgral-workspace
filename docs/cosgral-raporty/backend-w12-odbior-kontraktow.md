# Backend W12 – odbiór w oknie moich kontraktów (asercje dla Testera)

Dla Testera: asercje do wstawienia w `scripts/sandbox-shots-w12.ts` / e2e (ja tego pliku nie edytuję). Wszystko przez `window.openbot.*` w `page.evaluate`, bez nowych lokatorów poza kilkoma napisami. Nazwy i kształty sprawdzone w kontraktach na `fb6a09a6d`. Zakładam seed z `sandbox-seed.ts` (≥ 3 agentów, kanały z zadaniami i archiwum) i jednego agenta, który odpowiedział „Stub: received”.

Oznaczenia: **A** = asercja twarda (musi być prawdą), **U** = zrzut/ręczne obejrzenie.

## 1. Cofnięcie usunięcia wątku (`threadUndo`)
Przygotowanie: `botId` = id agenta z `agent.listBots()`; `const created = await window.openbot.threads.create({ botId, title: "Undo me" })`; `threadId = created.activeThreadId`.

1. **A** bez potwierdzenia: `threadUndo.delete({ botId, threadId })` odrzuca z tekstem „Deleting a thread for good needs confirmation.”.
2. **A** `r = await threadUndo.delete({ botId, threadId, confirm: true })` ⇒ `r.pending.threadId === threadId`, `r.pending.title === "Undo me"`, `r.pending.wasActive === true`, `Date.parse(r.pending.expiresAt) - Date.parse(r.pending.deletedAt) === 600000`, a `r.list.threads` **nie** zawiera `threadId`; `r.list.activeThreadId !== threadId`.
3. **A** `threadUndo.list({ botId })` ma 1 element z tym `threadId`; `threads.select({ botId, threadId })` odrzuca „Unknown thread.”.
4. **A** zdarzenie: słuchacz `agent.onEvent` zebrał `thread-deletes-changed` z `pending.length === 1` (zbierać zdarzenia od kroku 2).
5. **U** okno: nad panelem wątków wiersz „Deleted “Undo me”” w regionie o nazwie `Deleted threads`, odliczanie `m:ss`, przycisk **Undo**.
6. **A** `list = await threadUndo.undo({ botId, threadId })` ⇒ `list.threads` zawiera `threadId`, `list.activeThreadId === threadId`; `threadUndo.list({ botId })` puste; ponowne `undo` odrzuca „There is nothing to undo for this thread.”.
7. **A** „usuń teraz”: `threadUndo.delete` jeszcze raz, potem `threads.delete({ botId, threadId, confirm: true })` ⇒ lista nie zawiera wątku, `threadUndo.list` puste, `undo` odrzuca „There is nothing to undo for this thread.”.
8. **A** wątek z trwającą turą nie da się ukryć: odrzuca „A turn is running in this thread. Stop it first.” (opcjonalnie, wymaga wiszącej tury).

## 2. Zadania (`tasksView`)
1. **A** `p = await tasksView.list({})` ⇒ `p.items.length ≥ 1`; każdy `item` ma `task.id`, `channelName`, `ownerName` (string lub null), `stepCount`, `stepsDone`, `resultPreview` (string lub null); `p.counts.active === liczba niezarchiwizowanych`; `p.counts.byState` ma klucze `queued, running, waiting, paused, done, failed, cancelled`.
2. **A** kolejność: `items` posortowane malejąco po `task.updatedAt`.
3. **A** zakresy: `list({ scope: "archived" })` zwraca tylko zadania z `archivedAt !== null` (≥ 1 z seeda); `list({ scope: "all" }).total === active + archived`.
4. **A** filtry: `list({ states: ["running"] })` zwraca tylko `running`, a `counts.byState` nadal zawiera inne stany (przyciski filtrów); `list({ query: "<część tytułu>" })` zwęża; `list({ limit: 1 })` ⇒ `items.length === 1`, `nextOffset === 1` (gdy `total > 1`), a `list({ limit: 1, offset: total - 1 }).nextOffset === null`.
5. **A** `d = await tasksView.detail({ taskId })` dla zadania z wynikiem ⇒ `d.result.text` niepusty, `d.request.messageId === d.task.requestMessageId`, `d.openAsChat` = `{ channelId: d.task.channelId, anchorMessageId: d.task.requestMessageId }`, `d.log` posortowany rosnąco po `at`, `d.actions.length === 6` w kolejności `stop, pause, resume, archive, restore, reassign`.
6. **A** reguły akcji: zadanie `done` ⇒ `stop`, `pause`, `resume`, `reassign` wyłączone z `reason` („This task is already finished.” / „This task is not running.” / „Only a paused or stopped task can be resumed.” / „This task is finished.”), `archive` włączone, `restore` wyłączone („This task is not archived.”). Zadanie `running` ⇒ `stop`, `pause`, `reassign` włączone.
7. **A** zapis i odczyt: `channels.actOnTask({ taskId, action: "archive" })` ⇒ zadanie jest w `list({ scope: "archived" })` i nie ma go w domyślnej; `action: "restore"` wraca. `detail` odrzuca nieistniejące id: „This task no longer exists.”.
8. **U** okno: strona Tasks, klik wiersza `button.tasks-screen-row` ⇒ sekcja `Task details`; przycisk **Open as chat** otwiera kanał zadania i przewija do wiadomości z prośbą; rozwijane „Steps” przy zadaniu z podzadaniami.

## 3. Menu wiadomości (`messageMenu`)
Przygotowanie: `snap = await agent.readConversation(botId)`; `userMsg` = ostatnia wiadomość z `author === "user"`, `botMsg` = ostatnia z `author === "assistant"` i `status === "completed"` (są po „Stub: received”).

1. **A** `m = await messageMenu.get({ botId, messageId: userMsg.id })` ⇒ `m.actions.map(a => a.id)` równe `["copy","react","pin","branch","retry","edit","delete"]`; przy bezczynnym agencie wszystkie `enabled`; `delete.needsConfirmation === true`; `edit.needsConfirmation === (liczba późniejszych wiadomości > 0)`.
2. **A** odpowiedź agenta: `messageMenu.get({ botId, messageId: botMsg.id })` ⇒ `edit.enabled === false`, `edit.reason === "Only your own messages can be edited."`, reszta włączona.
3. **A** przypięcie: `messageActions.pin({ botId, messageId: botMsg.id, pinned: true })`, potem `messageMenu.get` ⇒ `m.pinned === true`, akcja `pin` ma `active === true`; zdarzenie `message-pins-changed` zebrane; `pinned: false` cofa.
4. **A** reakcja: `agent.setMessageReaction({ botId, messageId: botMsg.id, emoji: "👍" })` (emoji z `m.reactions.quick`) ⇒ `messageMenu.get(...).reactions.current === "👍"`; `emoji: null` czyści; `m.reactions.quick.length > 0`, `m.reactions.more` niepuste.
5. **A** wiersz, który nie jest wiadomością (krok/notatka, jeśli jest w seedzie): wszystkie akcje wyłączone z „This row is not a message.”.
6. **A** nieznana wiadomość: odrzuca „That message is not in this thread.”.
7. **U** okno: wiersz wiadomości → hover (pasek akcji ma `opacity`), kebab „More message actions” (Kobalte: `pointerdown`/`pointerup`, nie `click`) ⇒ 7 pozycji; nieaktywne mają powód w zwykłym zdaniu; „Edit message” i „Delete message” otwierają okno potwierdzenia (edycja mówi, ile późniejszych wiadomości zniknie).

## 4. Dlaczego kolejka czeka (`heldKind`)
W oknie trudno wywołać wszystkie powody; asercje twarde tylko dla tego, co daje się zrobić z seedem. Reszta jest pokryta testami jednostkowymi (`ipc-queue-holds` 6, `agent-service-queue-holds`, `QueueHoldNotice` 3).

1. **A** brak wstrzymania: z wstrzymaną kolejką (`agent.setQueuePaused({ botId, paused: true })`) i jedną wiadomością w kolejce `agent.listQueue(botId)` **nie** ma `heldReason` ani `heldKind` (pauza to nie wstrzymanie), a w oknie nie ma paska `role=status` z tekstem „Message queued:”.
2. **A** `queue-changed`: po `agent.sendMessage` zdarzenie `queue-changed` dociera do okna (zebrane w `agent.onEvent`), a jego `snapshot.botId === botId`.
3. **A** `server-busy` (jeśli ustawienia serwera dają limit tur, `maxTurns: 1`): dwóch agentów, pierwszy dostaje długie zadanie, drugi wiadomość ⇒ `listQueue(drugi).heldKind === "server-busy"` i `heldReason` równe zdaniu „The server is busy: too many agent turns run at once. New messages wait until one finishes.”; pasek `Message queued:` jest, **bez** przycisku „Review budget settings”; po końcu tury `heldKind` znika.
4. **A** `budget`: gdy budżet wykorzystany ⇒ `heldKind === "budget"` i jest przycisk „Review budget settings”.
5. **U** `agent-restart`: tuż po starcie programu z wiadomością w kolejce pasek mówi „The agent is restarting. New messages wait until it is ready.” (trudne do złapania; wystarczy test jednostkowy).

## 5. Czego ten opis nie obejmuje
1. Nie uruchamiałem tych asercji (ciche okno, brak Electrona). Kształty i teksty zdań wzięte z kodu na `fb6a09a6d`; jeśli któreś zdanie nie zgadza się literalnie, to błąd opisu, nie produktu: sprawdzić w `ipc-message-menu.ts`, `ipc-tasks-view.ts`, `ipc-thread-undo.ts`, `ipc-queue-holds.ts`.
2. Kroki z nazwami przycisków **U** zależą od aktualnego UI (UI Designer zmienia ekrany).
3. Test `server-busy` w oknie wymaga ustawienia limitu tur; jeśli go nie ma w ustawieniach serwera, zostaje test jednostkowy.
