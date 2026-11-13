# Raport KAPI K1: pasek agentów po scaleniu W1-UI2 (piaskownica)

**Gałąź:** `team/kapi/w1-check` (od integracji `341ae769b`)
**Worktree:** `Shared\cosgral-wt\desktop-kapi`
**Agent:** KAPI
**Data:** 13.11.2026, ok. 01:00–01:40
**Zakres:** sam test i ten raport. Kod programu bez zmian.

## Werdykt

**Wszystkie 5 sprawdzanych wierszy przechodzi (4, 5, 6, 7, 8).** Nie znalazłem błędów paska agentów.

Znany błąd z odbioru W1-T2 („po przeładowaniu okna UI gubi kartę i Needs you”) jest **naprawiony**. Po przeładowaniu karta pytania, sekcja Needs you i stan wiersza „Needs you” są nadal widoczne. Po odpowiedzi znikają.

Jedno ograniczenie: przeładowanie robiłem przez `location.reload()`, a nie fizycznym klawiszem Ctrl+R (szczegóły w sekcji „Nie sprawdzone”).

## Środowisko

| Element | Wartość |
|---|---|
| Build | `bun install` (pierwsza próba: EPERM w pamięci podręcznej bun dla `@kobalte/core`, druga próba OK), `bun run build` OK |
| Uruchomienie | `node_modules\electron\dist\electron.exe <worktree>` (wersja dev), bez instalatora `.exe` |
| USERPROFILE / APPDATA / LOCALAPPDATA / TEMP | `Shared\cosgral-data\desktop-kapi\sandbox-k1\home\...` |
| Zmienne `CLAUDE*`, `ANTHROPIC*`, `OPENAI*`, `CODEX*`, `OPENBOT*`, `COSGRAL*` | czyszczone. Ustawione jest tylko `OPENBOT_CODEX_PATH` na atrapę |
| Atrapa Codex | kopia `desktop-backend\stub-codex` w `desktop-kapi\stub-codex\Codex Stub\codex.cjs`, z trzema dodatkowymi słowami w wiadomości (niżej) |
| Sterowanie | CDP na loopback: `desktop-kapi\run-sandbox.ps1` + `kapi-drive.mjs` (kopie skryptów Testera z krokami UI: menu kontekstowe, okna folderów, odpowiedź na kartę, próbkowanie wiersza co 150 ms) |
| Prawdziwy Codex / Claude | **nieużywane** (Claude: `not-installed` w piaskownicy) |
| Profil `%APPDATA%\COSGRAL Workspace Dev` właściciela | nietknięty (`realDevUserDataBefore/After: absent` w każdym `summary.json`) |
| Dane zainstalowanego OpenBota, cudze worktree | nietknięte |

**Dodatki w kopii atrapy** (oryginał Backendu bez zmian):
- `SLOW`: odpowiedź po 8 s, żeby zobaczyć stan „pracuje”.
- `LIMIT`: atrapa zgłasza 100% zużycia z resetem za 120 s (`account/rateLimits/updated`, potem `account/rateLimits/read`). Po resecie zgłasza 10%.
- `FAIL`: powiadomienie `error` i tura ze statusem `failed`.
- `ASK ME` (było już wcześniej): karta pytania „Which plan should the stub use?”.

## Wyniki

