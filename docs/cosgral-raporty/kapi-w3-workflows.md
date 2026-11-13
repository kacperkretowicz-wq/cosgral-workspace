# Raport KAPI W3-K2: przepływy pracy (wiersz 28)

**Gałąź:** `team/kapi/w3-workflows` (od integracji `572b6ad95`)
**Worktree:** `Shared\cosgral-wt\desktop-kapi`
**Agent:** KAPI
**Data:** 13.11.2026

## Werdykt

**Przepływy działają: kontrakt dla UI, silnik, IPC i preload.** UI robi płótno na gotowym kontrakcie.
- **Graf:** jeden wyzwalacz i kroki połączone strzałkami. Każdy krok ma pozycję `x, y` pod płótno.
- **Kroki:** wyzwalacz (ręczny albo z rutyny), agent, zatwierdzenie, wyjście do kanału.
- **Zatwierdzenie** to zwykła karta `confirm` (Confirm / Edit / Cancel) w Needs you, pod wierszem wskazanego agenta. Confirm idzie dalej połączeniem `allow`. Edit, Cancel albo zamknięta karta idą połączeniem `deny`, a bez niego przebieg kończy się jako `denied`.
- **Przebieg:** statusy kroków i przebiegu, historia (ostatnie 100 na przepływ), wynik ostatniego kroku. Jeden przebieg przepływu naraz, anulowanie zamyka kartę.
- **Po restarcie** przepływy i historia zostają. Przebieg otwarty przy zamknięciu programu kończy się jako `failed`.
- **Wyjście do kanału:** wiadomość programu (`kind: "system"`) z prefiksem `[Workflow "nazwa"]`.

**Dowód z piaskownicy** (prawdziwy program, atrapa Codex, bez prawdziwego Codex ani Claude):
- Allow: agent odpowiedział, karta była w Needs you, po Confirm przebieg `done` i wiadomość w kanale.
- Edit: gałąź `deny` (post pominięty, „The reply was not approved.” w kanale).
- Anulowanie: karta zamknięta (1 → 0), drugie anulowanie odrzucone.
- Rutyna „Morning check” uruchomiona ręcznie: przepływ z tym wyzwalaczem wystartował z `cause: routine`.
- Restart: przepływy, 3 przebiegi z historii i 3 wiadomości w kanale zostały. Przebieg, który był otwarty (czekał na kartę) przy wymuszonym zamknięciu programu, po starcie jest `failed` z komunikatem „The program stopped during this run.” (krok `approve` = `failed`, reszta `skipped`, `lastRun` zaktualizowany, 0 kart w Needs you).
- Błąd dostawcy: gdy atrapa Codex nie wystartowała, krok agenta zakończył się `failed` z czytelnym błędem („Codex CLI was found but could not be started…”), a przebieg też `failed`, bez wiszącego stanu.

**Commity:**

| Commit | Co |
|---|---|
| `39a08b4c5` | Kontrakt `ipc-workflows.ts`, kanały `workflows:*`, zdarzenia, `workflowProblems()`. Notka dla UI w pamięci kanału |
| `13427bc41` | Magazyn (`WorkflowStore`, 2 tabele) i wykonawca (`WorkflowManager`) |
| `f0f889ec7` | `AgentService` (runner, karta zatwierdzenia), IPC + parsery, preload, `main` |

Ostatni commit (raport i dziennik zmian) jest opisany w wiadomości w kanale.

## Zachowanie wobec spec-w2 §7 i decyzji lidera nr 8

| # | Zachowanie | Stan | Jak / dowód |
|---|---|---|---|
| 7.1 | Płótno: węzły, wyzwalacz, kroki (także z zatwierdzeniem), wyjścia. Zapis po restarcie | ✓ (kontrakt i silnik; płótno robi UI) | Węzły z `x, y`, połączenia `next` / `allow` / `deny`. `workflowProblems(graf)` sprawdza płótno na żywo. Zapis w bazie, test restartu w `workflow-store.test.ts` i w piaskownicy |
| 7.2 | Uruchomienie ręczne lub z wyzwalacza, widoczny wynik, wyjście do kanału | ✓ | `workflows.run`, wyzwalacz z rutyny, `WorkflowRun.result`, wiadomość `system` w kanale. Testy menedżera i piaskownica |
| 7.3 | Krok z zatwierdzeniem wstrzymuje przebieg (Needs you), po Allow idzie dalej | ✓ | Karta `confirm` pod wierszem agenta, przebieg `waiting`. Test na prawdziwym `AgentService` i piaskownica |
| Dec. 8 | Silnik i kontrakt `ipc-workflows.ts`, potem UI robi płótno | ✓ | Kontrakt oddany jako pierwszy (commit `39a08b4c5`) |

