# Backend W1-BE2 — silnik kanałów i zadań

Gałąź `team/backend/w1-be2`. Baza integracji: `5934131e3`, scalenie w tej gałęzi: `b9e763d67`; potem integracja `341ae769b` (W1-UI2, W1-T2) scalona w `3ffeac7ce`. Wcześniejsza część danych: `480b912f7`, `acf355c7b`, `436dda27c` (raport części 1 pozostaje dokumentem historycznym; decyzje lidera poniżej go zastępują).

## Zakres

- SQLite: kanały, członkowie i lider, wiadomości, osobna pamięć kanału, zadania i zależności, zasób, historia przydziałów, jeden aktualny wynik z zachowanymi starszymi wersjami.
- Wiadomość człowieka i zadanie lidera zapisują się w jednej transakcji. Przydział tworzy podzadanie. Po zakończeniu pomocników rodzic dostaje jedną nową turę z ich wynikami; zwykli członkowie pozostają bezczynni.
- Jedna kolejka dla wszystkich kanałów. Ten sam `browser` albo kanoniczny `workspace:<ścieżka bezwzględna>` uruchamia się kolejno. Zależności wymagają `done`. Zajęty zasób zwalnia się dopiero po zakończeniu tury dostawcy, także po Stop/przekazaniu.
- Stop/Pause przerywa wybraną pracę i jej otwarte podzadania; spóźnione narzędzia i wyniki są odrzucane. Resume/Reassign z API człowieka odblokowuje wybrane zadanie; agent nie wznawia pauzy. Archiwum zachowuje stan i historię; archiwum kanału blokuje nowe wiadomości i start kolejki, aktywna tura kończy się normalnie.
- Narzędzia `cosgral_channels` są dynamicznymi funkcjami Codex i serwerem MCP Claude, jak `cosgral_eyes`. Host wiąże każde wywołanie z aktywną turą i właścicielem. Agent nie podaje dowolnego kanału do odczytu.

## Kontrakt dla UI

Typy: `packages/contracts/src/ipc-workspace-channels.ts`. Przestrzeń `window.openbot.channels` pozostaje opcjonalna. Dotychczasowe metody z części 1 zachowują podpisy; nowe metody są opcjonalne do czasu aktualizacji atrapy UI.

| Metoda | Wynik | Zachowanie |
|---|---|---|
| `list()` | `WorkspaceChannel[]` | Kanały lokalne, również archiwalne |
| `listTasks(channelId)` | `ChannelTask[]` | Wszystkie zadania; aktywny widok filtruje `archivedAt === null` |
| `listMessages?.({channelId, beforeMessageId?, limit?})` | `ChannelMessage[]` | Ostatnia strona, chronologicznie; domyślnie/max 200, starsza strona przez id pierwszej wiadomości |
| `sendMessage?.({channelId, text, resourceKey?})` | `{message, task}` | Człowiek → lider. Domyślny zasób = workspace lidera; `null` wyłącza deklarowany zasób |
| `actOnTask({taskId, action})` | `ChannelTask` | `stop`, `pause`, `resume`, `archive`, `restore`; Resume tylko przez ścieżkę człowieka |
| `reassignTask({taskId, ownerBotId})` | `ChannelTask` | Jawny przydział człowieka; wyzerowanie automatycznego budżetu. `browser` pozostaje, workspace zmienia się na folder nowego właściciela |

`create`, `update`, `addMember`, `removeMember`, `setLead` jak w części 1. Zdarzenia przez istniejące `agent.onEvent` (scoped `serverId: local`):

| Zdarzenie | Dane | Obsługa |
|---|---|---|
| `channels-changed` | `{channels}` | Zastąp listę kanałów |
| `task-changed` | `{task}` | Upsert po `task.id` |
| `channel-message` | `{message}` | Upsert po `message.id` |
| `channel-message-changed` | `{message}` | Upsert istniejącej wiadomości, np. `superseded: true` |

`ChannelMessage`: `id, channelId, taskId|null, authorBotId|null, kind, text, replyToMessageId|null, resultVersion|null, superseded, createdAt`. `kind`: `human | assignment | question | reply | result | note | system`. Człowiek ma `authorBotId: null`. Poprawiony wynik ma nowy id i `resultVersion + 1`; stary pozostaje w historii jako zastąpiony. `ChannelTask.resultMessageId` wskazuje aktualną wersję. Notatki/plan zadania dostają `superseded: true` po wyniku.

Pola zadania dodane opcjonalnie (zgodność z atrapami): `automaticAssignmentCount`, `waitingForTaskIds[]`, `pauseReason|null`, `kind: work|question`, `questionRootId|null`. `assignmentCount` to łączny licznik; osobny automatyczny budżet resetuje tylko człowiek. `waiting` obejmuje pytanie/zatwierdzenie oraz oczekiwanie na pomocników. Pytania pomocnicze są zadaniami dziećmi, bez dodatkowego zadania root.

