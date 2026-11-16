# Przegląd W8-BE1 + W8-KK2 vs spec (W8-01…08, W8-25…29)

**Stan: 16.11.2026. Autor: Tester (W8-T2).** Tylko czytanie kodu / raportów, **bez** uruchamiania programu i **bez** zmian w kodzie.  
**Baza:** `codex/cosgral-desktop` @ `3589a40df` → `team/tester/w8-t2`.  
**Źródła BE1:** `docs/cosgral-raporty/backend-w8-be1.md`; `packages/contracts/src/ipc-access.ts`; `src/backend/access-policy.ts`, `access-service.ts`, `access-store.ts`; wpięcia w `agent-service.ts`; testy `access-policy.test.ts`, `access-service.test.ts`, `agent-service-access.test.ts`.  
**Źródła KK2:** `docs/cosgral-raporty/kk-w8-kk2.md`; `packages/contracts/src/ipc-budgets.ts`; `src/backend/budget-meter.ts`; `src/main/budgets-ipc.ts`; testy `budget-meter.test.ts`, `ipc-budgets.test.ts`.  
**Spec:** `docs/cosgral/spec-w8.md` §2A / §2E + §7 (Q3, Q4, Q6, Q7, Q9, Q11). Lider zatwierdził decyzje BE1 (ścieżka nieznana → karta; Claude bez Always; `..` = nie da się sprawdzić).

## Na górze

- **BE1:** W8-01…07 + Q3/Q4/Q9 + podniesienie tylko kartą = **kod + testy** (atrapa CLI/Claude). Ściana jest tam, gdzie program jest pytany; na `full` Codex o nic nie prosi → wykluczone foldery **nie** są murem OS (W8-BE2).  
- **Obejścia:** `..` / względne / UNC / case Windows = obsłużone w normalizacji lub świadomie „nie da się sprawdzić”. **Brak:** realpath/junction, 8.3, `%ENV%` / ukryta ścieżka w powłoce, pełna egzekucja na `full` bez pytania CLI.  
- **KK2:** logika limitu/CSV/UTC/izolacji DB = **kod + testy**. **`agent-service.ts` bez `meter.record` / `meter.gate`** na tym HEAD → W8-26 w produkcie **nie egzekwuje** tur (raport KK2 §2; BE2 krok 1 w toku).  
- **W8-08** (grupy narzędzi): poza silnikiem poziomów; nie pokryte testami BE1 — **niejasne / regresja W3**.

**Legenda „Stan”:** `kod` · `test` · `brak` · `niejasne` · `UI` (okno).

---

## 1. Poziomy dostępu — W8-01…08

| ID | Kryterium (skrót) | Stan | Gdzie |
|---|---|---|---|
| W8-01 | Nowy agent = `working-folder` | **kod + test** | `DEFAULT_ACCESS_LEVEL` `ipc-access.ts:26–27`; `defaultAgentAccess` `:135+`; `createBot` → `agentCreated` `agent-service.ts:1281–1282`. Test szablon/kopia: `agent-service-access.test.ts` („template or copied… Q9”). |
| W8-02 | Zapis poza folderem w working-folder = odmowa | **kod + test**; E = **UI** | `accessDecision` write deny `ipc-access.ts:266–272`; `decideApproval` / sandbox `workspace-write` `access-policy.ts:67–86`, `:154–177`. Zdarzenie `access-denied` (kontrakt `:90–104`). Testy policy + service. |
| W8-03 | ask-first → karta; Deny zatrzymuje | **kod + test**; karta w oknie = **UI** | `accessDecision` ask `:265`; `decideApproval` ask-first test `access-policy.test.ts` (~86). Przepływ karty = istniejące approvals. |
| W8-04 | Podniesienie do full tylko kartą; widać w ustawieniach | **kod + test**; UI ustawień = **UI** | `setLevel` + `raiseRequested` `access-service.ts:84–100+`; `accessIsRaise` `ipc-access.ts:115–117`. Agent bez narzędzia zmiany: test `agent-service-access.test.ts` („no tool lets an agent…”). |
| W8-05 | Dodatkowe foldery; wykluczone także przy full (Q3) | **kod + test** | Excluded first: `accessDecision` `:255–260`; CLI roots bez excluded `access-policy.ts:69–70`. Test full+excluded: `access-policy.test.ts:93–98`, `agent-service-access.test.ts` („excluded… at full… Always”). |
| W8-06 | Stan po restarcie | **kod + test**; E restart = **niejasne** | `AccessStore` → `agent-access.json` (raport BE1 §2); testy store. Electron restart nie uruchamiany. |
| W8-07 | Always allow nie obchodzi wykluczonych | **kod + test** | Deny excluded przed regułami Always (raport §2; test ask-first+Always `access-policy.test.ts:86–90`; service full+Always). |
| W8-08 | Wyłączone grupy narzędzi nadal odmawiają | **niejasne / poza BE1** | Brak testu w pakiecie access. Regresja W3 (`setTools` / agent settings) — nie weryfikowana w tym T2. |