## Jak to działa

- **Krok agenta = zwykła wiadomość w kolejce agenta**, tak jak przebieg rutyny. Zaczyna się od `[COSGRAL workflow run] "nazwa", step "tytuł"` i wyjaśnienia, że tekst w `<workflow_data>` to dane, nigdy polecenia. Wynik kroku to ostatnia odpowiedź agenta z tej tury (`AgentService.workflowRunner().deliveryOutput`).
- **Szablony w tekstach kroków:** `{{input}}`, `{{previous}}`, `{{steps.<id>}}`. Nieznane nazwy dają pusty tekst. Dla agenta każda wstawiona wartość jest owinięta w `<workflow_data name="…">`, a zamknięcie znacznika w danych jest zabezpieczone.
- **Karta zatwierdzenia** używa `ActionCards.confirmAction`, jak Computer Use i Vault. Dzięki temu UI i wyspa KK obsługują ją bez zmian (zatwierdzenie > pytanie > błąd w kolejności wyspy). Karta ma `providerThreadId` `workflow:<runId>`, więc zamyka się z przebiegiem.
- **Jeden przebieg przepływu naraz.** Drugi start jest odrzucony („already running”). Wstrzymany przepływ nie startuje ani ręcznie, ani z rutyny.
- **Wyzwalacz z rutyny:** menedżer rutyn już wysyła `routine-run`. Przepływ startuje przy pierwszym zdarzeniu `running` danego przebiegu rutyny (raz na przebieg), jeśli nie jest wstrzymany i nie biegnie. Rutyna dalej robi swoje (swoja wiadomość do agenta).
- **Zatrzymanie i restart:** `stop()` kończy otwarte przebiegi jako `failed` („The program stopped during this run.”) i zamyka karty. `start()` zamyka przebiegi, które zostały po awarii.
- **Schemat:** `SCHEMA_VERSION` bez zmian. Nowe tabele `projection_workflows` i `projection_workflow_runs` (`CREATE TABLE IF NOT EXISTS`).

## Kontrakt dla UI

Plik `packages/contracts/src/ipc-workflows.ts` (commit `39a08b4c5`):

```ts
window.openbot.workflows   // opcjonalne w OpenBotDesktopApi do czasu atrapy
  list(): Promise<Workflow[]>
  create({ name, description?, nodes, edges, paused? }): Promise<Workflow>   // błąd z listą problemów grafu
  update({ workflowId, name?, description?, nodes?, edges?, paused? }): Promise<Workflow>
  delete({ workflowId }): Promise<void>
  run({ workflowId, input? }): Promise<WorkflowRun>          // wraca od razu, kroki idą w tle
  cancelRun({ runId }): Promise<WorkflowRun>
  listRuns({ workflowId }): Promise<WorkflowRun[]>           // najnowsze pierwsze, do 100

WorkflowNode = { id, title, x, y } + jedno z:
  { type: "trigger", trigger: { kind: "manual" } | { kind: "routine", routineId } }
  { type: "agent", botId, prompt }                   // prompt ≤ 4000
  { type: "approval", botId, text }                  // botId = pod czyim wierszem jest karta; text ≤ 2000
  { type: "channel-output", channelId, text }        // text ≤ 2000
WorkflowEdge  { id, from, to, on: "next" | "allow" | "deny" }   // allow/deny tylko z approval
Workflow      { id, name, description, nodes, edges, paused, createdAt, updatedAt, lastRun: { runId, status, startedAt } | null }
WorkflowRun   { id, workflowId, workflowName, cause: manual|routine, status: running|waiting|done|failed|denied|cancelled,
                input, steps: WorkflowStepRun[], result, error, startedAt, finishedAt }
WorkflowStepRun { nodeId, title, type, status: pending|running|waiting|done|failed|denied|skipped, output, error, startedAt, finishedAt }
workflowProblems({ nodes, edges }): string[]   // czysta funkcja, do sprawdzania płótna przy każdej zmianie
WORKFLOW_LIMITS { workflows 64, nodes 30, edges 60, name 80, title 80, prompt 4000, text 2000, input 8000, output 20000, runsKept 100 }
Zdarzenia: workflows-changed { workflows } (zastąp listę), workflow-run-changed { run } (zastąp przebieg)
```