Limity w jednym `CHANNEL_LIMITS`: instrukcje **2000**, wpis pamięci **500**, odpowiedzi na krótkie pytanie **2**, automatyczne przydziały **8**. Pierwszy przydział, przekazania, pomocnicy i kontynuacje zużywają budżet. Następna próba ustawia `paused` i `pauseReason` z instrukcją wznowienia przez człowieka. `assignmentCount` nie rośnie dla odrzuconego przekazania. Nazwa 40, tytuł 120, członkowie 20, wiadomość 32000, strona historii 200.

Serwer zdalny nadal zwraca puste listy; mutacje kanałów zdalnych są odrzucane. Nie ma jeszcze widoku historii/composera kanału w rendererze.

### Karty akcji (W1-BE3): podgląd szkicu / potwierdzenie i przejęcie przeglądarki

Typy: `packages/contracts/src/ipc-action-cards.ts` i `ipc-attention.ts`. Wszystkie metody są opcjonalne w `window.openbot.agent` i działają tylko na tym komputerze (`serverId: local`). Serwer zdalny zwraca pustą listę szkiców i odrzuca decyzje.

**Jeden typ karty z wariantami** (decyzja lidera 6): `DraftPreviewCard.variant`:

| `variant` | Kiedy | Przyciski w UI | `decision` |
|---|---|---|---|
| `draft` | Agent wysyła coś w imieniu użytkownika (wiadomość, e-mail) | Send / Edit / Keep draft | `send` / `edit` / `keep-draft` |
| `confirm` | Inne działanie w imieniu użytkownika (post, usunięcie, płatność) | Confirm / Edit / Cancel | `send` / `edit` / `keep-draft` |

Karta: `requestId, botId, threadId, turnId, variant, title, recipient|null, channel|null, preview, draftId|null, createdAt`. `preview` to dokładnie to, co wyjdzie. `draftId` jest ustawione, gdy agent ponownie otwiera zachowany szkic.

| Metoda | Wynik | Zachowanie |
|---|---|---|
| `respondToDraftPreview?.({requestId, decision, feedback?, text?})` | `void` | `send` zatwierdza raz dokładnie tę treść dla tych odbiorców. `edit` nic nie wysyła: agent poprawia i pokazuje nową kartę; `text` to własna wersja człowieka (tylko z `edit`), `feedback` to uwagi. `keep-draft` nic nie wysyła i zapisuje szkic. Druga decyzja na tej samej karcie: błąd „already decided or no longer open” |
| `listDrafts?.()` | `KeptDraft[]` | Zachowane szkice, najnowsze pierwsze; trwałe po restarcie (SQLite), max 200 (nowy ponad limit jest odrzucany, stary nigdy nie znika po cichu) |
| `deleteDraft?.({draftId})` | `void` | Usuwa szkic. Szkice usuniętego agenta znikają razem z nim |
| `respondToBrowserTakeover?.({requestId, action})` | `void` | `take-over`: backend aktywuje tę kartę przeglądarki, faza `taken-over`; agent nie może w tym czasie używać narzędzi przeglądarki na tej karcie. `return`: oddanie, agent kontynuuje w tej samej karcie i sesji (te same ciasteczka). `decline`: agent idzie dalej bez pomocy. `return` działa też z fazy `requested` |

Zdarzenia (przez `agent.onEvent`):

| Zdarzenie | Dane | Obsługa w UI |
|---|---|---|
| `draft-preview` | `{card}` | Pokaż kartę w rozmowie, w Needs you i w przypiętej Decyzji |
| `draft-preview-resolved` | `{requestId, botId, resolution}` | Usuń kartę; `resolution`: `send`, `edit`, `keep-draft`, `expired` |
| `drafts-changed` | `{drafts}` | Zastąp listę zachowanych szkiców |
| `browser-takeover` | `{request}` | Karta przejęcia: `tabId`, `url`, `reason`; liczy się do Needs you |
| `browser-takeover-changed` | `{requestId, botId, phase}` | `taken-over`: pokaż panel przeglądarki z tą kartą i przycisk oddania. `returned`, `declined`, `expired`: usuń kartę |

`listPendingRequests()` zwraca też `{kind: "draft-preview", card}` i `{kind: "browser-takeover", request, phase}` w jednej kolejności z pytaniami i zatwierdzeniami, więc karty wracają po przeładowaniu okna. `AgentActivity.pendingRequests` liczy wszystkie cztery rodzaje; wiersz agenta ma stan `waiting`. Otwarta karta wygasa z końcem albo przerwaniem tury (`expired`): nic nie jest zatwierdzone.

Agenci dostają narzędzia `cosgral_cards` (`confirm`, `request_takeover`, `list_drafts`) tym samym mechanizmem co `cosgral_eyes`: funkcje dynamiczne Codex i serwer MCP w procesie dla Claude. Działają też w turach kanału; zadanie kanału ma wtedy stan `waiting`.

