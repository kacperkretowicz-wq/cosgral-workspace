# Raport W1-UI1 — oczy agenta, localProfile, szyna stron, angielski UI

**Gałąź:** `team/ui/w1-ui1` (z `codex/cosgral-desktop` @ `e10abd46d`)  
**Agent:** UI Designer  
**Data:** 12.11.2026  
**Zakres:** tylko renderer, stories, testy i ten raport. Bez pushu.

## Werdykt

Wszystkie 7 punktów zadania zrobione. `bun run test` (pełny zestaw): **70 plików, 514 testów, wszystkie zielone**. `typecheck:renderer`, `typecheck:storybook` i `build` OK.

## Co się zmieniło

| # | Temat | Zachowanie |
|---|---|---|
| 1 | **Oczy agenta: wskaźnik + Stop** | `App.tsx` ładuje `window.openbot.agent.getEyesState?.()` i słucha `eyes-changed` (sygnał `AgentEyesState`). Wiersz agenta w pasku ma pulsujące oko („Looking”, także w `aria-label`). Pod nagłówkiem rozmowy jest cienki pasek `EyesBar` (jeden wiersz na sesję): **kto**, **na co patrzy** (`targetLabel`), **faza i klatki** (`Live · 2 / 5 frames` / `Capturing · 0 / 1 frame`), **`until HH:MM`** gdy jest `endsAt`, przycisk **Stop**. |
| 2 | **Karty zatwierdzeń oczu** | `approvalTitle`: `screen` → „Allow screen access?” (źródło `window` → „Allow window access?”), `camera` → „Allow camera?”. Gdy jest `approval.eyes`, karta pokazuje „Looks at / Camera” (`targetLabel`) i „Mode” („Single capture” albo „Live preview · 3 frames every 2s”). Ikona oka zamiast tarczy. Needs you: „Screen access: Screen 1”, „Camera photo” / „Camera live preview”. |
| 3 | **`localProfile`** | `App` oblicza `localProfile` ze stanu `signed_in` i przekazuje do `Sidebar`. Gdy `true`: brak „Sign out” i brak e-maila technicznego w popoverze konta (nazwa zostaje). |
| 4 | **Jednolity angielski** | Needs you („Needs you”, „Question”, „Approval”), Decision („Decision”, „Decision · pinned”), `needs-you.ts` („Agent question”, „File changes”, „Permissions”, „Approval”), a także Chat \| Tasks (`ChatTasksSwitch`, `ChannelTasksPanel`, `channel-tasks.ts`: „Tasks”, „Queued”, „Running”, „Waiting”, „Done”, „Failed”, „Stopped”, „Resume”), bo to też był polski tekst UI z B4. Testy i stories zaktualizowane. |
| 5 | **Szyna stron** | `PageRail` obok `ServerRail`: Agents, Schedule, Tasks, Workflows, Usage, Library, Marketplace, na dole Settings. Agents = dotychczasowy UI. Settings = `setPermissionsOpen(true)` (nie zmienia strony). Pozostałe = `ComingSoon` w kolumnie rozmowy; **Sidebar zostaje zamontowany**, więc lista agentów (szukaj, przewinięcie) się nie gubi. Wybór agenta/osoby/„+” w pasku wraca na Agents. Czat poza stroną Agents nie liczy się jako „otwarty” (nie oznacza wiadomości jako przeczytanych). `app-frame` dostał kolumnę `--page-rail-width: 54px`. |
| 6 | **`mock-openbot.ts`** | Opcjonalne `getEyesState` i `stopEyes` oraz opcja `eyesState` i sterowanie `emitEyesState`. `stopEyes` czyści pasujące sesje (i zgody dla `botId` / wszystkich) i wysyła `eyes-changed`. |
| 7 | **Weryfikacja** | Patrz niżej. |

### Uwaga dla Backendu

`getEyesState` i `stopEyes` są w `OpenBotDesktopApi.agent` **opcjonalne** (kontrakt A1: `?`), a UI woła je przez `?.`. Mock je implementuje, więc **Backend może zrobić je wymaganymi** (usunąć `?` w `packages/contracts/src/ipc-desktop-apis.ts`), jeśli preload zawsze je podaje. Wtedy w `App.tsx` można też usunąć `?.` i ścieżkę „brak API”.

### Decyzje projektowe

