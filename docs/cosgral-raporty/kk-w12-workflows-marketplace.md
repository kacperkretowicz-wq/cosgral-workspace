# KK W12 (KK-H): Workflows, Harmonogram i Marketplace (Agents, Skills): kontrakty i atrapy pod ekrany UI

Data: 17.11.2026. Gałąź `team/kk/w12-lint` (baza integracji b46ff76eb). Tylko kontrakty, atrapy i testy jednostkowe, bez Electrona. `agent-service.ts` i silnik nietknięte. Materiały 0.71 (zrzuty 002, 008, 009, 037–039, 075–077) tylko do odczytu.

## Wynik w jednej linii

**Przed zmianą podgląd i Storybook nie miały atrap `window.openbot.workflows` i `marketplace`, a atrapa `routines` była szkicem bez sprawdzania. Teraz każda z trzech stron ma atrapę z zasadami programu i kontrakt „jedno wywołanie = jeden ekran”.**

## 1. Lint (przyczyna)

Nie końcówki linii (pliki LF, `.gitattributes` `* text=auto eol=lf`). Dwa fragmenty scommitowano bez formatowania (kod kart agenta z BE-G w `src/main/index.ts` i test w `src/backend/agent-service.test.ts`). `bun x biome format --write <pliki>` je poprawia (commit `28dd99281`). Jeden sposób dla wszystkich: przed commitem `bun x biome check --write <swoje pliki>`. Zostaje `scripts/sandbox-shots-w12.ts` (Tester): 4 błędy lintu + format, opis w wiadomości do lidera.

## 2. Workflows (zrzuty 002, 075–077)

| Co rysuje UI | Skąd |
|---|---|
| Puste płótno „Start with a trigger / Add trigger”, potem „Add the first step” | `workflowCanvasPrompt(graph)` |
| Okno „Add node”: Inputs (Trigger, Prompt, Asset), Steps (LLM, Agent, Image, Video), Flow (Condition, Approval, Output), pole szukania | `workflowPalette(graph, query)`; wpisy, których nie mamy, są przyciemnione z powodem (`type: null`); Trigger gaśnie po pierwszym, wszystko przy 30 krokach, kroki przed triggerem gasną |
| Karta triggera „Schedule · Daily on Every day at 9 AM · Next run · Run now” | `workflowTriggerCard(node, routines, runState)` + `describeSchedule` + `formatClockTime`; warianty Manual, Schedule, Webhook (adres), „rutyna usunięta” |
| „Add node”: nowy krok, połączenie, pozycja | `addWorkflowNode`, `removeWorkflowNode` (łata łańcuch), `connectWorkflowNodes`, `moveWorkflowNode`; zwracają nowy graf, stary bez zmian |
| Strzałki cofnij/ponów | `createWorkflowHistory(initial, limit)` |
| Plakietka błędu na kroku i „Save” | `checkWorkflowDraft(graph, known)` → `graphProblems`, `nodeIssues` (te same zdania co zapis w programie), `canSave` |
| „Run workflow” / „Run now” | `workflowRunState(workflow)` → `canRun`, `reason` (paused / już działa / popraw płótno), `running` |
| Przebieg: plakietka i „2 of 4 steps”, czeka na kartę | `workflowRunBadge(status)`, `workflowRunProgress(run)` |

- Atrapa `window.openbot.workflows`: `list/create/update/delete/run/cancelRun/listRuns` z zasadami `workflow-manager.ts` (limity, jeden przebieg naraz, wstrzymany nie startuje, `{{input}}` `{{previous}}` `{{steps.id}}`, zgoda → ścieżka allow/deny albo „denied”). Przebieg nie rusza sam: `simulate.advance`, `simulate.decide`, `simulate.failNext`, `simulate.clear`. Zdarzenia `workflows-changed`, `workflow-run-changed`. Zaczyna od jednego przepływu „Morning brief” (Start → Agent → Approval → Output/Output).
- **Czego nie mamy (lista w `WORKFLOW_EDITOR_UNAVAILABLE` z powodem):** rysowanie na płótnie (ołówek, kształty, karteczki, tekst: nie zapisywane z przepływem), wersje przepływu. Węzły Prompt, Asset, LLM, Image, Video, Condition przyciemnione z powodem.

## 3. Harmonogram (008) i rutyny: co sprawdziłem

