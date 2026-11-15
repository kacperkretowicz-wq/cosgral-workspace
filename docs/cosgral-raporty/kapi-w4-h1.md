# Raport KAPI W4-H1: porządki pod bramkę G1

**Gałąź:** `team/kapi/w4-h1` (od integracji `29f0f512f`), worktree `desktop-kapi`
**Data:** 15.11.2026, ok. 19:15–20:15
**Zakres:** ścieżki prywatne w testach, błędy biome, martwy `ChannelTasksPanel`, plan próby instalatora.

## Werdykt

| Krok | Wynik |
|---|---|
| 1. Ścieżki prywatne | ✓ usunięte z 2 testów; skan całego repo czysty |
| 2. Biome | ✓ `bun run lint` (`biome check .`): **78 błędów + 1 ostrzeżenie → 0**, kod 0 |
| 3. Martwy komponent | ✓ `ChannelTasksPanel` usunięty (test, stories, mock, CSS) |
| 4. Instalator (lekka wersja) | plan + kontrola pliku bez uruchamiania; próba na czystym koncie czeka na właściciela |
| **Cel: `bun run check` zielony** | **✗ nie.** `check:ui` (pierwszy etap łańcucha) jest czerwony z powodów, których nie było na liście 78 błędów (niżej). Reszty łańcucha nie uruchamiałem |

## Bloker G1, którego nie było na liście: `check:ui`

`bun run check` to łańcuch: `check:ui` → `lint` → `typecheck` → `test` → `test:storybook` → `test:visual` → `test:api` → `test:browser` → `api:build` → `build-storybook` → `build`. Zatrzymuje się na pierwszym etapie.

`bun run check:ui` (`scripts/ui-foundation-check.ts`) zgłasza:
- **natywne kontrolki** (`<button>`, `<input>`, `<textarea>`, `<select>`) zamiast `components/ui` w **24 plikach, ok. 220 użyć**. Najwięcej: `WorkflowsPage` 29, `VaultPanel` 23, `RemoteDesktopPage` 17, `AgentSettingsW3` 16, `RoutinePanel` 15, `TablesPanel` 14, `DockApp` 12, `McpPanel` 12, `VoiceSettings` 10, `MarketplacePage` 9, `ActionCard` 9, `MemoryPanel` 8, `ChannelView` 7. Reszta po 1–5;
- budżety długu (każdy = 0): ręczne role ARIA **5** (`ChatTasksSwitch` tablist/tab, `alertdialog` w `MobileConnectPage` i `ProvidersPage`), literały kolorów w CSS **12**, nietokenizowane `font-size` **7**, `border-radius` **7**.

Baza (OpenBot 0.1.11) miała tu dług 0. Dług dodały ekrany W1–W3. To praca UI z kontrolą wyglądu (nie „bez zmiany zachowania”), więc jej nie zaczynałem: pasuje do W4-UI2 („przejrzeć strony pod gołym HTML”). Moja zmiana nic tu nie dodała (usunięty CSS miał tylko tokeny).

## Krok 1: ścieżki prywatne

- **Znalezione:** wpisana ścieżka z nazwą profilu Windows w dwóch testach: `src/backend/w2-t3-skills-mcp.acceptance.test.ts` i `src/backend/w2-t4-vault-routines.acceptance.test.ts`.
- **Poprawka:** piaskownica testu to teraz `mkdtemp` w folderze tymczasowym albo `COSGRAL_ACCEPTANCE_ROOT` (zmienna środowiskowa). Test przywraca `process.env` i kasuje folder po sobie (wcześniej zostawiał zmienione `USERPROFILE`, `APPDATA`, `TEMP` dla kolejnych testów w tym samym procesie).
- **Skan** (`git grep` po plikach śledzonych, bez `bun.lock`): nazwa profilu, e-mail, `C:\Users\<prawdziwa nazwa>`, wzorce kluczy (`ghp_`, `sk-`, `AIza`, klucze prywatne). Wynik: **0 trafień**. Pozostałe `C:\Users\…` i `AppData` w repo to wymyślone nazwy w testach (`me`, `tester`, `Jane Doe`, `First Last`) i zmienne środowiskowe piaskownic.
- Login właściciela GitHub w `package.json` i `electron-builder.yml` (`owner`, `repository`) zostaje: to adres publicznego repo.
- **Historia:** poprzednie commity (w tym `codex/cosgral-desktop` @ `29f0f512f` na GitHubie) nadal zawierają starą ścieżkę w tych dwóch plikach. Usunięcie z historii wymaga przepisania historii i `push --force`; **decyzja właściciela**, niczego nie przepisywałem.

