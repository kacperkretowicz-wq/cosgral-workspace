# Backend W3-BE3: Marketplace — lokalny katalog skilli i agentów

Gałąź `team/backend/w3-be3` od integracji `cb2823d97`, bez push. Opis zachowania: `docs/cosgral/parytet-0.68.md` wiersz 41, `docs/cosgral/spec-w3.md` §10, decyzja lidera `PLAN.md` „Decyzje lidera do W3” pkt 5. Kodu OpenBota nowszego niż `a6fe240` nie czytałem. Treści katalogu są nasze (bez tekstów z OpenBota 0.68). Wtyczki z własnymi połączeniami: poza zakresem (W4).

## Wynik

| Zachowanie (spec W3 §10) | Stan | Gdzie |
|---|---|---|
| 10.1 Katalog skilli i agentów z wyszukiwarką, filtr rodzaju i kategorii | ✓ | `Marketplace.list`, `marketplace-catalog.ts` |
| 10.2 Instalacja skilla włącza go u wybranego agenta; limity 200 plików / 10 MB | ✓ przez silnik skilli W2 (za duży → odrzucony z komunikatem, nic nie zostaje) | `Marketplace.installSkill` |
| 10.3 Agent sugeruje pozycję; nic nie instaluje sam | ✓ karta confirm w Needs you, instalacja tylko po „Approve” | `Marketplace.suggest`, narzędzie `suggest_marketplace_item` |
| 10.4 Instalacja agenta przez zwykły kreator (szablony W3-BE2) | ✓ nowy agent z rolą, instrukcjami, narzędziami, skillami i pamięcią pozycji | `Marketplace.installAgent` → `AgentTemplates.createAgent` |
| 10.5 Lokalny skill nie trafia do katalogu sam | ✓ katalog to tylko seed z repo | test „never lists a skill created locally” |
| Odinstalowanie | ✓ skill: z agenta (biblioteka zostaje); agent: usunięcie agenta utworzonego z tej pozycji | `Marketplace.uninstall` |
| Sugestie dla osoby (ekran) | ✓ skille pasujące do profilu agenta, których jeszcze nie ma; bez agenta — polecane | `Marketplace.suggestions` |
| Ekrany | — praca UI według kontraktu niżej | — |

## Jak to działa i decyzje do oceny

1. **Katalog = seed w repo** (`src/backend/marketplace-catalog.ts`), w kodzie, więc działa w paczce bez plików zasobów. 8 skilli: `meeting-notes`, `weekly-status-report`, `research-brief`, `inbox-triage`, `code-review-checklist`, `trip-planner`, `expense-log`, `post-drafts`. 5 agentów: Project coordinator, Research analyst, Inbox assistant, Code reviewer, Travel planner (każdy z 1–2 skillami katalogu). Kategorie: productivity, research, writing, communication, development, data, travel.
2. **Id pozycji:** `skill:<nazwa skilla>` albo `agent:<slug>`.
3. **Skill z katalogu idzie przez silnik skilli W2:** przy pierwszej instalacji trafia do biblioteki jako nowa wersja (autor `null`, notatka „From the Marketplace (catalog version N)”), potem kopia dla agenta. Druga instalacja dla innego agenta używa tej samej wersji biblioteki. Skrypty skilla się nie uruchamiają (tak jak w W2).
4. **Pochodzenie skilla** zapisuję w `projection_marketplace_skills` (pozycja → skill biblioteki, wersja katalogu, wersja biblioteki). Stąd `libraryState`:
   - `absent` — nie ma w bibliotece;
   - `current` — biblioteka ma tę wersję katalogu;
   - `outdated` — nowsza wersja katalogu (po aktualizacji programu); instalacja zapisuje ją jako nową wersję biblioteki, a kopia agenta przechodzi na nią; kopie innych agentów zostają, dopóki ich nie zaktualizują;
   - `local` — w bibliotece jest skill o tej nazwie, który nie pochodzi z katalogu; instalacja jest odrzucana i nic nie nadpisuje.
   Gdy ktoś poprawił skill z katalogu w bibliotece, nowsza wersja katalogu go nie nadpisuje (ostrzeżenie w `warnings`).
