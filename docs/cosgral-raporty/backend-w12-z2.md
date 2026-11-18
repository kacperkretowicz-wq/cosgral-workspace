# BE-Z2: ustawienia wyglądu naprawdę działają w polu wiadomości i w krokach agenta (18.11.2026)

Gałąź `team/backend/w12-z` (kod `971d371ea`), kolejka Backend, pozycja 2. Powód wyboru: ustawienia z `appearance` (BE-U) zapisywały się, a KAPI-N tylko ustawiał je w atrybutach `<html>`; **żadne nie zmieniało zachowania okna** (podobnie jak atrapy przełączników). Z trzech (skrót wysyłania, kroki agenta, nieprzeczytane) dwa dają się zrobić bez ruszania układu paska bocznego.

## Co działa teraz
1. **Skrót wysyłania** (`appearance.sendShortcut`): pole wiadomości czyta ustawienie przy każdym naciśnięciu Enter (`src/renderer/src/send-shortcut.ts`, funkcja `enterAction`).
   - `enter` (domyślne, jak dotąd): Enter wysyła, Shift+Enter łamie wiersz, Ctrl/Cmd+Enter też wysyła.
   - `mod-enter`: tylko Ctrl/Cmd+Enter wysyła; Enter i Shift+Enter łamią wiersz. Shift zawsze wygrywa z Ctrl (nigdy nie wyśle przez pomyłkę).
   - Menu komend „/” i wzmianek „@” działa jak dotąd (Enter wybiera pozycję).
2. **Kroki agenta** (`appearance.agentSteps`): `show` otwiera szczegóły myślenia i wywołań w czacie, `collapse` zostawia zwinięte. **Zmiana domyślnej wartości `show` → `collapse`**: kroki w oknie zawsze były zwinięte, więc domyślna ma być dzisiejszym zachowaniem (BE-U ustawił ją błędnie na `show`). Nikt jeszcze nie miał zapisanej wartości z ekranu (nie było kontrolki), więc nikomu nic się nie zmienia.

## Notka dla UI/KK
Kontrolki wyglądu na ekranie „Settings” (`AppearanceSettings`, dziś tylko motyw): lista „Send message with” (Enter / Ctrl+Enter) i przełącznik „Show agent steps open” podpinają się do `window.openbot.appSettings.update({ appearance: { sendShortcut | agentSteps } })`. Zmiana działa od razu po zapisie (`applyAppearanceDom` ustawia `data-send-shortcut` i `data-agent-steps` na `<html>`); już otwarte rozwinięcia kroków nie zmieniają się, nowe tak.

## Testy (po jednym pliku)
`send-shortcut.test` 3/3 (nowy), `ComposerEditor.test` 15/15 (nowy przypadek Ctrl+Enter), `AgentActivity.test` 5/5 (nowy: zwinięte domyślnie, otwarte po wyborze), `agent-settings.test` 15/15, `ipc-agent-settings.test` 12/12, `appearance.test` 2/2, `onboarding.test` 5/5. Zielone dopiero po zmianie (przed nią 3 testy były czerwone z właściwego powodu). Biome czysty, `typecheck:contracts` i `:renderer` EXIT 0.

## Luki
- `typecheck:node` jest CZERWONE od scalenia T-AG: `scripts/sandbox-next-probes.ts` (13 błędów TS, nie moje pliki; poprawka Testera T-AH-FIX w toku).
- **`unreadFirst` nadal bez efektu** (kolejność nieprzeczytanych w pasku bocznym): sortowanie agentów siedzi w układzie paska z folderami i ręczną kolejnością (`Sidebar`, `sidebarAgentStates`), więc to osobne zadanie (dopisane do kolejki jako pozycja 5).
- Nic nie sprawdzone w oknie (Electron czeka na GO).