## Krok 2: biome

- Start: `biome check .` → **78 błędów, 1 ostrzeżenie** w 669 plikach.
- **2a (bezpieczne poprawki, `biome check --write .`, bez `--unsafe`):** formatowanie i kolejność importów w 23 plikach. 78 → 42. Zero zmian zachowania.
- **2b (ręcznie), 42 błędy + 1 ostrzeżenie:**

| Reguła | Ile | Poprawka |
|---|---|---|
| `noNonNullAssertion` | 22 | zamiast `!`: strażnik z wyjątkiem (`McpSettings`, `SkillsSettings` przez `mcpApi()` / `skillsApi()` / `agentBotId()`, `MemoryPanel`, skrypt `w2-t2-memory-smoke.ts`) albo `requireApi()` w teście `W2Settings.test.tsx` |
| `noUnsafeTypeAssertion` | 5 | `as` zastąpione `isOneOf` (`McpPanel`) i `isMemoryInclusion` (`MemoryPanel`); w `ActionCards.stories.tsx` typowane pomocniki kart |
| `useButtonType` | 8 | `type="button"` w `ActionCard` |
| `plugin` (anty-slop) | 6 | `typeof x === "string"` → `isString`; `Record<string, unknown>` → `DynamicRecord` (skrypty smoke i dwa testy odbioru) |
| `noMisleadingReturnType` | 1 | `WebhookVerification.reason` to teraz unia `WebhookRejection` (3 teksty, które funkcja naprawdę zwraca) |
| `noDescendingSpecificity` (ostrzeżenie) | 1 | `cosgral.css`: bazowa reguła `.coming-soon` przeniesiona nad reguły rozmieszczenia siatki (brak wspólnych właściwości, wygląd bez zmian) |

- **Zachowanie:** brak zmian poza trzema przypadkami, gdzie wcześniej wyjątek rzucał `TypeError` na `!`, a teraz rzuca czytelny komunikat (`McpSettings`, `SkillsSettings`, skrypt memory-smoke). `WebhookVerification` jest węższy niż był, więc wszystkie dotychczasowe użycia kompilują się bez zmian.

## Krok 3: usunięte (martwy kod)

Sprawdzone: `App.tsx` renderuje `ChannelWorkspace` → `ChannelView`, który ma własną listę zadań i `ChatTasksSwitch`. `ChannelTasksPanel` był używany tylko w stories i we własnym teście.

Usunięto:
1. `src/renderer/src/components/ChannelTasksPanel.tsx`
2. `src/renderer/src/components/ChannelTasksPanel.test.tsx` (test przełącznika Chat | Tasks przeniesiony do nowego `ChatTasksSwitch.test.tsx`, dwa pozostałe testy dotyczyły usuniętego komponentu)
3. W `src/renderer/stories/BetterUx.stories.tsx`: pomocnik `ChannelShell` i dwie historie „C · Chat | Tasks” (jasna i ciemna), grupa nazywa się teraz „Better/Lepszy A+B”
4. W `src/renderer/src/channel-tasks.ts`: `MOCK_CHANNEL_TASKS`, lokalne `ChannelTask` / `ChannelTaskState` i `channelTaskStateLabel` (nikt ich już nie używał; zostaje typ `ChannelViewMode`, używany przez `ChatTasksSwitch`)
5. W `src/renderer/src/styles/conversation.css`: nieużywane reguły `.channel-tasks-panel`, `.channel-tasks-list`, `.channel-task-row`, `.channel-task-copy`, `.channel-task-actions`, `.channel-tasks-empty` (55 linii)

Raporty historyczne (`ui-b4-better.md`, `ui-w1-ui1.md`, `tester-h5-ui-electron.md`) nadal wspominają ten komponent: to zapis tamtego stanu, nie zmieniałem ich.

## Weryfikacja (komendy i wyniki)