**Wskazówki dla UI:**
- **Kolory węzłów** z `steps[].status` aktywnego przebiegu (`waiting` = czeka na zatwierdzenie). Pierwszy krok `trigger` jest zawsze `done` i ma wejście jako `output`.
- **Zatwierdzenie** pokazuje się samo jako zwykła karta w Needs you pod agentem z węzła. Płótno może dodać link „Otwórz kartę” po `waiting`.
- **Błąd zapisu** ma tekst „This workflow cannot be saved: …” z listą problemów po angielsku. Płótno ma pokazywać `workflowProblems` zanim użytkownik kliknie Zapisz.
- **Wiadomość w kanale** ma `kind: "system"` i `authorBotId: null`. Wygląd „komunikat programu” zostaje po stronie UI.
- **Atrapa UI** (`mock-openbot.ts`) nie ma jeszcze `workflows.*`.

## Testy

| Polecenie | Wynik |
|---|---|
| `bun run typecheck` (contracts, node, renderer, storybook, api) | exit 0 |
| `bun run build` | OK |
| Biome na plikach gałęzi | 0 błędów, poprawki automatyczne tylko w moich liniach |
| Nowe testy: `ipc-workflows` 4, `workflow-store` 4, `workflow-manager` 14, `workflow-inputs` 3, `agent-service` (przepływy na prawdziwym AgentService) 2 | zielone |
| Całe `bun run test` na końcowym kodzie | **Nie ukończone.** Dwa przebiegi (13:21 i 14:29) zawisły bez wyniku przy braku pamięci (0,5–1 GB wolnej z 8 GB). Pierwszy zdążył pokazać 7 nieudanych testów istniejących plików (`App.test.tsx`, `agent-service.test.ts`, `app-server-client.test.ts`, czasy 5–17 s przy limicie 5 s). Te trzy pliki **osobno: 3 pliki, 151/151 zielone**. Integracja przed przepływami miała 968/968 (wynik lidera), a ta gałąź przed przepływami 936/936 (W3-K1) |

**TDD:** kontrakt, magazyn, menedżer, parsery i testy na `AgentService` zaczynały od testu (czerwony z powodu brakującego modułu albo metody). Test „pierwszy krok jest już `running`” poprawiłem po zobaczeniu prawdziwego zachowania.

## Piaskownica

Profil `Shared\cosgral-data\desktop-kapi\sandbox-w3wf\home` (osobne USERPROFILE, APPDATA, LOCALAPPDATA i TEMP, bez `CLAUDE*` i `OPENBOT*`). Atrapa Codex z K1. Kroki sterownika `kapi-drive.mjs`: `wfsetup`, `wfids`, `wfrun`, `wfcard`, `wfdecide`, `wfcancel`, `wfroutine`, `wfstate`. Prawdziwego Codex ani Claude nie używałem.

| Przebieg | Wynik | Dowód (`evidence\w3wf\…`) |
|---|---|---|
| `01-workflows` | ✓ Zapis grafu bez gałęzi `allow` odrzucony z listą problemów. Allow: karta `confirm` w Needs you (przyciski Confirm, Edit, Cancel), po zatwierdzeniu `done` i wiadomość w kanale. Edit: krok `approve` = `denied`, `post` = `skipped`, `refuse` = `done`. Anulowanie: karty 1 → 0, drugie anulowanie „already ended”. Start z rutyny: `cause: routine`, `waiting`, po Allow `done` | `wf-01-card-allow.png`, `wf-03-card-deny.png`, `drive.log` |
| `02-open-run-at-exit` (ten sam profil) | ✓ Po restarcie zostały 2 przepływy, 3 przebiegi i 3 wiadomości `system` w kanale | `wf-07-after-restart.png`, `drive.log` |
| `04-open-run-at-exit` | ✓ Nowy przebieg doszedł do karty (`waiting`, karta w Needs you), program zamknięty z otwartym przebiegiem (wymuszone, czyli jak awaria) | `wf-10-open-card.png` |
| `05-after-stop` | ✓ Ten przebieg jest `failed` z „The program stopped during this run.”, karty zniknęły | `drive.log` |