Dowody leżą w `Shared\cosgral-data\desktop-kapi\evidence\k1\<przebieg>\`. W każdym folderze są `drive.log`, `cdp-drive-log.json`, `summary.json` i zrzuty PNG. W kolumnie „Dowód” podaję przebieg i nazwę zrzutu.

| Wiersz | Kroki | Wynik | Dowód |
|---|---|---|---|
| **6** Needs you, karta po przeładowaniu | Agent w otwartej rozmowie pisze `ASK ME please` → przychodzi karta → `location.reload()` → odpowiedź w UI (klik „Pro”, potem „Continue”) | ✓ Przed przeładowaniem: wiersz „Needs you”, sekcja **NEEDS YOU 1** z pytaniem, przypięta **Decision · Pinned** z kartą. Po przeładowaniu jest dokładnie to samo. Po odpowiedzi `pending = 0`, sekcja i karta znikają, a wiersz pokazuje „Responded” | `01-cards-states`: `04-card-open.png`, `05-after-reload.png`, `06-after-answer.png` |
| **6** Needs you, inna rozmowa | Agent A (w folderze) pisze `ASK ME from A` → przejście do agenta B → przeładowanie → klik w wiersz Needs you → odpowiedź „Basic” | ✓ Gdy otwarty jest B, karty w czacie nie ma, ale jest sekcja **NEEDS YOU 1** i wiersz A „Needs you”. Po przeładowaniu stan jest ten sam. Klik w Needs you otwiera A z kartą. Po odpowiedzi wszystko znika | `04b-needs-you-ctrlr`: `02-other-chat.png`, `03-after-ctrlr.png`, `04-opened-from-needs-you.png`, `05-answered.png` |
| **4** Foldery | UI: przycisk „New folder” → `Sales` → Create; prawy klik na Sales → „New subfolder” → `Leads`; prawy klik na agencie → „Move to…” → Leads; prawy klik na Sales → „Rename” → `Sales EU`; klik w folder (zwinięcie) | ✓ Wcięcia: Sales = poziom 0, Leads = 1, agent = 2. Liczniki pokazują „1 agent”. W oknie „Move to…” przy Top level jest napis „Current”. Po zmianie nazwy jest „Sales EU”. Po zwinięciu `aria-expanded=false`, a agent i Leads są schowani | `02-folders-ui`: `01-sales.png` … `05-collapsed.png`, `03a-move-dialog.png` |
| **4** Foldery po restarcie | Zamknięcie programu → nowy start → odczyt paska → klik w Sales EU | ✓ Po restarcie: Sales EU zwinięty, Leads w Sales EU, agent w Leads, `collapsed` zapisane w bazie. Po kliknięciu folder się rozwija i agent jest na poziomie 2 | `03-restart-folders`: `00-after-restart.png`, `01-expanded.png` |
| **5** „Pracuje” | `SLOW please` i próbkowanie wiersza co 150 ms przez 12 s | ✓ Po 234 ms backend i wiersz pokazują `working` / „Thinking”. Po 9 269 ms (odpowiedź po ok. 9 s) jest `idle` / „Responded” | `01-cards-states`: `08-slow-0.png`, `08-slow-1.png` |
| **8** Błąd | `FAIL now` i próbkowanie przez 4 s, potem zwykła wiadomość | ✓ Po 221 ms „Thinking”, po 687 ms **„Error · KAPI stub: simulated provider failure”** (czerwona linia pod nazwą i znaczek na awatarze). Po udanej turze błąd znika (`activity: idle`) | `01-cards-states`: `11-fail-0.png`, `11-fail-1.png`, `12-error.png`, `14-after-recover.png` |
| **7** Limit | `LIMIT now`, potem próbkowanie przez 140 s | ✓ Wiersz pokazuje **„Limit · resumes 01:23”**. `resetsAt` = 1794529417, czyli 00:23:37 UTC = 01:23 czasu lokalnego. Po upływie czasu backend sam przechodzi na `idle` (ok. 126 s), a UI aktualizuje się 300 ms później | `01-cards-states`: `16-limit.png`, `17-limit-reset-0..2.png`, `18-after-reset.png` |

**Zamykanie:** każdy z 5 udanych przebiegów zamknął się czysto (`close: clean`, 211–279 ms, `leftoverProcesses: 0`). Jeden przebieg (`04-needs-you-ctrlr`) przerwał mój skrypt, opis niżej. Po nim ręcznie zamknąłem 6 procesów piaskownicy (4× electron, cmd, node atrapy) i sprawdziłem, że zostało 0.

## Błędy

**Błędy programu w wierszach 4–8:** brak.

**Błąd w moich narzędziach (naprawiony, nie dotyczy programu):** w przebiegu `04-needs-you-ctrlr` sterownik padł na selektorze CSS z cudzysłowami. PowerShell 5.1 usuwa `"` z argumentów przekazywanych do `node.exe`. Przez `$ErrorActionPreference = "Stop"` skrypt startowy przerwał się przed zamknięciem programu, a procesy zostały otwarte.
- **Poprawka:** `run-sandbox.ps1` zawsze zamyka program, nawet gdy sterownik padnie. Kroki `clicksel` / `rclicksel` łapią błąd selektora. W krokach używam selektorów bez cudzysłowów.
- **Uwaga dla Testera:** jego `run-sandbox.ps1` ma ten sam układ (`Stop` + `2>&1` z `node.exe`), więc pad sterownika też zostawi tam otwarty program.

