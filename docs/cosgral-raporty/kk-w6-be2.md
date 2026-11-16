# KK Fullstack W6-BE2: kontekst rozmowy (wskaźnik, kompakt, ustawienia)

Data: 16.11.2026. Gałąź `team/kk/w6-be2` (od integracji `ff0801992`). Wejście: `spec-w6.md` §1B (wiersze 9–13), W11–W16, decyzje lidera Q6 i Q7. Tylko testy jednostkowe, bez Electrona.

## Wynik w jednej linii

**Kontrakt i mock są w osobnym pierwszym commicie `45be93f0c` (UI Designer może zaczynać W6-UI2). Silnik: stan kontekstu per wątek z tego, co CLI naprawdę podaje (Codex), zapamiętany w bazie i wracający po restarcie; auto-kompakt z progu w ustawieniach (domyślnie 90 %, wyłączalny); ręczny kompakt działa od razu przy bezczynnym wątku, a w trakcie tury zaraz po niej. Gdy dostawca nie podaje liczb (Claude Code, ACP, własny punkt końcowy): „niedostępne” z powodem, żadnych wymyślonych procentów.**

## 1. Co raportują klienci (sprawdzone w kodzie)

| Dostawca | Co podaje o kontekście | Co robi program |
|---|---|---|
| Codex App Server | `thread/tokenUsage/updated`: `tokenUsage.last.totalTokens` i `modelContextWindow` | **raportowane**; można poprosić o kompakt (`thread/compact/start`) |
| Claude Code (adapter SDK) | nic nie przekazuje; `thread/compact/start` to pusta operacja („Claude Code zwija kontekst sam”) | **niedostępne**, powód „Claude Code does not report its context size, and it compacts by itself.”, `canCompact: false` |
| Agent ACP, własny punkt końcowy | nic nie przekazują | **niedostępne**, `canCompact: false` |

Wcześniej silnik znał tylko liczby Codex w pamięci i kompaktował przy stałym progu 80 %, bez ustawień, bez zdarzeń i bez śladu w oknie.

## 2. Kontrakt dla UI (`packages/contracts/src/ipc-context.ts`, SHA `45be93f0c`)

- `window.openbot.context` (opcjonalne): `getState({botId, threadId?})`, `compact({botId, threadId?})`, `getSettings()`, `updateSettings({autoCompact?, thresholdPercent?})`. Brak `threadId` = wątek pokazywany w oknie. `threadId` to publiczny identyfikator wątku (ten sam, co w migawce rozmowy; zgodnie z kontraktem BE1).
- `ContextState`: `source` (`reported` | `estimated` | `unavailable`), `used`, `limit`, `percent` (0–100 całkowite, `null` gdy brak danych), `unavailableReason`, `warning` (od 80 %), `compacting`, `canCompact`, `compactions`, `lastCompactedAt`, `lastCompactedFromTokens`, `stale` (liczby sprzed kompaktu, nowych jeszcze brak), `updatedAt`. Strażnik `isContextState` odrzuca stan „niedostępne” z liczbami oraz stan z danymi bez liczb: UI nie dostanie 0 % ani 100 % bez danych.
- Zdarzenia (w `AgentEvent`): `context-changed` (cały `ContextState` jednego wątku) i `context-settings-changed`.
- Ustawienia: `autoCompact` (domyślnie `true`), `thresholdPercent` (50–95, domyślnie 90). Zła wartość jest odrzucana z komunikatem, nie przycinana.
- `estimated` jest w kontrakcie dla dostawcy, który podaje same liczby bez okna; żadna ścieżka silnika go dziś nie tworzy (Q6: bez zgadywania).
- Mock: `createMockContext(emit, activeThreadOf?)` z `simulate.report / silent / finishCompaction`, podpięty do `window.openbot.context` w `mock-openbot`.
- Pokazywanie w UI: wskaźnik z `percent` i `warning`; przy `unavailable` pokazać `unavailableReason`; przycisk kompaktu tylko gdy `canCompact`; „Kompaktowanie…” gdy `compacting`; po kompakcie `compactions`/`lastCompactedAt` (nie ukrywać skrócenia, W16).

## 3. Silnik

