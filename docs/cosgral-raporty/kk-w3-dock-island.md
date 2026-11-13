# W3-KK1: dok agentów i Dynamic Island (wiersze 37 i 38)

Gałąź `team/kk/w3-dock-island` (z `codex/cosgral-desktop` @ `5368cc9a5`), worktree `Shared\cosgral-wt\desktop-kk`.

**Stan: gotowe do scalenia.** 945/945 testów (było 913, dodałem 32), typecheck i biome czyste, build OK. Próba w piaskownicy z prawdziwym Electronem: 13/13 PASS, ze zrzutami.

## Plan (zrobiony)

Zachowanie 0.68 wziąłem z opisu w `parytet-0.68.md` (wiersze 37–38). Kodu nowszego niż a6fe240 nie czytałem. Spec W3 od Testera jeszcze nie istnieje, więc to, czego opis nie rozstrzyga, jest w sekcji „Decyzje do zatwierdzenia”.

| Krok | Co | Gdzie |
|---|---|---|
| 1 | Kontrakt: stan doku i wyspy, API okna, zdarzenia | `packages/contracts/src/ipc-dock.ts` |
| 2 | Magazyn ustawień doku i wyspy, zapis w pliku po restarcie | `src/backend/dock-store.ts` |
| 3 | Stan wyspy z kart Needs you i zdarzeń agentów (czysta logika) | `src/backend/island-tracker.ts` |
| 4 | Sterownik (cykl życia okien, zamknięcie głównego okna) bez Electrona | `src/main/dock-controller.ts` |
| 5 | Okna Electron doku i wyspy, IPC, walidacja wejść | `src/main/dock-windows.ts`, `src/main/dock-ipc.ts`, `src/main/ipc/dock-inputs.ts` |
| 6 | Preload: `window.openbot.dock`, `window.openbot.island` | `src/preload/dock-api.ts` |
| 7 | Minimalne widoki do dowodu (`#dock`, `#island`); właściwe ekrany robi UI | `src/renderer/src/dock/` |

Wspólne pliki zmieniłem minimalnie, bez przesuwania wcięć:
- `src/main/index.ts`: +28 linii (import, zmienna, rejestracja IPC, focus/closed głównego okna, przekazanie zdarzeń, start, zamknięcie, `openMainWindowFromDock`);
- `src/preload/index.ts`: +3;
- `src/renderer/src/index.tsx`: wybór widoku po `#dock` / `#island`.

`agent-service.ts` jest bez zmian.

## Jak działa

**Dok:** osobne okno bez ramki przy prawej krawędzi ekranu roboczego. Szerokość zależy od rozmiaru (`small` 280, `medium` 360, `large` 440 px), wysokość i pozycję może zmienić osoba, a dok je zapamiętuje.
- Przypięcie: najwyżej 8 agentów. Ponowne przypięcie przesuwa agenta.
- Kolejność: lista wszystkich przypiętych, każdy raz.
- Ukrycie: agent zostaje przypięty i zachowuje miejsce.
- Mini-czat: otwarty jest jeden naraz. Używa zwykłego API `agent` (`readConversation`, `sendMessage`, `onEvent`).
- Usunięty agent znika z doku.

Ustawienia są w `<userData>/dock.json`. Uszkodzony plik daje wartości domyślne, a poprawne pola zostają.

**Zamknięcie głównego okna:**
- Dok widoczny: program działa dalej w doku, który pokazuje „The main window is closed”. „Open COSGRAL” tworzy główne okno od nowa.
- Dok ukryty: program kończy się jak dotąd. Zamknięcie doku, gdy głównego okna nie ma, też kończy program.

**Wyspa:** okno 380×64 px u góry ekranu, zawsze na wierzchu, poza paskiem zadań. Pokazuje się tylko, gdy jest włączona i ma stan do pokazania.
- Najpilniejszy wygrywa: przejęcie przeglądarki > zatwierdzenie (też szkic do wysłania i prośba o Vault) > pytanie > błąd > nowa wiadomość > pracuje. Przy kilku kartach jednego rodzaju wygrywa najstarsza.
- Licznik pokazuje liczbę otwartych kart.
- Klik `island.activate()` pokazuje główne okno (tworzy je, gdy było zamknięte) i wysyła do niego `island-open-request {botId, request}`. `request` to ta karta Needs you (`kind`, `requestId`), czyli to samo, co zwraca `listPendingRequests()`.
- „Wiadomość” to nowa skończona odpowiedź agenta, gdy główne okno nie ma fokusu. Znika po kliknięciu, `dismiss()` albo fokusie głównego okna.
- „Błąd” to błąd z wiersza agenta. `dismiss()` go chowa, dopóki nie przyjdzie nowy błąd.

## Kontrakt dla UI

Plik `packages/contracts/src/ipc-dock.ts`, typy i opisy są w kodzie.

- `window.openbot.dock?` (opcjonalne, jak inne API W2/W3). Każde wywołanie zwraca cały nowy `DockState`:
  - `getState`
  - `pin({botId, index?})`
  - `unpin({botId})`
  - `reorder({botIds})`
  - `setPinHidden({botId, hidden})`
  - `setSize({size})`
  - `setVisible({visible})`
  - `openChat({botId|null})`
  - `showMainWindow({botId?, request?})` zwraca `void`.