## Uwagi spoza zakresu (nie są błędami paska, do decyzji UI)

1. **Nieprzeczytana odpowiedź w otwartej rozmowie.** Gdy okno sterowane przez CDP nie ma fokusu systemu, odpowiedź w otwartej rozmowie jest liczona jako nieprzeczytana („1 new reply”, linia „NEW”). Zostaje tak też po restarcie. Prawdopodobnie to poprawne (okno bez fokusu), ale nie sprawdziłem tego z prawdziwym fokusem. Dowód: `01-cards-states/14-after-recover.png`, `02-folders-ui/00-start.png`.
2. **Komunikat błędu znika z historii czatu.** Po `FAIL` w czacie jest dymek „KAPI stub: simulated provider failure · Error”. Po kolejnych turach znika, a przy wiadomości użytkownika zostaje tylko „Failed”. Dowód: `12-error.png` kontra `16-limit.png`. Może to być zachowanie bazy (błąd jako komunikat chwilowy).
3. **Ucięta nazwa agenta w folderze.** Na poziomie 2 nazwa agenta z rolą jest ucinana („New ag…”) przy domyślnej szerokości paska. Dowód: `04b-needs-you-ctrlr/02-other-chat.png`.

## Nie sprawdzone

- **Fizyczny klawisz Ctrl+R.** Na Windows Ctrl+R obsługuje menu „View → Reload” (`role: "viewMenu"` w `src/main/index.ts`), które woła `webContents.reload()`. Klawisze wysłane przez CDP trafiają prosto do strony i omijają skróty menu systemu (krok `ctrlr`: `reloaded: false`). Nie sterowałem pulpitem, bo ten wątek tego nie pozwala. Przeładowanie strony (`location.reload()`) daje ten sam efekt w rendererze, więc wiersz 6 uważam za zaliczony. Fizyczny Ctrl+R może sprawdzić ktoś ręcznie.
- **Karta zatwierdzenia (approval) w Needs you.** Atrapa jej nie wysyła. Sprawdziłem tylko kartę pytania.
- **Limit i błąd z prawdziwym dostawcą.** Oba stany wymusiłem atrapą przez te same komunikaty, które wysyła Codex App Server (`account/rateLimits/*`, `error`, `turn/completed` ze statusem `failed`). Przy prawdziwym limicie konta mogą przyjść inne pola.
- **Usuwanie i duplikat folderu, przenoszenie folderu w UI.** Nie były w zadaniu. Duplikat sprawdził Tester w W1-T2 przez API.
- **Tryb wąski paska i serwery zdalne** (tam foldery są wyłączone).
- `bun run test` nie był uruchamiany, bo w kodzie nic nie zmieniałem.

## Pliki poza repo

`Shared\cosgral-data\desktop-kapi\`:
- `run-sandbox.ps1`, `kapi-drive.mjs`: skrypty (kopie skryptów Testera z poprawkami),
- `stub-codex\Codex Stub\`: kopia atrapy z `SLOW` / `LIMIT` / `FAIL`,
- `sandbox-k1\home\`: profil piaskownicy (2 agentów, foldery Sales EU > Leads),
- `evidence\k1\01-cards-states`, `02-folders-ui`, `03-restart-folders`, `04-needs-you-ctrlr` (przerwany), `04b-needs-you-ctrlr`,
- `logs\bun-install*.log`, `logs\bun-build*.log`.

W worktree zostały też ignorowane przez git `node_modules\` i `out\` (build). Program nie jest uruchomiony.
