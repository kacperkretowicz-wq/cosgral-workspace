# KK Fullstack W6-KK3: powód błędu startu CLI i osobne okno rozmowy

Data: 16.11.2026. Gałąź `team/kk/w6-kk3` (od integracji `b765a716a`). Tylko testy jednostkowe, bez Electrona i `sandbox:e2e` (maszyna była zajęta przez lidera).

## Wynik w jednej linii

**1) `resolveClaudeCli` nie połyka już przyczyny i raz ponawia zablokowany start (commit `7f9f88290`). 2) Osobne okno rozmowy: kontrakt i mock w osobnym pierwszym commicie `8376b3d2b` (UI Designer może zaczynać), potem zasady okien w main, okno Electron, IPC `windows:*`, minimalny widok `#conversation/<agent>/<wątek>` i dopisek do testu „tylko ten komputer”.**

## 1. Powód błędu startu CLI (`src/backend/cli.ts`)

Zauważone w G3b: raz „Claude CLI was found but could not be started” przy świeżo pobranym pliku 372 MB, choć chwilę potem `--version` działało.

- **Ponowienie:** start zablokowany lub „w użyciu” (kody `EBUSY`, `EPERM`, `EACCES`, `ETXTBSY`, `UNKNOWN`) jest ponawiany raz po 1,5 s (skan antywirusa). Limit czasu jest ponawiany od razu jak dotąd. Kod wyjścia i brak pliku nie są ponawiane (pauza tu nie pomoże). Dotyczy też Codex, bo wspólny wykonawca `runCliWithRetry`.
- **Powód w komunikacie (Claude):** `Claude CLI was found but could not be started (<powód>). Run \`claude --version\` in a new terminal.` Powody: „timed out starting; the computer may be busy”, „blocked: the file is in use or held by a virus scan”, „the file is missing”, „exited with code N”, „stopped by signal X”, „it did not report a version this program understands”, „it could not be run”. Nigdy surowy tekst błędu (zawiera ścieżkę, więc nazwę użytkownika) ani wyjście programu.
- Komunikat Codex bez zmian (jest dla niego osobny test na dokładny tekst).
- Testy `cli-start-failure.test.ts` (12): ponowienie dla 4 kodów, dwa razy zablokowany (wychodzi drugi błąd, bez trzeciej próby), pauza przed drugą próbą, brak ponowienia dla kodu wyjścia i braku pliku, limit czasu dwukrotnie, nazwy powodów, brak ścieżek w powodzie, prawdziwa atrapa CLI z kodem 3 (komunikat bez nazwy folderu) i z niezrozumiałym wyjściem. Razem z `cli.test.ts`, `cli-timeout.test.ts`, `managed-cli.test.ts`: 38/38.

## 2. Osobne okno rozmowy (spec-w6 §1F, W36–W38)

Decyzje lidera: Q16 okna nie wracają po restarcie, Q17 osobne okno to nie dok.

**Kontrakt (`ipc-windows.ts`, commit `8376b3d2b`):** `window.openbot.windows` (opcjonalne): `openConversation({botId, threadId?})` → `{window, created}`, `listOpen()`, `close({botId, threadId})`, `current()` (które to okno; `null` w głównym oknie). Zdarzenie `conversation-windows-changed` z całą listą. `ConversationWindowInfo`: `id` (`botId:threadId`), `botId`, `threadId`, `title` („Agent / Tytuł wątku”), `live`, `focused`. Trasa okna `#conversation/<agent>/<wątek>` z parserem. Limit 8 okien. Mock: `createMockWindows` (to samo zachowanie, `simulate.setActiveThread/setCurrent`).

