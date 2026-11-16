# Przegląd W8-BE2 + W8-KK3 vs spec (W8-09…14, W8-15…19, W8-25…29)

**Stan: 16.11.2026. Autor: Tester (W8-T3).** Tylko czytanie kodu / raportów, **bez** uruchamiania programu i **bez** zmian w kodzie.  
**Baza:** `codex/cosgral-desktop` @ `64027856a` → `team/tester/w8-t3`.  
**Źródła BE2:** `docs/cosgral-raporty/backend-w8-be2.md`; `packages/contracts/src/ipc-isolation.ts`; `src/backend/isolation-service.ts`, `isolation-host.ts`, `isolation-host-source.ts`; budżety w `agent-service.ts` + `budget-thread-totals.ts` + `budget-meter.ts`; `access-service.ts` (Q2); `scripts/isolation-escape-check.ts`.  
**Źródła KK3:** `docs/cosgral-raporty/kk-w8-kk3.md`; `packages/contracts/src/ipc-browser-profiles.ts`; `src/backend/browser-profiles.ts`, `browser-host.ts`; `src/main/browser-profiles-ipc.ts`, `main/index.ts` (clear).  
**Spec:** `docs/cosgral/spec-w8.md` §2B / §2C / §2E. Poprzedni T2: `przeglad-w8-be1-kk2.md` (W8-26 wtedy **bez** wpięcia — tu sprawdzone ponownie).

## Na górze

- **Izolacja:** Job Object + host C# = **kod + testy** (atrapy/`cmd.exe`). AppContainer w hoście jest, **nie** owija prawdziwych CLI. Codex = `shared-process`. Q2 odmowa dysku poniżej Full przy `unavailable` = **kod**. G5 skrypt istnieje; wynik PASS na maszynie Backendu = atrapy, nie CLI (W8-14).
- **Budżety w silniku:** `meter.gate` przed turą + `meter.record` po turze + `heldReason` = **kod + test** (`agent-service-budgets.test.ts`). W8-27 (`preferred`) nadal **bez** wywołania w silniku.
- **Profile przeglądarki:** osobna partycja per agent+przestrzeń, block/allow, clear jednej partycji = **kod + test** jednostkowy. Electron cookie-split i prawdziwe redirecty = **nie sprawdzone** (raport KK3 §5). **Luka:** wątek bez właściciela → wspólny profil.

**Legenda „Stan”:** `kod` · `test` · `brak` · `niejasne` · `UI` (okno).

---

## 1. Izolacja — W8-09…14

| ID | Kryterium (skrót) | Stan | Gdzie |
|---|---|---|---|
| W8-09 | CLI/ACP/MCP startują w izolacji, gdy dostępna | **częściowo kod** | Claude: `wrapFor` → Job Object `isolation-service.ts:252–258`; starter `isolation-host.ts` + `claude-client` (`useProcessWrap`). Codex: `shared-process` `ipc-isolation.ts:145–154`. MCP/ACP: **nie** owinięte hostem. AppContainer wokół agentów: **brak** (raport BE2 §5.1). |
| W8-10 | Zapis poza grantem z procesu = blokada | **kod + test** tylko dla AppContainer atrap | Host grants + skrypt G5 (`isolation-escape-check.ts`). Job Object **nie** jest ścianą plików (raport §5.3). Prawdziwy CLI: **brak** (W8-14). |
| W8-11 | Brak izolacji → `unavailable` / odmowa, nie cichy full disk (Q2) | **kod + test** | `probeIsolation` fail → `unavailable` `isolation-service.ts:44–66`; `refusal` `:261–268`; `access-service.ts:157`, `:232` (`isolation-unavailable`). Full: bez odmowy Q2 (`isolationRefusesDiskTools`). |
| W8-12 | Test ucieczki G5 zielony | **skrypt + raport PASS atrap**; E właściciel | `scripts/isolation-escape-check.ts`; instrukcja: `docs/cosgral/odbior-g5.md`. Nie uruchamiany w T3. |
| W8-13 | Brak obejścia UAC przez program | **niejasne / R** | Host bez elevacji; brak testu UAC w pakiecie. Tylko właściciel. |
| W8-14 | Prawdziwy CLI w izolacji nie czyta cudzego folderu | **brak** | Raport BE2 §5.1 / §6: CLI w AppContainer nie włączone. |

### Obejścia / scenariusze zlecenia (izolacja)

