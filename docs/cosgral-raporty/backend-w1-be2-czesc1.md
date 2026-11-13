# Backend W1-BE2, część 1: kanały i zadania kanału (dane, reguły, API) (12.11.2026)

Gałąź `team/backend/w1-be2` od integracji `codex/cosgral-desktop` @ `d6bb1f06d` (tam są już W1-BE1, W1-UI1 i opis W1-T1). Czas: ok. 1,5 h.

## Następny krok

1. **Lider (ok. 15 min):**
   - decyzje w 6 pytaniach z opisu Testera (moje ustawienia domyślne w sekcji 1);
   - przegląd i scalenie 3 commitów (sekcja 6).
2. **UI Designer:** widok Zadania i lista kanałów mogą przejść z atrapy na `window.openbot.channels` (sekcja 2).
3. **Backend (ja), część 2:** silnik kanału:
   - wiadomości kanału i wspólna historia;
   - wiadomość człowieka staje się zadaniem lidera;
   - narzędzia agenta: wynik, przydział, krótkie pytanie do członka;
   - uruchamianie zadań po kolei.

## Werdykt

| Cel z opisu W1-T1 | Stan | Gdzie |
|---|---|---|
| Kanał: nazwa, tytuł, instrukcje z limitem, członkowie, lider, izolacja, archiwum | ✓ dane, reguły i API; trwałe po restarcie | sekcje 2–3 |
| Zadanie: właściciel, stan, tytuł, prośba, wynik | ✓ | sekcja 2 |
| Stany z opisu: `paused`, archiwum osobno od stanu | ✓ | sekcja 1, pkt 1 |
| Przydział i przekazanie z licznikiem przydziałów | ✓ | sekcja 2 |
| Zależności, zadania na tym samym zasobie po kolei | ✓ (wybór zadań do startu) | sekcja 3 |
| Jeden wynik na zadanie | ✓ | sekcja 1, pkt 2 |
| Stop, pauza, wznowienie, archiwum, przywrócenie | ✓ | sekcja 2 |
| Wiadomości kanału, uruchamianie agentów, narzędzia agenta | część 2 | — |
| Pamięć kanału i egzekwowanie izolacji | część 2 (na razie tylko flaga) | — |

## 1. Pytania Testera: moje ustawienia domyślne (lider może zmienić)

1. **Stany:** osobny stan `paused` + pole `archivedAt`. Archiwum nie jest stanem, więc Stop ≠ Archive, a przywrócenie wraca do stanu sprzed archiwum.
2. **Wynik:** jeden na zadanie. Drugi wynik jest odrzucany („This task already has a result.”), a poprawka to nowe zadanie.
3. **Limity (`CHANNEL_LIMITS`):**
   - nazwa: 1–40 znaków, małe litery, cyfry i myślniki, unikalna na tym komputerze;
   - tytuł: do 120 znaków; instrukcje: do 4000;
   - członkowie: 1–20; tytuł zadania: do 120;
   - odpowiedzi na jedno pytanie do członka: 2.
4. **Zasób:** dowolny klucz tekstowy (`resourceKey`). W części 2 silnik poda w nim folder roboczy agenta.
5. **Przejęcie przeglądarki w Needs you:** tak, kontrakt ma już `PendingBrowserTakeover` (W1-BE1).
6. **Podgląd szkicu:** jeden typ karty (`DraftPreviewCard`, Send / Edit / Keep draft) dla wszystkich wysyłek w imieniu użytkownika.

## 2. Kontrakt dla UI

Typy: `packages/contracts/src/ipc-workspace-channels.ts`. API: `window.openbot.channels` (opcjonalna przestrzeń; preload ją teraz wystawia).

| Metoda | Zwraca | Uwagi |
|---|---|---|
| `list()` | `WorkspaceChannel[]` | od najstarszego |
| `listTasks(channelId)` | `ChannelTask[]` | także zarchiwizowane; aktywna lista = `archivedAt === null` |
| `create({ name, title, instructions, memberBotIds, leadBotId, isolated })` | `WorkspaceChannel` | lider musi być członkiem |
| `update({ channelId, title?, instructions?, isolated?, archived? })` | `WorkspaceChannel` | nazwa się nie zmienia |
| `addMember` / `removeMember` / `setLead({ channelId, botId })` | `WorkspaceChannel` | lidera nie da się usunąć; członka z otwartymi zadaniami też nie |
| `actOnTask({ taskId, action })` | `ChannelTask` | `stop`, `pause`, `resume`, `archive`, `restore` |
| `reassignTask({ taskId, ownerBotId })` | `ChannelTask` | tylko członek; zadanie startuje od nowa u nowego właściciela |

- **Zdarzenia:**
  - `channels-changed { channels }`: pełna lista po każdej zmianie kanału;
  - `task-changed { task }`: po każdej zmianie zadania.
- **Nowe pola `ChannelTask`** (ponad uzgodniony kształt): `parentTaskId`, `dependencyTaskIds`, `resourceKey`, `assignmentCount`, `archivedAt`, `createdAt`. Nowy stan: `paused` (proponowana etykieta „Paused”; `cancelled` w UI to już „Stopped”).
- **Nowe pole `WorkspaceChannel`:** `isolated`.
- **Co robią przyciski:**

