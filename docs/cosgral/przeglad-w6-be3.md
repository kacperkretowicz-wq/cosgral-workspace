# Przegląd W6-BE3: plan i akcje vs spec-w6 (W17–W22, W29–W35)

**Stan: 16.11.2026. Autor: Tester (W6-T3).** Tylko czytanie kodu / raportów, **bez** uruchamiania programu i **bez** zmian w kodzie.  
**Integracja:** `codex/cosgral-desktop` @ `61799a63c` (zadanie wymieniało `26cb21f48`; przegląd na aktualnym HEAD z BE3 scalonym).  
**Źródła:** `docs/cosgral/spec-w6.md` §2C/§2E + §7; `docs/cosgral-raporty/backend-w6-be3.md`; `packages/contracts/src/ipc-plan.ts`, `ipc-message-actions.ts`; `src/backend/plan-cards.ts`, `plan-store.ts`, `agent-service.ts` (akcje), `mobile-policy.ts`; testy `plan-cards.test.ts`, `agent-service-message-actions.test.ts`, `agent-service-plans.test.ts`.

## Na górze

- **Werdykt:** silnik BE3 **pokrywa** rdzeń W17–W22 i W30–W35 zgodnie z §7 (Q8–Q9, Q12–Q14) i z decyzjami Backendu potwierdzonymi przez lidera (telefon bez planu; akcje historii tylko w widocznym wątku; jeden otwarty plan).  
- **W29 (kopiuj)** = tylko UI; **W32 (rozgałęź)** = BE1 `threads.branch`, nie BE3.  
- **Luki:** brak wymuszenia planu na modelu (świadome Q8); otwarty plan po restarcie → `expired`/`stopped` (nie wisi); załączniki w tekście po edycji; UI karty/menu = poza silnikiem.  
- **Subagenci W23–W28:** poza BE3 (osobne W6-BE4) — tu nie oceniane.

**Legenda kolumny „Stan”:** `kod` = zachowanie w silniku/kontrakcie z plik:linia · `test` = pokryte testem jednostkowym · `brak` · `niejasne` · `UI` = wymaga okna.

---

## 1. Tabela kryteriów

### Plan — W17–W22

| ID | Kryterium (skrót) | Stan | Gdzie |
|---|---|---|---|
| W17 | Karta planu w Needs you przed długim zadaniem (≥2 kroki) | **kod + niejasne E** | Propozycja: `plan-cards.ts:62–98` (`propose`). Needs you: `listPending` `plan-cards.ts:160–167`. Reguła „kiedy obowiązkowy”: `ipc-plan.ts:136–138` `planRequired` + komentarz Q8 (`ipc-plan.ts:12–14`) — silnik **nie** wymusza na modelu (jak §7 Q8 / raport BE3). Czy atrapa w oknie zawsze woła `propose_plan`: **niejasne bez E**. |
| W18 | Approve → kroki; widać postęp | **kod + test**; postęp UI = **UI** | `respond` approve: `plan-cards.ts:134–151`. Postęp kroków: `update` `plan-cards.ts:101–130`, `planProgress` `ipc-plan.ts:141–151`. Test: `plan-cards.test.ts` „update_plan moves steps…”. Widoczność w oknie: brak UI karty. |
| W19 | Reject → zero skutków kroków | **kod + test** | Reject: `plan-cards.ts:139–140` + instrukcja `INSTRUCTIONS.reject` (`plan-cards.ts:46–51`). `update` na nie-`approved` odmawia (`plan-cards.ts:108–113`). Test reject w `plan-cards.test.ts`. |
| W20 | Stop w trakcie planu kończy; brak wiszącego Thinking | **kod**; pełne E = **niejasne** | Koniec tury: `expireTurn` `plan-cards.ts:175–179` → proposed=`expired`, approved=`stopped` (`#close` `:202–209`). Wywołanie z tury: `agent-service.ts:3334`. Zamknięcie programu: `expireAll` (`agent-service.ts:1326`, `1809`). Czy Stop zawsze kończy turę bez wiszącego Thinking: zależność od istniejącego Stop W4 — **nie uruchamiane**. |
| W21 | Plan związany z wątkiem / przeżycie przełączenia | **kod** | `AgentPlan.threadId` przy create (`plan-cards.ts:82–83`). Jeden otwarty plan na wątek (`plan-cards.ts:69–77`). Needs you per wątek (raport BE3 §4). Przełączenie wątku w UI + czy karta zostaje w zbiorczym Needs you: **UI / E**. |
| W22 | Pusty plan = walidacja, nie start | **kod + test** | `planProblem` `ipc-plan.ts:104–118`; `propose` rzuca (`plan-cards.ts:65–66`). Test pusty/blank/21 kroków: `plan-cards.test.ts` ~140–152. |