| Wektor | Stan | Werdykt |
|---|---|---|
| Host się nie skompiluje (`csc` brak / błąd) | **kod** | `probeIsolation` → `none` z powodem (`isolation-service.ts:57–66`); stan `unavailable`; Q2. |
| Antywirus blokuje `.exe` | **kod** (ścieżka błędu); E = **niejasne** | Ten sam catch przy build/probe → `unavailable`. Nie odtworzone z AV. |
| Proces potomny ucieka z Job Object | **częściowo kod** | Brak `BREAKAWAY_OK` w limitach (`isolation-host-source.ts:212–214`); assign przed `ResumeThread` `:273–280`. **Brak** testu celowego `CREATE_BREAKAWAY_FROM_JOB` / out-of-proc COM. |
| Limit 512 procesów | **kod + test** (mały drzewo) | `ISOLATION_MAX_PROCESSES = 512` `ipc-isolation.ts:27`, `:162`; G5/host testy z niskim capem. Duży build: **nie** (raport §5.4). |
| Zamknięcie programu w trakcie tury | **niejasne** | `KILL_ON_JOB_CLOSE` przy zamknięciu hosta (`isolation-host-source.ts:288`). Electron kill całej aplikacji + Job: nie sprawdzone E. Budżet: `#budgetPending` w RAM ginie; totals wątku w DB zostają. |
| AppContainer nie owija agentów | **brak (świadome)** | Host potrafi; starty CLI bez `--appcontainer` (raport §5.1). Adresat: **Backend**. |

---

## 2. Budżety w silniku — W8-25…29 (po BE2 kroku 1)

| ID | Kryterium (skrót) | Stan | Gdzie |
|---|---|---|---|
| W8-25 | Budżet per agent / przestrzeń zapisuje się | **kod + test**; UI = **UI** | Jak T2: `BudgetMeter` + DB przestrzeni. BE2 nie zmienia magazynu. |
| W8-26 | Po limicie twardy stop **nowych** tur | **kod + test** (AgentService) | `#holdForBudget` → `meter.gate` `agent-service.ts:2476–2519`; `heldReason` na snapshot `:1638–1639`. Tura w toku nie przerywana (test budgets). Odblokowanie: `budgetsChanged` + timer 60 s `:2514–2517`. |
| W8-27 | Router tańszy model | **kod pure**; **brak** w silniku tur | Raport BE2 §1.5: `meter.preferred` celowo niepodpięte. |
| W8-28 | CSV bez sekretów | **kod + test** | Bez zmian vs T2 / KK2. |
| W8-29 | Brak cen → nie zmyślać USD | **kod + test** | `#recordBudgetTurn` zawsze `costUsd: null` `agent-service.ts:3217–3221`. |

### Scenariusze zlecenia (budżety)

| Wektor | Stan | Werdykt |
|---|---|---|
| Podwójne liczenie przy wznowieniu | **kod + test** | `PersistentUsageTracker` + `baseline` `budget-thread-totals.ts`; `UsageDeltaTracker` `budget-meter.ts:300–318`; test baseline w `budget-meter.test.ts:255–256`. |
| Granica doby UTC | **kod + test** | `budgetDay` / `budgetPeriodDays` UTC `ipc-budgets.ts:153–163`; test `:44–57`. Odblokowanie bez zdarzenia: timer 60 s gdy hold (`agent-service.ts:2514–2517`). |
| Wiadomość wstrzymana a restart | **częściowo** | `#budgetHolds` tylko w RAM — po restarcie znika napis, ale wiadomość zostaje `queued` i `gate` znów trzyma przy drain. **Brak** testu „restart z held”. |
| Zamknięcie w trakcie tury (tokeny) | **niejasne** | Pending w `#budgetPending` nie zapisany do meter; totals wątku w DB OK. Ryzyko: utrata przyrostu niedomkniętej tury (niedoliczenie, nie podwójne). |

---

## 3. Profile przeglądarki — W8-15…19

| ID | Kryterium (skrót) | Stan | Gdzie |
|---|---|---|---|
| W8-15 | Dwa profile = dwie sesje bez mieszania cookies | **kod + test** (nazwy partycji); E Electron = **niejasne** | `profilePartition` `browser-profiles.ts:35–37`; `#sessionFor` `fromPartition` `browser-host.ts:471–484`. Testy różne partycje. **Nie** sprawdzone: realne cookies A≠B w Electronie. |
| W8-16 | Proxy per profil | **brak** | Raport KK3 §5.4: poza zleceniem. |
| W8-17 | Nowe akcje przeglądarki | **brak** | Jak wyżej. |
| W8-18 | Przejęcie; brak czytania plików auth | **kod** (zamysł); E = **niejasne** | Profil nie czyta plików haseł (raport §2). Przejęcie = istniejący flow; nie testowane E. |
| W8-19 | Dwa konta Meta Ads | **brak / R** | Tylko właściciel. |