| Akcja | Z jakich stanów | Wynik |
|---|---|---|
| Stop | queued, running, waiting, paused | `cancelled` |
| Pause | queued, running, waiting | `paused` |
| Resume | paused, cancelled | `queued` |
| Archive / Restore | każdy | ustawia / czyści `archivedAt`, stan bez zmian |
| Reassign | otwarte (nie done / failed / cancelled) | nowy właściciel, `queued` (pauza zostaje pauzą), `assignmentCount + 1` |

- **Komunikaty błędów (po angielsku):**
  - „A channel named … already exists.”
  - „A channel name has 1–40 lowercase letters, digits or dashes.”
  - „The lead must be a member of the channel.”
  - „Choose another lead before removing this member.”
  - „Reassign this member's open tasks before removing it.”
  - „Channel instructions have at most 4000 characters.”
  - „Only a paused or stopped task can be resumed.”
  - „This task is not running.”
  - „This task is already finished.”
  - „This task is finished.”
  - „Only a member of the channel can own its tasks.”
  - „This agent no longer exists.”
  - „Channels are available only on this computer for now.”
- **Foldery:** kanał można już włożyć do folderu (`sidebar.moveItem({ itemKind: "channel", … })`).
- **Nie ma jeszcze:**
  - tworzenia zadań z UI: zadania tworzy silnik z wiadomości kanału (część 2), więc dziś lista zadań jest pusta;
  - wiadomości kanału.

## 3. Jak to działa

- `src/backend/channel-store.ts` (`ChannelStore`), dwie nowe projekcje w `openbot.db`:
  - `projection_channels`;
  - `projection_channel_tasks`.
- Każda zmiana to zdarzenie `channel.*` albo `channel-task.*` w dzienniku i zapis w tej samej transakcji.
- `startable()` wybiera zadania, które silnik może teraz uruchomić. Zadanie musi:
  - być `queued` i niezarchiwizowane;
  - mieć wszystkie zależności `done`;
  - mieć wolny zasób: nic na nim nie jest `running` ani `waiting`, a starsze zadanie w kolejce nie czeka na ten sam zasób.
- Usunięcie agenta (`bots-changed`) zdejmuje go z kanałów. Usunięty lider przekazuje rolę następnemu członkowi, a jego otwarte zadania przechodzą do nowego lidera. Gdy w kanale nikt nie zostaje, zadania się zatrzymują.
- IPC: `channels:*` w `src/main/index.ts`, wejścia sprawdza `src/main/ipc/channel-inputs.ts`; tylko ten komputer.

## 4. Testy i dowody

| Plik | Nowe testy | Co sprawdza |
|---|---|---|
| `packages/contracts/src/ipc-workspace-channels.test.ts` | 2 | walidacja zadania (`paused`, archiwum, zależności) i kanału (`isolated`), nazwa kanału |
| `src/backend/channel-store.test.ts` | 7 | trwałość po restarcie bazy; reguły nazwy, lidera, członków i limitu instrukcji; członkowie i lider; zależności i zasób (kolejność startu); jeden wynik; Stop / Pause / Resume / Archive / Restore; przekazanie; usunięty agent |
| `src/main/ipc/input-parsers.test.ts` | 2 | wejścia `channels:*` i komunikaty błędów |

- Cały zestaw na Windows: **75 plików, 547/547 testów zielonych**, 750 s. Liczba obejmuje też testy W1-UI1, które przyszły ze scaleniem. Log: `Shared\cosgral-data\desktop-backend\logs\b1\w1-be2-test.log`.
- `bun run typecheck` bez błędów; `biome check` na zmienionych plikach bez błędów.
- Piaskownica (build z tej gałęzi, atrapa Codex, dwóch agentów), przebieg `w1-be2-channels`:
  - kanał `launch-plan` utworzony (2 członków, izolowany, lider = pierwszy agent);
  - druga taka sama nazwa odrzucona („A channel named launch-plan already exists.”);
  - usunięcie lidera odrzucone („Choose another lead before removing this member.”);
  - zmiana lidera i tytułu („Launch plan Q4”) działa;
  - kanał trafił do folderu „Projects”.
- Restart na tym samym profilu (`w1-be2-channels-restart`): kanał, tytuł, instrukcje, izolacja i miejsce w folderze bez zmian.
- Wszystkie przebiegi zamknęły się czysto, 0 procesów po zamknięciu.
- Uwaga: pierwszy przebieg zamykał się 11,9 s. Powtórka na świeżym profilu zamknęła się w 0,9 s, a restart w 1,6 s, więc tego nie odtworzyłem.
- Dowody: `Shared\cosgral-data\desktop-backend\evidence\b1\w1-be2-channels*`.

## 5. Ograniczenia

1. Część 2 dopiero przed nami:
   - agenci jeszcze nie pracują w kanałach;
   - nie ma wiadomości kanału, pamięci kanału ani egzekwowania izolacji (jest tylko flaga).
2. Zarchiwizowany kanał blokuje tylko nowe zadania. Pozostałe skutki archiwum dojdą z silnikiem.
3. Serwer zdalny: puste listy, zmiany kończą się błędem.

## 6. Commity (gałąź `team/backend/w1-be2`)

1. `480b912f7` contracts: channel and task lifecycle for W1-BE2 (from W1-T1)
2. `acf355c7b` backend: channels and channel tasks saved in the local database
3. docs: W1-BE2 part 1 report and change log (ten raport i `COSGRAL-CHANGES.md`)

Bez push, z trailerem `Co-authored-by: OpenBot`.
