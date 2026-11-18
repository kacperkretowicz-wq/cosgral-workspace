# KK W12 (KK-L): wersje przepływów, krok Prompt i krok Condition

Data: 18.11.2026. Gałąź `team/kk/w12-flows` (baza integracji 297d4c29a). Kontrakt, atrapa i silnik z testami jednostkowymi, bez Electrona. `agent-service.ts` nietknięty.

## Wynik w jednej linii

**Przepływ ma teraz wersje (lista, podgląd, przywracanie) oraz dwa nowe kroki: Prompt (stały tekst) i Condition (porównanie tekstu, droga Tak / Nie), z tym samym zachowaniem w programie i w atrapie.**

## 1. Notka dla UI (Workflows)

### Wersje (`window.openbot.workflows`, kontrakt `ipc-workflow-versions.ts`)

| Wywołanie | Co daje |
|---|---|
| `listVersions({workflowId})` | najnowsze pierwsze, do 20: `number`, `savedAt`, `reason` (created / edited / restored), `restoredFrom`, `name`, `steps`, `connections`, `summary` („1 trigger, 2 agent steps”), `current` |
| `getVersion({workflowId, version})` | ta sama wersja z grafem (`nodes`, `edges`): podgląd na płótnie |
| `restoreVersion({workflowId, version})` | przywraca graf; zwraca przepływ; zdarzenie `workflows-changed` |
| `diffWorkflowGraphs(from, to)`, `describeWorkflowDiff(diff)` (funkcje czyste) | „Added: Output. Changed: Write the brief. Connections changed.” albo „Only positions on the canvas changed.” |

Reguły: wersja 1 przy utworzeniu; każda zmiana grafu to nowa wersja; zmiana nazwy, wstrzymanie i ten sam graf nie tworzą wersji; przywrócenie jest sprawdzane jak zapis (agent lub kanał, którego nie ma, odrzuca z tym samym zdaniem) i staje się NOWĄ wersją z `restoredFrom` (można je cofnąć kolejnym przywróceniem); przepływ sprzed tej funkcji dostaje wersję 1 przy pierwszym wylistowaniu lub zmianie; otwarty przebieg zachowuje swój graf.

### Nowe kroki i drogi (`ipc-workflows.ts`, `ipc-workflow-editor.ts`)

1. `WORKFLOW_NODE_TYPES` ma teraz 6 wartości: dodane `prompt` i `condition`. `WORKFLOW_EDGE_KINDS` ma 5: dodane `yes` i `no`.
2. **Prompt:** `{type:"prompt", text}`. Wynik kroku to tekst z wypełnionymi szablonami (`{{input}}`, `{{previous}}`, `{{steps.id}}`), więc następny krok widzi go jako `{{previous}}`. Wyjście `next`.
3. **Condition:** `{type:"condition", subject, operator, value, caseSensitive}`. `subject` to tekst z szablonami (domyślnie `{{previous}}`), `value` to to, z czym się go porównuje. Operatory `WORKFLOW_CONDITION_OPERATORS`: contains, not-contains, equals, not-equals, starts-with, ends-with, is-empty, is-not-empty (dwa ostatnie bez wartości: `workflowOperatorNeedsValue`). Porównanie po przycięciu, wielkość liter bez znaczenia, chyba że `caseSensitive`.
4. **Drogi z warunku:** połączenia `yes` i `no` (po jednym, co najmniej jedno). Gdy odpowiedź nie ma połączenia, przebieg kończy się jako `done` na warunku; kroki nieodwiedzonej drogi dostają `skipped`.
5. **Wynik kroku Condition** to odpowiedź „Yes” / „No” (`{{steps.id}}`), ale następny krok nadal widzi jako `{{previous}}` tekst, który był sprawdzany.
6. **Pomocnicze funkcje czyste** dla edytora: `evaluateWorkflowCondition` (to samo liczy program i atrapa), `connectionKindsOf(node)` (jakie połączenia mogą wychodzić z kroku), `describeWorkflowCondition(node)` (linia na karcie: `{{previous}} contains "approved"`), `WORKFLOW_CONDITION_OPERATOR_LABELS` (napisy do listy operatorów). `workflowPalette` oferuje już Prompt i Condition (dostępne), `addWorkflowNode` ustawia domyślne pola i wybiera Yes potem No (jak Allow potem Deny przy zgodzie), `workflowNodeIssues` / `checkWorkflowDraft` mówią, czego brakuje („needs a text to check”, „needs a value to compare with”).
7. **Zdania odrzucenia przy zapisie** (te same w programie i w atrapie): „The condition … needs a Yes or a No connection.”, „… has more than one way on for an answer.”, „Connection … leaves the condition …: use "yes" or "no".”, „Step "…" needs a text.”, „… needs a text to check.”, „… needs a value to compare with.”.

Podpięcie: `src/renderer/src/components/WorkflowsPage.tsx` dostało minimalną obsługę (przyciski „Add prompt” i „Add condition”, pola kroku Condition, domyślny rodzaj połączenia), żeby stary edytor dalej się kompilował i działał. UI Designer rysuje edytor od nowa na kontraktach, więc to tylko most.

## 2. Silnik

- Nowa tabela `projection_workflow_versions` (tworzy się sama przy starcie, `CREATE TABLE IF NOT EXISTS`); `WorkflowStore.listVersions/saveVersion` trzyma najnowsze 20; usunięcie przepływu usuwa wersje.
- `WorkflowManager`: `listVersions`, `getVersion`, `restoreVersion`, zapis wersji przy `create` i `update`; kroki `prompt` i `condition` w pętli wykonania (`#execute`) i w sprawdzaniu zapisu (`#checkGraph`); trzy nowe kanały IPC lokalne (`workflows:list-versions`, `:get-version`, `:restore-version`) z walidacją wejścia.

## 3. Testy (jeden plik naraz)

| Plik | Wynik |
|---|---|
| `ipc-workflow-versions.test` | 5 |
| `ipc-workflow-branching.test` (Prompt, Condition: ocena, kształt grafu, kreator) | 8 |
| `ipc-workflow-editor.test`, `ipc-workflows.test` | zielone (bez zmian) |
| `workflow-manager.test` | 25/25 (wersje 6, Prompt/Condition 5) |
| `workflow-store.test`, `workflow-inputs.test` | 4 i 4 |
| `mock-workflows.test` | 17/17 |
| `WorkflowsPage.test` (komponent) | 1/1 |

Typecheck contracts, node zielone; Biome czysty na moich plikach.

## 4. Czego nie sprawdzono

1. Okno programu: ekranu wersji i edytora z nowymi krokami jeszcze nie ma (stary edytor tylko się kompiluje).
2. Prawdziwa baza po restarcie (test używa bazy testowej, nowa tabela wymaga kolejnego uruchomienia programu, żeby się utworzyć w istniejącej bazie; kod `CREATE IF NOT EXISTS` jest sprawdzony na świeżej bazie testowej).
3. Pełny `local-only-ipc.test` (nowe kanały lokalne wymagają dopisania liczników; nie uruchamiałem pełnych testów podczas pełnego `check` lidera).
4. Kroki LLM, Asset, Image i Video nadal poza zakresem (decyzja w `luki-silnika-071.md`).