### Pytania zlecenia (profile)

| Temat | Stan | Werdykt |
|---|---|---|
| Ciasteczka A ↛ B ani wspólny profil | **kod** (izolacja partycji); E = **niejasne** | Osobny `persist:cosgral-…`; wspólny tylko gdy `ownerBotId === null` (`browser-host.ts:471–473`). Agent nie dziedziczy wspólnego (raport §2). |
| Blokada domen: redirecty + subdomeny | **kod + test** (reguły); E redirect = **niejasne** | Subdomeny: `hostMatches` `ipc-browser-profiles.ts:152–156`. Block na każde żądanie `domainDecision` `:177–178`; `onBeforeRequest` cancel `browser-host.ts:478–481` (także redirect request). Allow tylko `mainFrame`/navigation. |
| Clear tylko jednej partycji | **kod + test** | IPC: `clearPartition(store.partitionOf(botId))` `browser-profiles-ipc.ts:51–52`; `main/index.ts:918–922` (`clearStorageData`/`clearCache`/`clearAuthCache` na tej sesji). Test IPC: tylko jedna. |
| Wątek bez agenta | **brak właściciela → wspólny** | `#ownerOf` bez `botId` i bez sesji CLI → `null` → shared (`browser-host.ts:465–467`). Raport KK3 §5.2. Adresat: **Backend** (`botId` w `handleDynamicTool`). |

---

## 4. Luki L1…

| ID | Luka | Propozycja | Adresat |
|---|---|---|---|
| L1 | AppContainer nie owija prawdziwych CLI / ACP / MCP | Lista grantów + włączenie `--appcontainer` w startach; G5 na CLI | Backend (+ właściciel W8-14) |
| L2 | Codex = jeden proces → brak izolacji per agent | Osobny proces Codex per agent/poziom **lub** świadomy podpis w UI | Backend / lider (architektura) |
| L3 | Job Object ≠ ściana plików; breakaway/COM nieprzetestowane | Test breakaway + dokument granic; mur plików = L1 | Backend |
| L4 | Limit 512 „z głowy” | Potwierdzić na prawdziwym buildzie / tuning | Backend |
| L5 | `meter.preferred` (W8-27) niepodpięte | Małe zadanie po definicji „prostej pracy” | Backend + lider |
| L6 | Claude nie dokłada tokenów do budżetu | Adapter / zdarzenie usage | Backend |
| L7 | Held po restarcie: brak testu; napis hold ginie z RAM | Test restart + ewentualnie persist hold reason | Backend |
| L8 | Wątek/kanał bez `botId` → wspólny profil przeglądarki | Przekazać `botId` do `browser.handleDynamicTool` | Backend (KK zgłosił; nie ruszać tylko KK) |
| L9 | Cookie-split / redirect cancel / clear w prawdziwym Electronie nieodebrane | Odbiór E: 2 agenty, 2 logowania, clear jednego (po GO) | KK / właściciel |
| L10 | W8-16 proxy, W8-17 akcje, W8-19 Meta | Osobne zadania | Backend / KK / właściciel |
| L11 | G5 PASS ≠ izolacja agentów w produkcie | `odbior-g5.md`: co skrypt nie dowodzi; W8-14 osobno | Właściciel + Tester |

---

## 5. Czego nie sprawdziłem

1. Uruchomienia programu, Electrona, `sandbox:e2e`, pełnego `check`, skryptu G5 na tej maszynie.  
2. Prawdziwego Claude/Codex w Job Object ani w AppContainer.  
3. Antywirusa blokującego host, Win11/Home, limitu 512 na dużym drzewie.  
4. Ucieczki Job Object (breakaway, WMI) poza limitem procesów w skrypcie.  
5. Restartu aplikacji z wiadomością `held` i zamknięcia w trakcie tury (tokeny).  
6. Prawdziwych cookies między partycjami, redirectów w Chromium, Meta Ads, proxy.  
7. UI izolacji / `heldReason` / profili (W8-UI2 w toku).  
8. Zmian po `64027856a` (np. fix testu shutdown Backendu) — baza zlecenia to ten SHA.