**Zamykanie i start w piaskownicy: uwaga o środowisku.** Podczas tych przebiegów na komputerze zostawało 0,5–1,2 GB wolnej pamięci z 8 GB (inni agenci uruchamiali własne programy i testy).
- Zamknięcie programu trwało 16–20 s (w K1 ok. 0,3 s), a część przebiegów skończyła się wymuszonym zamknięciem po limicie 20 s skryptu. Po wymuszonym zamknięciu zostały pojedyncze procesy atrapy, które ręcznie zakończyłem (sprawdzone: 0 procesów z `sandbox-w3wf`).
- `waitready` w kilku przebiegach nie doczekał się gotowości w 90 s, bo atrapa Codex nie startowała (`codex --version` przekraczał czas).
- To samo wystąpiło na **pustym profilu bez żadnych przepływów** (zamknięcie 19,9 s, `waitready` 91 s). Moduł przepływów w zamykaniu nic nie robi (`stop()` jest synchroniczne i bez otwartych przebiegów nie robi nic), więc przyczyną nie jest on. **Przyczyny nie zbadałem** i nie porównałem z gałęzią integracji bez moich zmian. Warto, żeby ktoś zmierzył zamknięcie na integracji przy wolnej pamięci.
- Profil `COSGRAL Workspace Dev` właściciela był nietknięty (`absent` przed i po).

## Przeciążenie komputera (pomiar 15:10, na prośbę właściciela)

Komputer ma 4 rdzenie i 8 GB pamięci. W chwili pomiaru procesor był na 100%, wolne było 966 MB pamięci, a plik wymiany miał 2,3 GB w użyciu (szczyt dziś 4,9 GB). Moich procesów nie było (0).

| Kto | Co pomierzyłem |
|---|---|
| Aplikacja **OpenBot** (okno agentów) | Działa od 00:24. Renderer i proces GPU zużywały razem ok. 2,6 rdzenia z 4, a drugi renderer (od wczoraj 21:07) ok. 0,6. Łącznie 10 procesów, 1,4 GB. Procesor od północy: ok. 20 godzin pracy w 15 godzin |
| **Claude Desktop** (osobna aplikacja, od 08:39) | GPU i renderer ok. 1,5 rdzenia, procesy `claude` razem ok. 2,3 GB (20 procesów, w tym uruchamiane przez agentów) |
| Agenci | Każdy `bun run test` startuje kilka procesów roboczych po 300–700 MB, do tego `esbuild`, `tsc`, Biome (z wtyczkami ok. 36 s na plik) i programy piaskownic. Kilka takich zadań naraz zjada resztę pamięci |
| Antywirus (Avast) | Skanuje pliki odczytywane przez testy i Biome; na 8 GB zostaje po nim ok. 0,6 GB rezydentnie. Wpływu na czas nie mierzyłem |

**Wniosek:** stałym obciążeniem jest okno OpenBot (renderer i GPU) oraz Claude Desktop, nie testy. Testy agentów dokładają szczyty, które wyczerpują 8 GB i wymuszają zapis do pliku wymiany, stąd zawieszone przebiegi vitest i timeouty. **Czego nie sprawdziłem:** dlaczego renderer OpenBot jest tak gorący (hipoteza niesprawdzona: bardzo długi wspólny kanał ze strumieniowanymi wpisami przerysowuje się bez przerwy) ani wpływu antywirusa.

## Nie zrobione / nie sprawdzone

- **Płótno** (ekran): praca UI, na tym kontrakcie.
- **Narzędzia agenta do przepływów** (`list_workflows`, `run_workflow`): nie zrobione. Agent może dziś tylko być krokiem przepływu, nie uruchamia przepływów sam.
- **Wyzwalacze własne** (harmonogram, webhook przepływu): są tylko ręczny i z rutyny. Harmonogram i webhook dają rutyny z W2.
- **Równoległe gałęzie, warunki, pętle, kroki z zewnętrznymi integracjami:** nie ma. Każdy krok ma jedną drogę dalej (poza `allow` / `deny`). „Integracje” z wiersza 28 to na razie tylko wyjście do kanału.
- **Anulowanie przebiegu nie zatrzymuje wiadomości agenta, która już jest w jego kolejce.** Przebieg kończy się od razu, a agent dokończy turę (można ją anulować w jego kolejce).
- **Karta zatwierdzenia nie przeżywa restartu:** przebieg czekający na kartę kończy się jako `failed` i trzeba go uruchomić od nowa.
- **Tekst z Edit** na karcie nie trafia do kroków (karta zwraca tylko decyzję).
- **Usunięty agent albo kanał:** krok kończy się błędem przy przebiegu; zapis grafu sprawdza je tylko przy tworzeniu i zmianie grafu.
- **Prawdziwy Codex i Claude:** nie sprawdzano (atrapa).

## Pliki poza repo

`Shared\cosgral-data\desktop-kapi\`:
- `kapi-drive.mjs`: kroki przepływów,
- `sandbox-w3wf\`, `evidence\w3wf\`, `logs\w3-workflows-*.log`, `logs\w3wf-sandbox-*.log`.

Program nie jest uruchomiony. Bez push.