### Decyzje §7 (Q3, Q4, Q9) + reguły zlecenia

| Decyzja | Stan | Gdzie |
|---|---|---|
| Q3 wykluczone też w `full` | **kod + test** | jak W8-05 |
| Q4 `full` ≠ Computer Use / kamera | **kod** (pominięcie w decyzji) | `decideApproval` else → allow dla screen/camera `access-policy.ts:173–175`; komentarz `access-service.ts:9`. Osobne zgody CU/media — nie wpięte w poziom. |
| Q9 import/szablon = working-folder | **kod + test** | jak W8-01 |
| Podniesienie tylko kartą; agent bez toola | **kod + test** | jak W8-04 |
| Subagent = poziom rodzica, nie więcej | **kod + test** | `#cliAccess` w runnerze; testy `agent-service-access.test.ts` („subagent gets exactly…”, „request… parent”). |

### Obejścia ścieżek (szukane w zleceniu)

| Wektor | Stan | Werdykt |
|---|---|---|
| Ścieżki względne | **kod + test** | `resolveAgainst` od workspace `access-policy.ts:215–218`; `toolPaths` `:222–240`; test `..\..\other` → absolut. |
| `..` w poleceniu | **kod + test** | `climbsOut` `:132–135`; poniżej full → pusta ścieżka / nie da się sprawdzić `:170–171` (odmowa WF / karta ask-first / allow full). |
| `..` w normalizacji ścieżki | **kod + test** | `normalizeAccessPath` rozwiązuje segmenty `ipc-access.ts:181–186`; climb ponad root → `null`. |
| UNC | **kod + test** | `UNC_PATH` / `commandPaths` `access-policy.ts:91–122`; normalize `//server/share/...` `ipc-access.test.ts:41`. |
| Wielkość liter (Windows) | **kod + test** | `toLowerCase` na częściach Windows `ipc-access.ts:178–188`. |
| Junction / symlink / realpath | **brak** | Porównanie stringów po normalize — **bez** `realpath`/`lstat`. Junction do folderu wykluczonego pod inną ścieżką może ominąć `pathIsInside`. |
| Skróty 8.3 (`PROGRA~1`) | **brak** | Brak rozwinięcia short name → ta sama luka co junction (inna forma tej samej ścieżki). |
| Zmienne środowiskowe (`%USERPROFILE%`, `$HOME`) | **brak** | Raport BE1 §5.3: tekst polecenia tylko pod pełne ścieżki; env nie rozwijane. |
| Polecenie bez znanej ścieżki | **kod** (świadome) | Na WF → zwykła karta, nie odmowa (decyzja lidera). Sandbox CLI = ściana, o ile CLI pyta. |
| Ukrycie ścieżki (`cd` + względne w następnym kroku) | **niejasne** | Jedno polecenie: `..` wykrywane; wielokrok / env — poza parserem. |
| `full` + zapis w excluded bez pytania CLI | **brak muru** | Raport §5.2: Codex na full nie prosi → program nie widzi. Adresat: **Backend W8-BE2**. |
| Odmowa vs karta | **kod + test** | excluded = zawsze deny; outside WF = deny; ask-first outside = ask; unknown path WF write = deny / else ask (`accessDecision` `:244–272`). |