| Komenda | Wynik |
|---|---|
| `bun run lint` | exit 0, „Checked 668 files, No fixes applied” |
| `bun run typecheck:node` | exit 0 |
| `bun run typecheck:renderer` | exit 0 |
| `bun run typecheck:storybook` | exit 0 |
| `bun run typecheck:contracts`, `typecheck:mobile-app`, `typecheck:api` | exit 0 |
| `bun run build` | exit 0 |
| `vitest`: `webhook-signature`, `routine-manager`, oba testy odbioru W2-T3/T4 | 4 pliki, 19 testów OK |
| `vitest`: `ActionCard`, `McpPanel`, `MemoryPanel`, `SkillsPanel`, `TablesPanel`, `W2Settings`, `W2Ui2`, `ChatTasksSwitch`, `StickyDecision`, `Sidebar.needs-you`, `ChannelView` | 11 plików, 19 testów OK |
| `vitest`: `App`, `HostPanel`, `central-auth-manager`, `development-profile`, `remote-desktop-protocol`, `reset-dev-state` (pliki przeformatowane przez biome) | 6 plików, 124 testy OK |
| `node --check` na 3 przeformatowanych skryptach `.mjs` | OK |
| **`bun run check`** | **exit 1** na pierwszym etapie `check:ui` (opis wyżej) |

Testy uruchamiałem po jednym poleceniu naraz (`--maxWorkers=2`), bez pełnego `bun run test`.

**Środowisko:** w `node_modules` tego worktree brakowało `qrcode-generator` (dodany w W3-BE5), więc `typecheck:node` wywalał się na `src/backend/mobile-qr.ts`. Naprawa: `bun install --frozen-lockfile --ignore-scripts` (doinstalował 1 pakiet, lockfile bez zmian). To problem lokalnego worktree, nie kodu.

## Krok 4 (W4-H2 lekka wersja): instalator

### Co sprawdziłem bez instalowania (nic nie uruchamiałem, rejestr i profil nietknięte)
- Plik: `COSGRAL Workspace-0.2.0-x64.exe` z `desktop-backend\dist`, 102,9 MB, SHA-256 `641D3C8D…A3A63847`. Podpis: **NotSigned**. Wersja i opis w właściwościach pliku poprawne (produkt „COSGRAL Workspace”, 0.2.0).
- Zawartość: rozpakowałem 7-Zipem z pamięci podręcznej electron-buildera do folderu tymczasowego (po porównaniu skasowanego): 81 plików, 470 MB po rozpakowaniu. `COSGRAL Workspace.exe`, `app.asar` i `app-update.yml` są **identyczne co do bajtu** z `win-unpacked`.
- Z logu budowy: `oneClick=true perMachine=false` → instalacja **per-użytkownik**, bez UAC.
- Instalator z `desktop-hydra\dist` ma inny hasz (inna kompilacja); do próby brać ten z Backendu.

### Dlaczego nie zainstalowałem
Instalator NSIS pisze do rejestru zwykłego profilu (`HKCU\...\Uninstall\…`, `HKCU\Software\Classes\cosgral`) oraz tworzy skróty w Menu Start i na pulpicie. Zmienne `USERPROFILE` / `APPDATA` tego nie przekierują (NSIS pyta system, nie środowisko). Izolacja wymaga osobnego konta Windows albo Windows Sandbox; oba wymagają uprawnień administratora, a Sandbox ≥ 4 GB RAM (mamy 1,3 GB). Zgodnie z poleceniem nie ruszałem zwykłego profilu.

### Zauważone rzeczy do decyzji
1. **„Po odinstalowaniu nic nie zostaje” nie będzie prawdą.** `electron-builder.yml` nie ma sekcji `nsis:`, więc działają domyślne: skróty na pulpicie i w menu, `deleteAppDataOnUninstall: false` (dane w `%APPDATA%\COSGRAL Workspace` zostają: baza, Vault, pamięć, skille). Rekomendacja: dane zostawiać, a w programie dodać „Usuń wszystkie moje dane” przed odinstalowaniem (do ustalenia z liderem).
2. **Aktualizacje:** `app-update.yml` wskazuje publiczne repo GitHub (`provider: github`), które nie ma wydań. Bez wydania nie da się sprawdzić ścieżki aktualizacji; do próby trzeba zbudować wersję 0.2.1 z `--config.publish.provider=generic --config.publish.url=http://127.0.0.1:<port>`.
3. **`latest.yml`** podaje plik `COSGRAL-Workspace-0.2.0-x64.exe` (myślniki), a artefakt lokalny ma spacje. Na GitHubie spacje i tak zamieniają się na myślniki, ale przy lokalnym serwerze aktualizacji plik trzeba nazwać z myślnikami.
4. Niepodpisany `.exe`: oczekiwane ostrzeżenie SmartScreen, możliwe blokowanie przez antywirusa.