5. **Agent z katalogu** powstaje przez `AgentTemplates.createAgent` (te same kontrole i ostrzeżenia co kreator). Najpierw skille agenta trafiają do biblioteki; skill, którego nie da się dodać (np. `local`), wraca jako ostrzeżenie i nie jest instalowany. Powiązanie agent → pozycja jest w `projection_marketplace_agents`; usunięty gdzie indziej agent znika z `installedBotIds` sam.
6. **Odinstalowanie agenta = usunięcie agenta** przez zwykłe `AgentService.deleteBot` (te same warunki: agent nie może pracować). Tylko agent utworzony z tej pozycji; inny → błąd. UI musi zapytać osobę przed wywołaniem.
7. **Sugestie agenta:** narzędzia `search_marketplace` i `suggest_marketplace_item` są w przestrzeni `cosgral_skills`, więc mają ten sam przełącznik „skills”, działają w Codex, Claude (serwer MCP w procesie) i w turach kanału. Sugestia otwiera kartę confirm (tytuł `Install "<pozycja>" from the Marketplace?`, podgląd z powodem agenta). Tylko „Approve” instaluje; „Edit” / „Keep draft” = odmowa; karta wygasła = nic. Agent dostaje wynik i instrukcję, by nie proponować tego samego ponownie.
8. **Sugestie dla osoby:** słowa z nazwy, roli i opisu agenta (bez słów ogólnych, liczba mnoga uproszczona) porównane z tytułem, opisem, kategorią i tagami skilli. Wynik: do 6 pozycji, z `reason` („Fits: research, source” albo „Featured”) i `matched`.
9. **Wyszukiwanie:** każde słowo musi pasować (tytuł, tagi, nazwa, opis, kategoria); wielkość liter i polskie znaki nie mają znaczenia („zurich” znajduje „Zürich”); najlepsze trafienia pierwsze, potem polecane, potem tytuł.
10. **Jedno zdarzenie na operację:** w trakcie instalacji zdarzenia biblioteki są wstrzymane, a na końcu idzie jedno `marketplace-changed` z całym katalogiem. UI nie widzi stanu pośredniego (np. `local` w połowie instalacji). Zmiany biblioteki z innych miejsc (agent tworzy skill, osoba usuwa) też dają `marketplace-changed`.
11. **Bez zmiany schematu:** dwie tabele tworzy sam silnik (`CREATE TABLE IF NOT EXISTS`), `SCHEMA_VERSION` nietknięty.
12. **Małe zmiany we wspólnych plikach** (bez przesuwania wcięć):

    | Plik | Zmiana |
    |---|---|
    | `agent-service.ts` | +20/−1 (import, pole `marketplace`, obiekt w konstruktorze, `SkillTools` dostaje Marketplace, kontekst karty w obsłudze `cosgral_skills`) |
    | `main/index.ts` | +3 |
    | `preload/index.ts` | +2 |
    | `ipc-conversation.ts` / `ipc-desktop-apis.ts` / `ipc-channels.ts` / `ipc.ts` | +5 / +3 / +6 / +1 |
    | `skill-tools.ts` (mój z W2) | +21/−2 (dwa narzędzia, zdanie w instrukcjach, opcjonalny Marketplace) |

## Kontrakt dla UI

Plik `packages/contracts/src/ipc-marketplace.ts`. Tylko ten komputer; dla zdalnego serwera `list` i `suggestions` zwracają `[]`, reszta odmawia.

`window.openbot.marketplace?`:

| Metoda | Wejście | Wynik |
|---|---|---|
| `list` | `{ query?, kind?: "skill" \| "agent", category? }` (wszystko opcjonalne) | `MarketplaceItem[]` |
| `get` | `{ itemId }` | `MarketplaceItemDetails` (`skillMd`, `files` dla skilla; `agent: { role, description, memories }` dla agenta) |
| `installSkill` | `{ itemId, botId }` | `MarketplaceInstallResult` (`bot: null`) |
| `installAgent` | `{ itemId, name? }` | `MarketplaceInstallResult` (`bot` = nowy agent) |
| `uninstall` | `{ itemId, botId }` | `void` — skill: zdejmuje z agenta; agent: **usuwa agenta** (najpierw zapytaj osobę) |
| `suggestions` | `{ botId? }` | `MarketplaceSuggestion[]` (`item`, `reason`, `matched`), do 6 |