## Wykonanie i izolacja

- Każda tura kanału dostaje świeży wątek dostawcy (`ephemeral: true`) z profilem członka, instrukcjami, zadaniem, historią oraz pamięcią tego kanału. Nie używa sesji dostawcy rozmowy 1:1, skrzynki wiadomości prywatnych ani jej historii.
- `assign`, `transfer`, `ask`, `reply`, `result`, `note`, `remember`, `memory`, `history`, `stop` w `cosgral_channels`. `reply` dzieli limit 2 odpowiedzi z pierwotnym pytaniem. Krótki pomocnik nie otwiera dalszych wątków delegacji. Powtórzony `callId` w turze wykonuje skutek tylko raz.
- Wątki kanałów mogą używać zwykłych pytań/zatwierdzeń i oczu; karty przechodzą przez istniejący mechanizm pending requests. Bezpośrednie `openbot.send_message` i odczyt innych kontekstów przez aplikację są poza zakresem kanału i są odrzucane.
- Izolacja jest izolacją kontekstu/narzędzi/pamięci aplikacji. Nie jest nową piaskownicą systemu operacyjnego ani blokadą plików na dysku. Przeglądarka i oczy nadal mają własne reguły dostępu/zgód.
- Po restarcie niepewne `running` i `waiting` na człowieka przechodzą w `paused`; brak automatycznego odtwarzania potencjalnych skutków. Zwykła kolejka `queued` i oczekiwanie na trwałe podzadania pozostają w bazie.
- Zależność zakończona `failed/cancelled` nie spełnia warunku `done`; zadanie zależne pozostaje w kolejce do decyzji człowieka. Sam wynik pomocnika z `failed/cancelled` budzi rodzica, który dostaje stan i może podjąć decyzję.

## Dowody i weryfikacja

Silnik (13.11, kod commita silnika):

| Sprawdzenie | Wynik | Dowód (poza repo, `Shared\cosgral-data\desktop-backend\`) |
|---|---|---|
| Całe `bun run test` | **660/660**, 88/88 plików | `logs\w1-be2-full-test-engine-2.log` |
| Pierwszy przebieg całości | 658/660: dwa testy czasu w `agent-service.test.ts` (rozmowa 1:1, nie kanały) pod obciążeniem; osobno 40/40, w drugim przebiegu całości zielone | `logs\w1-be2-full-test-engine.log`, `logs\w1-be2-agent-service-only.log` |
| `typecheck:contracts`, `typecheck:node`, `typecheck:renderer`, `build` | exit 0 | `logs\w1-be2-verify-engine.log` |
| `biome check` zmienionych plików | bez błędów | — |
| Regresja „czekam na pomocników” | test `never keeps the lead's waiting text…` przechodzi; po usunięciu zabezpieczenia pada z `["Waiting for helpers"]` zamiast `["Final answer"]` | `channel-engine.test.ts` |
| Piaskownica (atrapa Codex, osobne `USERPROFILE`/`APPDATA`/`LOCALAPPDATA`) | `ok: true`: 3 agentów, 2 wersje wyniku, szybki pomocnik (wynik „Stub: fast combined”, nie tekst oczekiwania), pauza po 8 przydziałach i wznowienie przez człowieka, pytanie z kartą, Stop, 0 wiadomości w rozmowach 1:1, historia po ponownym otwarciu bazy | `sandbox-w1-be2-engine-fast\evidence.json` |

Testy TDD: `channel-history.test.ts`, `channel-engine.test.ts`, `channel-agent-runner.test.ts`, `channel-messages.test.ts`; aktualizacja `channel-store.test.ts`, `agent-service.test.ts`, `claude-client.test.ts` i testów kontraktu. Sprawdzone czerwone testy przed implementacją: limity i brak metod magazynu, brak silnika/runnera, brak IPC, brak integracji AgentService/MCP Claude, pauza po usunięciu właściciela, fan-out, uruchamianie dzieci po pauzie, notatki po wyniku, Stop przed potwierdzeniem startu i powtórzony `callId`.

Piaskownica jest headless: prawdziwe AgentService, AppServerClient, SQLite i ChannelEngine + osobny proces atrapy Codex. Przeglądarka w tej próbie jest atrapą (nie jest sterowany pulpit). Skrypt `scripts/channel-sandbox-smoke.ts`, protokół atrapy `src/backend/testing/channel-codex.cjs`. Dowody i profile poza repo: `Shared/cosgral-data/desktop-backend/sandbox-w1-be2-engine*`. Brak prawdziwych tur modelu.

## Commity i przekazanie

Do uzupełnienia po weryfikacji. Bez push; każdy nowy commit z wymaganym trailerem. Lider scala po review. UI korzysta z kontraktu powyżej. Instalator bez `claude.exe`, karta szkicu i przejęcie przeglądarki nie wchodzą w to zadanie.