- **Stop** wywołuje `stopEyes({ botId })`, nie `sessionId`: kontrakt mówi, że `botId` kończy patrzenie i cofa zgody tego agenta. To bezpieczniejszy skutek niż zatrzymanie jednej klatki. `sessionId` jest w kontrakcie, ale UI go nie używa.
- Pasek pokazuje **wszystkie** sesje (nie tylko aktywnego agenta): nazwa agenta jest w wierszu, a patrzenie innego agenta też powinno być widoczne.
- Wskaźnik w pasku agentów to osobny prop `lookingBotIds`, nie nowy `SidebarAgentState`, bo „patrzy” może iść razem z `working` lub `needs-you`.
- Pasek to cienki (30 px) wiersz w tonie `--openbot-danger-soft`, nie karta. Pulsowanie wyłącza `prefers-reduced-motion`.
- Aplikacja ma dziś jeden, ciemny motyw. „Light” w stories to tokeny podmienione lokalnie w `stories/theme-frame.tsx` (do sprawdzenia kontrastu i układu), nie nowy motyw produktu.

## Pliki

Nowe: `components/{EyesIndicator,PageRail,ComingSoon}.tsx`, `styles/cosgral.css`, `stories/{Eyes,PageRail}.stories.tsx`, `stories/theme-frame.tsx`, testy `EyesIndicator`, `PageRail`, `ConversationPrompts.eyes`, `Sidebar.eyes-local`, `App.eyes`.  
Zmienione: `App.tsx`, `Sidebar.tsx`, `Conversation.tsx`, `ConversationPrompts.tsx`, `StickyDecision.tsx`, `ChatTasksSwitch.tsx`, `ChannelTasksPanel.tsx`, `needs-you.ts`, `channel-tasks.ts`, `styles.css`, `styles/app-shell.css`, `stories/mock-openbot.ts`, `stories/BetterUx.stories.tsx`, testy `App`, `StickyDecision`, `Sidebar.needs-you`, `needs-you`, `ChannelTasksPanel`, `COSGRAL-CHANGES.md`.

## Dowód

| Polecenie | Wynik |
|---|---|
| `bun run test` (pełny) | **70 plików, 514 testów, 0 błędów** (≈ 640 s na tej maszynie) |
| `bun run typecheck:renderer` | OK |
| `bun run typecheck:storybook` | OK |
| `bun run build` | OK |

Nowe testy (31): `needs-you` +3, `EyesIndicator` 7, `ConversationPrompts.eyes` 5, `Sidebar.eyes-local` 4, `PageRail` 4, `App.eyes` 8. Pokrywają m.in.: pasek znika przy pustym stanie, klatki i `until`, Stop → `stopEyes({ botId })` i znikanie paska po `eyes-changed`, tytuły kart `screen`/`window`/`camera`, ukrycie Sign out i e-maila przy `localProfile`, „Coming soon” przy zachowanej liście agentów, powrót na Agents po wyborze agenta, Settings otwiera dialog bez zmiany strony.

Uwaga o stabilności: test `App.test.tsx › selects a stable generated avatar…` ma limit 5 s i na tej maszynie trwa 3,3–4,5 s (także na czystej bazie 4,1 s). W jednym przebiegu pod obciążeniem przekroczył limit, w następnych przebiegach (też pełnym) przeszedł. Nie jest powiązany ze zmianą.

## Jak zobaczyć w Storybooku

`bun run storybook` → port 6006:

- **Better / Agent eyes**: `Bar · dark/light`, `Approval · screen (window, live)` i `camera` w obu motywach, `Sidebar row · dark/light` (oko przy Research, `localProfile`), `In the app (Stop clears the bar)` (play test).
- **Navigation / PageRail**: `Rail · dark/light`, `Coming soon · dark/light`, `In the app` (play test: Schedule → „Coming soon”, lista agentów zostaje, Agents → rozmowa).
- **Better / Lepszy A+B+C**: napisy po angielsku („Sticky Decision”, „Chat | Tasks”).

## Nie sprawdzone

- Stories nie były uruchomione w przeglądarce: w tym środowisku nie ma Chromium dla Playwright (`test:storybook` nie startuje). Stories przechodzą `typecheck:storybook`, a te same ścieżki pokrywają testy jsdom.
- Brak zrzutów ekranu Electron; układ kolumny stron (CSS) sprawdzony tylko przez budowę i testy, nie wizualnie.
- `bun run lint` na całym repo nie był uruchamiany (są wcześniejsze uwagi Biome poza zakresem); nowe pliki są sformatowane Biome.