### Plan próby na czystym koncie Windows (wykonuje właściciel albo lider po zgodzie)
Warunki: osobne konto lokalne (zwykły użytkownik) bez zainstalowanego OpenBota i COSGRAL; prawdziwy program właściciela zamknięty.

**A. Zdjęcie stanu przed:** `reg export` kluczy `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall`, `HKCU\Software\Classes\cosgral`, `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; lista plików (`Get-ChildItem -Recurse | Export-Clixml`) z `%LOCALAPPDATA%`, `%APPDATA%`, Menu Start, pulpitu.

| # | Co | Oczekiwany wynik |
|---|---|---|
| 1 | Instalacja (dwuklik, potem `/S` na drugim koncie) | ostrzeżenie SmartScreen (niepodpisany); brak UAC; instalacja w `%LOCALAPPDATA%\Programs\COSGRAL Workspace`; skrót w Menu Start i na pulpicie; wpis w „Aplikacje i funkcje”; klucz `cosgral://`; program startuje |
| 2 | Pierwszy start | onboarding; baza w `%APPDATA%\COSGRAL Workspace`; Codex/Claude „Not installed” bez awarii; drugi start = to samo okno (blokada instancji); `%APPDATA%\OpenBot` nietknięte |
| 3 | Dane testowe | wpisz agenta, pamięć, wpis w Vault (atrapa); zamknij |
| 4 | Aktualizacja 0.2.0 → 0.2.1 (lokalny serwer `http://127.0.0.1`, `latest.yml` + plik z myślnikami) | wykrycie, pobranie, sprawdzenie sha512, instalacja przy wyjściu; dane z kroku 3 nadal są; niepodpisana aktualizacja przyjęta (`verifyUpdateCodeSignature: false`) |
| 5 | Ponowna instalacja tej samej wersji na istniejących danych | dane całe |
| 6 | Odinstalowanie (Ustawienia → Aplikacje i plik `Uninstall…exe`) | znika folder programu, skróty, wpis w Aplikacjach, klucz `cosgral://` |
| 7 | Stan po odinstalowaniu vs zdjęcie z A | różnica ma zawierać **tylko**: `%APPDATA%\COSGRAL Workspace` (dane, celowo), `%LOCALAPPDATA%\cosgral-workspace-updater` (pamięć podręczna aktualizacji), pamięci podręczne Chromium. Cokolwiek innego = błąd instalatora |
| 8 | Odinstalowanie z działającym programem | instalator prosi o zamknięcie lub zamyka; brak „plik zajęty” |

Czas: ok. 45 min ręcznie, jeśli konto i kompilacja 0.2.1 są gotowe.

## Czego nie sprawdziłem

- **Pełnego `bun run check`**: łańcuch zatrzymuje się na `check:ui`; nie uruchamiałem etapów `test` (pełny), `test:storybook`, `test:visual`, `test:api`, `test:browser`, `api:build`, `build-storybook` (limit sprzętu: bez pełnego `bun run test`, po jednym ciężkim poleceniu). Nie wiem, czy któryś z nich jest czerwony.
- Wyglądu w prawdziwym oknie po zmianach (przeniesiona reguła `.coming-soon`, `type="button"`, usunięte reguły `.channel-task*`): kod i testy komponentów OK, zrzutu nie robiłem; `sandbox:e2e` nie uruchamiałem (RAM i pracujący równolegle Backend).
- Samego **instalatora w działaniu**: instalacji, aktualizacji i odinstalowania nie wykonałem (powód wyżej). Zachowanie odinstalatora (co zostaje) opieram na domyślnych ustawieniach electron-buildera, nie na próbie.
- Historii gita pod kątem starej ścieżki (sprawdziłem tylko wierzchołek `29f0f512f`: 2 pliki).
- Skanu plików binarnych i obrazów w repo pod kątem nazwy konta (skan objął pliki tekstowe).

## Commity na `team/kapi/w4-h1`

1. `72a00bf0d` krok 1: ścieżki prywatne
2. `794985700` krok 3: martwy `ChannelTasksPanel`
3. `f2b58bfaf` krok 2a: bezpieczne poprawki biome
4. `fbb16fadb` krok 2b: ręczne poprawki biome
5. (ten raport i wpis w `COSGRAL-CHANGES.md`: ostatni commit)