---

## 2. Budżety — W8-25…29

| ID | Kryterium (skrót) | Stan | Gdzie |
|---|---|---|---|
| W8-25 | Budżet per agent / przestrzeń zapisuje się | **kod + test**; UI = **UI** | `BudgetMeter.set` / tabele w DB przestrzeni `budget-meter.ts:7–11`, `:103+`. IPC `window.openbot.budgets`. Testy meter + ipc. |
| W8-26 | Po limicie twardy stop **nowych** tur | **kod + test** w meterze; **brak wpięcia** w `AgentService` | `evaluateBudget` → `blocked` gdy exhausted∧hardStop `ipc-budgets.ts:205`; `gate` `budget-meter.ts:163–167`. Grep `meter.` / `BudgetMeter` w `agent-service.ts` = **0**. Tura w toku: bramka tylko przed startem (design) — **nie sprawdzone** na prawdziwym drain. |
| W8-27 | Router tańszy model nie łamie zgód / W5 | **kod + test** (pure); **brak wywołania** w silniku tur | `preferredModel` tylko spośród `allowed` `ipc-budgets.ts:213–224`; `meter.preferred` `:171–176`. Raport KK2: silnik jeszcze nie woła. |
| W8-28 | CSV bez sekretów / bezpieczny | **kod + test** | Kolumny stałe `BUDGET_CSV_HEADER` `:234`; `csvCell` prefix `[=+\-@\t\r]` → `'` `:226–231`. Test: brak ścieżek/password w CSV `budget-meter.test.ts:209–222`. Zapis pliku = UI. |
| W8-29 | Brak cen → nie zmyślać USD | **kod + test** | `record`: dolary tylko gdy `costUsd` finite≥0 `:142–157`; `costComplete` / `enforceable` `:185`, `:202–205`. `costUsd: null` nie dodaje mikrocentrów. |

### Q6 / Q7 / Q11 + pytania zlecenia

| Temat | Stan | Werdykt |
|---|---|---|
| Q6 tokeny + $ tylko z dostawcy | **kod + test** | jak W8-29; podpis „szacunek” = UI (lider OK). |
| Q7 najpierw polityka budżetu, potem W5 | **kod** (kolejność w kontrakcie); egzekucja = **brak** w silniku | `preferred` nie dodaje modelu/konta. |
| Q11 funkcja ≠ wygląd Paperclip | **kontrakt/mock** | Brak tablicy Paperclip w KK2 — OK dla T2. |
| Licznik nigdy nie zmyśla dolarów | **tak** (meter) | Null / NaN / ujemne tokeny odrzucane lub nie wyceniają. |
| Twardy stop nie przerywa tury w toku | **zamysł kodu** (`gate` przed startem) | Bez wpięcia w `#drainBot` — **niezaliczone E/J na AgentService**. |
| Budżet przestrzeni A ↛ B | **kod + test** | Osobna baza przestrzeni; test „two spaces…” `budget-meter.test.ts:225+`. |
| CSV formuły / dane wrażliwe | **kod + test** | jak W8-28; tylko id agenta / liczby / dzień. |
| Granica doby UTC | **kod + test** | `budgetDay` / `budgetPeriodDays` `ipc-budgets.ts:153–163` (UTC). |

---

## 3. Luki i błędy logiczne