- Atrapa `window.openbot.routines` była szkicem (jedna rutyna, bez sprawdzania). Zamieniona na atrapę z zasadami `routine-manager.ts` (limity, zdania błędów, sekret webhooka raz, wstrzymana bez następnego startu, „run now” odmawia wstrzymanej i działającej, historia z `done`/`skipped`/`ignored`). `simulate.finishRun`, `simulate.webhook`, `simulate.clear`. Dane startowe zachowały nazwy ze starej atrapy („Weekly review”, `whsec_DEMO_ONLY`), więc test panelu rutyn dalej przechodzi.
- **Nie zrobiłem danych ekranu Harmonogram** (kalendarz miesiąca z biegami i planowanymi startami): to krok 3 Backendu (BE-G). Braki, które zauważyłem w kontrakcie rutyn, do uzgodnienia:
  1. `listRuns` jest per rutyna; kalendarz potrzebuje biegów wszystkich rutyn (i przepływów) w zakresie dat jednym zapytaniem.
  2. Planowane starty w przyszłości (nie tylko `nextRunAt`): silnik ma `nextRunAfter`, brak wywołania „kolejne starty w miesiącu”.
  3. Zrzut 008 pokazuje przy biegu notatkę („Each run leaves a note”): `RoutineRun` nie ma pola z notatką/podsumowaniem biegu.
  4. Etykieta „Times in UTC”: kalendarz potrzebuje wybranej strefy czasu w odpowiedzi.

## 4. Marketplace: zakładki Agents i Skills (009, 037–039)

| Co rysuje UI | Skąd |
|---|---|
| Nagłówek, podtytuł, pole szukania (Skills: „Search, or paste a GitHub link”) | `MARKETPLACE_TABS` |
| Rząd „Featured” i sekcje kategorii (Productivity, Research…) bez powtórek, filtr słów (akcenty, tagi) | `layoutMarketplace(items, {kind, query, source})`, `MARKETPLACE_CATEGORY_LABELS`, `marketplaceMatches` |
| Filtr „All / Verified / Public” | `MARKETPLACE_SOURCE_FILTERS`: Public wyszarzone z powodem (katalog publiczny wymaga serwera); cały katalog jest „by COSGRAL, verified” (`marketplaceItemSource`) |
| Awatar na karcie agenta | `marketplaceItemAvatar(item)`: stały zestaw ziarno+kolor z id elementu (kolor z koła 17 odcieni), bez nowego pola do przechowania |
| Przycisk „Add” / „Added” / „Update” / zablokowany | `marketplaceAction(item, botId)`: skill idzie do jednego agenta (`needsAgent`), agent robi nowego agenta za każdym razem, skill lokalny o tej nazwie jest odmówiony z powodem |
| Wklejony link GitHub | `parseMarketplaceQuery`: rozpoznany jako link; instalacja stamtąd jest w `MARKETPLACE_UNAVAILABLE` z powodem (nie sprawdzony kod z internetu) |
| Stany strony: ładowanie, błąd z „Retry”, pusty katalog, brak wyników, lista | `marketplacePageState` |

- Szczegóły (`get`: SKILL.md i pliki albo rola i pamięci agenta) i instalacja (`installSkill`, `installAgent`, `uninstall`, `suggestions`, zdarzenie `marketplace-changed`) były w kontrakcie; brakowało atrapy. Atrapa `window.openbot.marketplace` (8 umiejętności, 5 agentów): zasady `marketplace.ts` (outdated → Update z ostrzeżeniem, local odmowa, nowy agent przez kreator atrapy mock-openbot, usunięcie agenta usuwa agenta). `simulate.failNext/localSkill/outdateSkill/empty`.
- **Nie ma (z powodem):** katalog publiczny, instalacja z linku GitHub, publikowanie własnego elementu.

## 5. Pliki

Kontrakty: `ipc-workflow-editor.ts`, `ipc-marketplace-screen.ts` (+ testy, eksport w `ipc.ts`). Atrapy: `mock-workflows.ts`, `mock-routines.ts`, `mock-marketplace.ts` (+ testy), wpięte w `mock-openbot.ts` (`workflows`, `routines`, `marketplace`). Bez zmian w `src/main`, `src/preload`, `src/backend`: wszystkie wywołania istniały.

## 6. Czego NIE sprawdzono

1. Wygląd w oknie i w Storybooku (UI rysuje; ja nie uruchamiałem Electrona ani Storybooka).
2. Istniejące komponenty `WorkflowsPage` i `MarketplacePage` nie używają jeszcze nowych funkcji kontraktu (to praca UI Designera); przeszły testy komponentów z nowymi atrapami.
3. Następny start dla „cron” w atrapie rutyn rozumie tylko formę „M H * * *”; program rozumie każdą.
4. Edytor nie zapisuje rysunków na płótnie (patrz wyżej).