### Akcje — W29–W35

| ID | Kryterium (skrót) | Stan | Gdzie |
|---|---|---|---|
| W29 | Kopiuj → schowek | **brak w BE3** (tylko UI) | Kontrakt: `ipc-message-actions.ts:3–4`. Brak API silnika — OK wg specu „E / UI”. |
| W30 | Ponów → nowa odpowiedź; stara zostaje (Q12) | **kod + test** | `retryMessage` `agent-service.ts:3599–3612`; `regenerationOf` w `#sendAgain` `:3695`. Test Q12: `agent-service-message-actions.test.ts:121–137`. |
| W31 | Edytuj + confirm; unieważnij poniżej (Q13) | **kod + test** | `editMessage` `agent-service.ts:3619–3631`; `editNeedsConfirmation` `ipc-message-actions.ts:133–135`. Test: `agent-service-message-actions.test.ts:194–217`. Ostatnia wiadomość bez confirm: test `:224`. |
| W32 | Rozgałęź = nowy wątek (Q14) | **kod BE1**, nie BE3 | Kontrakt wskazuje `threads.branch` (`ipc-message-actions.ts:5`). BE3 nie reimplementuje. |
| W33 | Usuń po confirm; znika z kontekstu modelu | **kod + test** | `deleteMessage` `agent-service.ts:3635–3639`; `#removeMessages` `:3711+` (CLI thread retire). Test: `agent-service-message-actions.test.ts:151–181`. |
| W34 | Pin/unpin przeżywa restart | **kod + test** | `pinMessage` `agent-service.ts:3579–3590`; magazyn pinów (raport: `projection_message_pins`). Test pin+restart w `agent-service-message-actions.test.ts` (nagłówek pliku). |
| W35 | Przy busy: odmowa retry/edit/delete; kolejka nietknięta | **kod + test** | `threadBusyProblem` `ipc-message-actions.ts:126–129`; `#historyTarget` `agent-service.ts:3650–3656`. Pin omija busy (`messageActionProblem` pin → null). Test busy: `agent-service-message-actions.test.ts:249–253`. |

### Decyzje §7 / BE3 (potwierdzone liderem w zleceniu W6-BE4)

| Decyzja | Stan | Gdzie |
|---|---|---|
| Q8 planRequired w kontrakcie, bez twardego force na modelu | **kod** | `ipc-plan.ts:136–138`, komentarz `:12–14` |
| Q9 tylko Approve/Reject | **kod** | `PLAN_DECISIONS` `ipc-plan.ts:41–42`; `respond` `:134–151` |
| Q12 regeneracja dodaje | **kod + test** | jak W30 |
| Q13 confirm + obcięcie historii | **kod + test** | jak W31 |
| Q14 branch = nowy wątek | **BE1** | jak W32 |
| Telefon nie zatwierdza planów | **kod** | `mobile-policy.ts:26–28` (`answerOn` computer) |
| Retry/edit/delete tylko widoczny wątek | **kod + test** | `agent-service.ts:3647–3648`; test `/Select that thread/` |
| Jeden otwarty plan na wątek | **kod + test** | `plan-cards.ts:69–77`; test „allows one open plan…” |

---

## 2. Luki i ryzyka logiczne → propozycja dla Backendu