| # | Problem | Adresat | Propozycja |
|---|---|---|---|
| L1 | **Junction / symlink / 8.3:** `pathIsInside` bez `realpath` — ta sama lokalizacja pod inną nazwą omija excluded. | Backend | Przed porównaniem: `fs.realpathSync.native` (lub równoważne) dla folderów listy i celu; test junction + short name na Windows. |
| L2 | **Env / ukryta ścieżka w powłoce** na WF: parser nie widzi `%VAR%`; decyzja „karta zamiast odmowy” zostawia lukę, jeśli CLI **nie** zapyta. | Backend | Zostawić (lider) + dokument; albo odmawiać poleceń z `%`/`$` poniżej full; docelowo W8-BE2. |
| L3 | **`full` + excluded bez pytania Codex:** egzekucja tylko gdy CLI/tool pyta — lukę potwierdza raport BE1. | Backend (W8-BE2) | Piaskownica procesu / Job; nie udawać, że Q3 zamyka dysk na full. |
| L4 | **W8-08** nie w BE1 — brak dowodu regresji grup narzędzi. | Backend / Tester | Osobny test: wyłączona grupa → odmowa wywołania (niezależnie od poziomu). |
| L5 | **Karta raise stale:** po zmianie zdania Allow starej karty nic nie zmienia (raport §5.5) — Needs you może mylić. | Backend + UI | Cofnij/expire pending raise przy nowym `setLevel`; UI: „anulowane”. |
| L6 | **Claude ask-first bez Always** (zatwierdzone) — UX różny od Codex. | UI / Backend | Opisać w UI; Always później jeśli Claude da hak. |
| L7 | **Budżet: brak `meter.record` / `meter.gate` w `agent-service.ts`** na `3589a40df`. | Backend (W8-BE2 krok 1) | Hooki z raportu KK2 §2 + testy AgentService: exhausted∧hardStop → kolejka stoi, tura w toku żyje. |
| L8 | **`preferredModel` nie wołany** przy wyborze modelu tury. | Backend | Wpiąć po gate; tylko lista dozwolona; test z atrapą W5. |
| L9 | **UI access + budgets** jeszcze nie w tym przeglądzie (W8-UI1 w toku). | UI | Ustawienia poziomu, `access-denied`, stany ok/warning/exhausted, CSV save. |
| L10 | Working-folder **read** poza grantem = allow w `accessDecision` (`:266`) — zwężenie odczytu tylko przez sandbox CLI / BE2. | Backend | Świadome; nie fail Q; dopisać w kontrakcie dla UI („odczyt szeroki do BE2”). |

**Nie uznaję za bug:** decyzje lidera (1)–(3) z BE1; UTC dla okresów; CSV bez nazw; osobne bazy przestrzeni; Q4 pominięcie screen/camera w poziomie.

---

## 4. Czego nie da się ocenić bez UI i okna

1. Karta podniesienia poziomu w Needs you + wygląd ustawień agenta (W8-04 E).  
2. Widoczność `access-denied` / komunikatu odmowy (W8-02 E).  
3. Ask-first Allow/Deny w Electronie (W8-03 E).  
4. Restart programu → poziom i foldery wracają (W8-06 E).  
5. Ekran budżetów, warning/exhausted, zapis CSV z dialogu (W8-25…28 E).  
6. Czy po wpięciu gate kolejka i komunikat `reason` są czytelne dla osoby.  
7. Prawdziwy Codex `workspaceWrite` / Claude `canUseTool` (raport BE1 §8).  
8. Junction / 8.3 na żywym NTFS poza unitami stringowymi.

---

## 5. Czego nie sprawdziłem (T2)

1. Uruchomienia Electrona, e2e, pełnego `bun run test` / `check`.  
2. Gałęzi `team/backend/w8-be2` (hooki budżetu mogą dojść po tym SHA — na integracji `3589a40df` ich **nie ma**).  
3. Każdej ścieżki `inspect*` w `agent-service.ts` poza grepem i testami access.  
4. W8-08 (grupy narzędzi) end-to-end.  
5. Prawdziwego CLI, AppContainer, G5.  
6. UI W8-UI1 / Storybook budżetów i poziomów.

---

## Commity

Gałąź `team/tester/w8-t2` — SHA w `channel_result`.