`MarketplaceItem`: `id`, `kind`, `title`, `summary`, `description`, `category`, `tags`, `featured`, `version`, `skillName` (skill) / `null`, `skills` (agent: nazwy skilli), `libraryState` (skill) / `null`, `installedBotIds`.

`MarketplaceInstallResult`: `item` (już po zmianie), `botId`, `bot`, `warnings` (pokaż je; instalacja i tak się udała).

Przyciski według stanu skilla:

| `libraryState` | Agent ma skill (`installedBotIds` zawiera agenta) | Pokaż |
|---|---|---|
| `absent` / `current` | nie | „Install” (wybór agenta) |
| `current` | tak | „Installed” + „Uninstall” |
| `outdated` | tak / nie | „Update” / „Install” (oba = `installSkill`) |
| `local` | — | wyłączone, tekst: w bibliotece jest własny skill o tej nazwie |

Zdarzenia:
- `marketplace-changed { items }` — cały katalog ze stanami; zastąp listę (filtr i wyszukiwanie można robić u siebie albo wołać `list` ponownie).
- Przy `bots-changed` odśwież `installedBotIds` agentów (usunięty agent znika z listy przy następnym `list`).
- Sugestia agenta to zwykła karta confirm (`draft-preview`, `variant: "confirm"`) w Needs you; nowego typu karty nie ma.

Limity: `MARKETPLACE_LIMITS` (`query` 200, `reason` 500, `suggestions` 6, `agentName` 80). Kategorie: `MARKETPLACE_CATEGORIES`.

Komunikaty błędów (do pokazania wprost): „This Marketplace item does not exist.”, „This agent does not exist.”, „… is an agent; install it as a new agent.”, „A library skill named … is not from the Marketplace. Rename or delete it …”, limity silnika skilli („A skill has at most 200 files …”, „… 10485760 bytes …”), „This agent was not created from …”.

## Testy i dowód

Uruchamiane przez kolejkę `Shared\tools\heavy.ps1`, jeden plik naraz (pełnych testów nie uruchamiałem — decyzja właściciela):

| Polecenie | Wynik |
|---|---|
| `vitest run packages/contracts/src/ipc-marketplace.test.ts` | 4/4 |
| `vitest run src/backend/marketplace.test.ts` | 17/17 (katalog, wyszukiwanie, szczegóły, 10.2–10.5, aktualizacja wersji, odinstalowanie, sugestie, poprawność seeda: każdy skill przechodzi kontrole biblioteki) |
| `vitest run src/backend/marketplace-tools.test.ts` | 4/4 (narzędzia w `cosgral_skills`, wyszukiwanie, karta przed instalacją, komunikaty) |
| `vitest run src/backend/skill-tools.test.ts` (zmieniony plik W2) | 3/3 |
| `bun run typecheck:node` | kod 0 |
| `typecheck:contracts`, `typecheck:renderer` | kod 0 |
| `biome check` na 18 dotkniętych plikach | 0 błędów |

TDD: każdy z trzech nowych testów najpierw padał (brak modułu / brak narzędzi), potem przeszedł.

## Czego nie sprawdziłem

- Programu w piaskownicy (Electron) — nie uruchamiałem, żeby nie obciążać komputera; zadanie tego nie wymagało. IPC i preload sprawdza tylko typecheck.
- Pełnego `bun run test` (pomijamy z decyzji właściciela). Testy `agent-service` i `claude-client` nie były uruchamiane; zmiana w nich to dwa nowe narzędzia w istniejącej przestrzeni `cosgral_skills`.
- Prawdziwej tury Codex / Claude z sugestią — sprawdzone na poziomie `SkillTools` z prawdziwą biblioteką i atrapą karty.

## Pliki

- Nowe: `packages/contracts/src/ipc-marketplace.ts` (+ test), `src/backend/marketplace.ts` (+ test), `src/backend/marketplace-catalog.ts`, `src/backend/marketplace-tools.ts` (+ test), `src/main/marketplace-ipc.ts`, `src/main/ipc/marketplace-inputs.ts`, `src/preload/marketplace-api.ts`.
- Zmienione: `packages/contracts/src/{ipc,ipc-channels,ipc-conversation,ipc-desktop-apis}.ts`, `src/backend/{agent-service,skill-tools}.ts`, `src/main/index.ts`, `src/preload/index.ts`, `COSGRAL-CHANGES.md`.