- `DockState {visible, size, pins[{botId, hidden, pinnedAt}], openBotId, mainWindowOpen}`. Limity są w `DOCK_LIMITS` (`widths`, `pins: 8`).
- `window.openbot.island?` (każde wywołanie zwraca `IslandState`):
  - `getState`
  - `setEnabled({enabled})`
  - `activate()`
  - `dismiss()`
- `IslandState {enabled, status: {kind, botId, botName, summary (≤120 znaków), request, since} | null, waiting, working}`.
- Zdarzenia w `AgentEvent`, przychodzą do każdego okna:
  - `dock-changed {state}`
  - `island-changed {state}`
  - `island-open-request {botId, request}`: tylko główne okno ma otworzyć agenta i przewinąć do tej karty.

**Do zrobienia przez UI:**
1. W `App.tsx` obsługa `island-open-request` (otworzyć agenta, pokazać kartę). Dziś zdarzenie dochodzi, ale główne okno go nie używa.
2. Przełączniki w ustawieniach: „Pokaż dok” (`dock.setVisible`) i „Dynamic Island” (`island.setEnabled`).
3. „Przypnij do doku” w menu wiersza agenta.
4. Ekrany w miejsce minimalnych widoków `src/renderer/src/dock/` (system wizualny COSGRAL, impeccable).

## Dowody

**Testy jednostkowe (32 nowe):**
- `dock-store.test.ts` (11): domyślne wartości, przypinanie, limit, kolejność, ukrycie, restart, uszkodzony plik.
- `island-tracker.test.ts` (10): kolejność stanów, wiadomość, błąd, dismiss, activate, emitowanie tylko przy zmianie.
- `dock-controller.test.ts` (9): pozycja i rozmiar okna, zamknięcie głównego okna przy doku i bez niego, wyspa, klik, usunięci agenci.
- `dock-inputs.test.ts` (2): walidacja wejść.

**Pełny zestaw:** `bun run test` 136 plików, 945/945. `bun run typecheck` czysty (contracts, node, renderer, storybook, api). `biome check` na moich plikach czysty, `bun run build` OK.

**Piaskownica (prawdziwy Electron, Codex jako atrapa):**
- Skrypt `Shared\cosgral-data\desktop-kk\run-sandbox.ps1` + `dock-drive.mjs`, poza gitem, tak jak skrypty innych ról.
- Ma osobne USERPROFILE, APPDATA, LOCALAPPDATA i TEMP. DevTools działają tylko na loopback.
- Przebieg `evidence\w3-dock-island-2`: **13/13 PASS**, zamknięcie czyste, 0 procesów po wyjściu, prawdziwe dane „COSGRAL Workspace Dev” nietknięte („absent” przed i po).

| Sprawdzenie | Wynik |
|---|---|
| Kolejność, rozmiar L, otwarty czat, ukrycie i pokazanie przypiętego agenta | ✓ |
| Okno doku ma 440 px CSS (przy skali 1,5: 660 px fizycznych) | ✓ |
| Wiadomość z mini-czatu w doku i odpowiedź agenta w doku | ✓ |
| Karta potwierdzenia → wyspa „Approval / Ada / Confirm system cleanup”, okno 380×64 | ✓ |
| Prawdziwy klik myszą w wyspę → `island-open-request` z tą kartą w głównym oknie | ✓ |
| Odpowiedź na kartę → wyspa pusta | ✓ |
| Zamknięcie głównego okna → program działa w doku; „Open COSGRAL” wraca | ✓ |
| `dock.json` po zmianach (widoczny, L, 2 przypięci) | ✓ |

Zrzuty w `evidence\w3-dock-island-2`:
- `01-dock-mini-chat.png`: dok z dwoma agentami i mini-czatem;
- `02-island-approval.png`: wyspa ze stanem zatwierdzenia;
- `03-main-after-island-click.png`: główne okno po kliknięciu wyspy;
- `04-dock-main-window-closed.png`: dok przy zamkniętym głównym oknie.

## Decyzje do zatwierdzenia (lider)

1. **Zamknięcie głównego okna przy widocznym doku:** program działa dalej w doku. Przy ukrytym doku zamyka się jak dotąd.
2. **Kolejność stanów wyspy:** przejęcie > zatwierdzenie (też szkic i Vault) > pytanie > błąd > wiadomość > pracuje.
3. **Pusta wyspa się chowa** (okno ukryte), zamiast pokazywać pustą pigułkę.
4. **„Wiadomość”** liczy się tylko wtedy, gdy główne okno nie ma fokusu.
5. **Rozmiary doku** to 280, 360 i 440 px przy prawej krawędzi. Limit 8 przypiętych agentów.
6. **Dok i wyspa są tylko na tym komputerze** (serwer `local`). Zdalne serwery ich nie zasilają.
7. **Dok nie jest „zawsze na wierzchu”.** Wyspa jest.

## Czego nie sprawdziłem

- Wielu monitorów: wyspa idzie na ekran główny, dok na ekran, na którym stoi.
- macOS: kod nie jest pod niego dostosowany, a na tym komputerze nie było jak tego sprawdzić.
- Pracy z prawdziwym Codexem, bo była tylko atrapa.
- Widoku głównego okna po `island-open-request`, bo obsługę tego zdarzenia robi UI.