- `src/backend/context-tracker.ts`: `ContextStore` (tabele `projection_context_state` i `projection_context_settings`, tworzone leniwie, wspólny schemat bazy nietknięty) i `ContextTracker` (stan, raport, zliczanie kompaktów, ustawienia, `forget`).
- `AgentService`: raport Codex po każdej turze zapisuje liczby per (agent, wątek) i wysyła `context-changed`; próg auto-kompaktu z ustawień zamiast stałej 80 %; `contextState`, `compactContext`, `contextSettings`, `updateContextSettings`, `forgetContext`. Kompakt zlecony przez osobę: wątek bezczynny = od razu; tura w toku = „compacting” od razu i kompakt zaraz po turze (następna wiadomość z kolejki czeka, jak przy automatycznym). Zlecony ręcznie kompakt robi się niezależnie od progu.
- Po kompakcie: licznik rośnie, liczby zostają oznaczone `stale`, aż Codex poda nowe (nie zerujemy wskaźnika, W15).
- IPC `src/main/context-ipc.ts` (4 kanały, tylko ten komputer); dopisane do `local-only-ipc.test.ts` (odmowa dla serwera zdalnego i telefonu).
- Zmiana zachowania: próg automatycznego kompaktu to teraz domyślnie 90 % (było 80 %): trzy istniejące testy w `agent-service.test.ts` dostosowane (92 000 i 89 000 zamiast 82 000 i 79 000 z oknem 100 000).

## 4. Testy

| Plik | Co | Wynik |
|---|---|---|
| `ipc-context.test.ts` | procent tylko z prawdziwych liczb, ostrzeżenie, strażnicy, ustawienia, zdarzenia w `AgentEvent` | 6/6 |
| `mock-context.test.ts` | brak danych, raport, dwa wątki i dwóch agentów, kompakt i `stale`, ustawienia | 5/5 |
| `context-tracker.test.ts` | brak danych per dostawca, raport i zdarzenia bez powtórek, odrzucenie złych liczb, dwa wątki, kompakt, restart (liczby, stale, liczniki), `forget`, ustawienia i restart, próg i wyłącznik | 11/11 |
| `agent-service.test.ts` (nowy blok „conversation context”, 8 testów) | brak danych i nieznany agent, raport + ostrzeżenie + brak kompaktu poniżej 90, niższy próg z ustawień, wyłączone auto, ręczny kompakt przy bezczynności, ręczny w trakcie tury, restart programu, czyszczenie historii | 80/80 w całym pliku |
| `local-only-ipc.test.ts` | 4 kanały `context:*` odmawiają obcym serwerom | 6/6 |
| silnik z kontami, modele zapasowe, punkty końcowe | regresja | 59/59 razem z powyższymi (7 plików) |
| `bun run lint` (791 plików), `typecheck:node`, `typecheck:renderer` | | zielone |

## 5. Decyzje do potwierdzenia i czego nie sprawdzono

1. **Claude Code:** „niedostępne”. Wyniki SDK mają pole `usage`, ale to suma całego zapytania, nie rozmiar kontekstu; bez próby na prawdziwym CLI nie robię z tego liczby (Q6). Można dodać później po sprawdzeniu.
2. **Wątki:** dziś jest jeden publiczny wątek agenta (`bot.threadId`), więc kompakt dotyczy tylko wątku pokazywanego (inny identyfikator: błąd „Only the conversation shown for this agent can be compacted.”). Po scaleniu W6-BE1 trzeba tu podać zewnętrzny identyfikator Codex wątku z jego mapowania; interfejs już przyjmuje `threadId`.
3. **Czyszczenie historii (W14):** `forgetContext` jest gotowe i przetestowane, ale nie ma jeszcze akcji „usuń historię” w silniku do podpięcia (BE1/BE3).
4. **Konta K1:** kompakt idzie przez klienta agenta jak dotychczas; przy puli kont wątek żyje w procesie konta, tego nie sprawdzałem.
5. **Po restarcie** ręczny kompakt działa z zapisanych liczb, ale wątek CLI musi być wznowiony; nie sprawdzałem tego z prawdziwym Codex (w razie błędu silnik zgłasza `context_compaction_failed` i kolejka idzie dalej).
6. Nie uruchamiałem Electrona, `sandbox:e2e`, pełnego `bun run test` ani prawdziwego Codex/Claude. UI (wskaźnik, przyciski, ustawienia) to W6-UI2.
7. Konflikty przy scalaniu z `team/backend/w6-be1` (obie gałęzie dopisują linie w `ipc-channels.ts`, `ipc-conversation.ts`, `ipc-desktop-apis.ts`, `ipc.ts`, `preload/index.ts`, `mock-openbot.ts`): zostawić obie strony.