| # | Problem | Dotyka | Propozycja |
|---|---|---|---|
| L1 | **W17:** model może w ogóle nie wywołać `propose_plan` (Q8 świadome). Odbiór E zależy od atrapy narzędziowej / instrukcji. | W17, G3 | W acceptance: wymusić atrapę CLI, która zawsze woła `propose_plan` przy wielokroku. Nie zmieniać Q8. Opcjonalnie później: miękki hint w UI gdy `planRequired` i agent startuje narzędzia efektowe bez planu (osobne zadanie). |
| L2 | **Restart:** otwarty plan (`proposed`/`approved`) → `expired`/`stopped` (`plan-cards.ts:194–199`). Komentarz w `ipc-plan.ts:9–10` sugeruje „plan zostaje po restarcie” — dotyczy **postępu zapisanych** planów, nie wiszącej karty. Ryzyko: użytkownik myśli, że Approve przeżyje restart. | W18, UX | Doprecyzować kontrakt/UI: „otwarta karta nie wraca po restarcie; historia planu w `list` zostaje ze stanem expired/stopped”. Bez zmiany zachowania, chyba że lider chce wznawianie approved. |
| L3 | **Załączniki w treści** po edycji nie są ponownie linkowane (raport BE3 §7). Pliki idą z `#sendAgain`, tekstowe odwołania mogą wisieć. | W31 | BE: po edycji przepisać ID załączników w tekście **albo** jasny warning w wyniku `edit`. Test jednostkowy na jednej ścieżce. |
| L4 | **Dziennik zdarzeń** trzyma usunięty tekst w starych snapshotach do skasowania wątku (raport BE3). | W33, prywatność | Zaakceptować (odtwarzanie sesji CLI) **albo** redakcja w projection events przy delete — osobna decyzja lidera; nie blokuje W33 jeśli model nie widzi tekstu (CLI retire jest). |
| L5 | **W20 Stop:** `expireTurn` wiąże się z końcem tury; brak osobnego testu „Stop → plan stopped + brak Thinking” w `agent-service-plans.test.ts` (tylko expire w `plan-cards.test.ts`). | W20 | Dodać test integracyjny na fałszywym CLI: approve → Stop → phase `stopped`, agent idle. |
| L6 | **Pin na innym wątku** dozwolony po `threadId`, a retry/edit/delete nie (`agent-service.ts:3579` vs `3647`). Spójne z raportem, ale UI może mylić. | W34 | W kontrakcie/UI: pin = dowolny wątek; historia = tylko aktywny. Jedna linia w docs dla UI. |
| L7 | **W18 „widać postęp”:** silnik emituje `plan-changed`; bez UI karty kryterium E niezaliczalne. | W18 | Nie bug BE; zablokowane na UI planu (zlecone po UI1-FIX). |
| L8 | **Edycja = nowe id** (`edited: true`), stare id w `removedMessageIds`. Pin na starej wiadomości znika z `#removeMessages`. | W31/W34 | OK; UI nie powinno trzymać starego id. Test pin→edit już warto mieć, jeśli brak. |

**Nie uznaję za bug:** brak force planu (Q8); telefon computer-only (lider OK); jeden plan na wątek; busy odmowa (W35).

---

## 3. Czego nie da się ocenić bez UI i okna

1. Karta planu w Needs you / sticky Decision (wygląd, Approve/Reject klik).  
2. Menu wiadomości: Ponów / Edytuj / Usuń / Przypnij / Kopiuj / Rozgałęź.  
3. W21: przełączenie wątku z otwartą kartą planu w zbiorczym Needs you.  
4. W20: Stop w Electronie (brak wiszącego Thinking).  
5. W29 schowek systemowy.  
6. W32 UX branch w menu wiadomości.  
7. Synchro osobnego okna (W36–W38) z pinami/planem.  
8. Prawdziwy Codex/Claude z `propose_plan` / MCP Claude.  
9. Regresja P07 / pełny acceptance W6 (`odbior-w6.md`).

---

## 4. Czego nie sprawdziłem (T3)

1. Uruchomienia Electrona, `sandbox:e2e`, `bun run test`.  
2. Pełnego `agent-service.ts` poza sekcjami planu/akcji (grep + odczyt ~3575–3730 i wywołań expire).  
3. Każdej linii `mailbox-store` przy `#removeMessages`.  
4. BE4 subagentów (poza zakresem).  
5. Czy `developerInstructions` faktycznie wkleja tekst `planRequired` do promptu (założenie z raportu BE3 — nie weryfikowałem stringa w `agent-service` w tym T3).

---

## Commity

Gałąź `team/tester/w6-t3` — SHA w wyniku kanału.