**Zasady (`conversation-windows.ts`, 12 testów na atrapie gospodarza):**
1. Jedno okno na (agent, wątek): drugie otwarcie przenosi fokus do istniejącego i nie robi duplikatu (też przy pełnym limicie).
2. Bez `threadId` otwiera się wątek, który agent pokazuje w głównym oknie.
3. Odmowa z czytelnym powodem: nieznany agent, agent bez rozmowy, nieznany wątek, za dużo okien.
4. Zamknięcie okna (przez osobę lub `close`) usuwa tylko to okno; nie dotyka wątku ani tury (ta klasa nie ma drogi do silnika poza pytaniem o nazwy i wątki, W38). Zamknięty wątek można otworzyć od nowa.
5. `live`, tytuł i życie okna idą za zdarzeniami silnika: przełączenie agenta na inny wątek = stare okno `live: false` (nie miesza wątków), powrót = znów `live`; zmiana nazwy zmienia tytuł okna; wątek usunięty na zawsze zamyka jego okno; zarchiwizowany je zostawia; usunięty agent zabiera swoje okna; koniec programu zamyka okna po cichu.
4. Fokus okna jest śledzony.

**Okno Electron (`conversation-windows-electron.ts`):** ten sam preload i te same ustawienia zaufania co główne okno (sandbox, bez node, `will-navigate` tylko dla zaufanego adresu, bez nowych okien z strony, tytuł okna należy do programu), dostaje zdarzenia agenta tego komputera jak dok.

**IPC (`windows-ipc.ts`):** 4 kanały `windows:*`, tylko ten komputer, żądanie sprawdzane parserami kontraktu przed czymkolwiek, `current` rozpoznaje okno po adresie strony, która pyta (`senderFrame.url`), przez nowe małe `handleTrustedFrame` w `trusted-ipc.ts` (ta sama kontrola zaufania). Testy: `windows-ipc.test.ts` (4, z prawdziwymi zasadami i zaufaniem) i dopisek w `local-only-ipc.test.ts` (4 kanały odmawiają obcym serwerom i telefonowi).

**Widok (`ConversationWindowApp`):** minimalny, jak dok, do przejęcia przez UI Designera: tytuł, historia, pole wiadomości przez zwykłe API agenta, notatka i zablokowane pole, gdy okno nie jest `live`.

## 3. Testy i kontrola

| Co | Wynik |
|---|---|
| `cli-start-failure` + `cli` + `cli-timeout` + `managed-cli` | 38/38 |
| `ipc-windows` (kontrakt), `mock-windows` | 6 + 7 = 13/13 |
| `conversation-windows`, `windows-ipc`, `local-only-ipc` | 12 + 4 + 8 |
| `src/main`, kontrakty windows/context/threads, `src/renderer/stories` razem | 50 plików, 250/250 |
| `typecheck:node`, `typecheck:renderer`, `check:ui` (dług 0/0) | zielone |
| `bun run lint` | zielony poza jednym cudzym plikiem: format `agent-service-threads.test.ts` (Backend, już poprawiony w W6-BE3) |

## 4. Czego nie sprawdziłem i decyzje do potwierdzenia

1. **Nie uruchamiałem Electrona**: prawdziwego otwarcia, fokusu, zamknięcia i `current()` w oknie nie widziałem. Do sprawdzenia po `GO-W6.txt` (krok odbioru: otwarcie, drugie otwarcie tego samego, dwa wątki, zamknięcie w trakcie tury).
2. **Okno nieaktywnego wątku nie pokazuje wiadomości.** `readConversation(botId)` czyta tylko wątek aktywny, więc dopóki silnik (Backend, W6-BE3) nie umie czytać innych wątków, okno wątku, który nie jest aktywny, mówi to zamiast pokazywać cudze wiadomości. To jest granica, nie usterka okna; kontrakt (`live`) jest na to gotowy.
3. **Decyzje:** limit 8 okien (spec: „do ustalenia”), okno zarchiwizowanego wątku zostaje otwarte, okna nie wracają po restarcie (Q16).
4. Tekst i wygląd okna to szkic; kroki z `parseAgentRequest` itd. nie zmieniły `agent-service.ts` (zgodnie ze zleceniem).
5. Konflikty przy scalaniu: `ipc-channels.ts`, `ipc-conversation.ts`, `ipc-desktop-apis.ts`, `ipc.ts`, `preload/index.ts`, `mock-openbot.ts`, `main/index.ts`, `local-only-ipc.test.ts`: zostawić obie strony.
