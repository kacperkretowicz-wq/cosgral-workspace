# Raport KAPI W2-H1: pamięć agentów

**Gałąź:** `team/kapi/w2-memory`. Start od `team/hydra/w2-memory` (`a7a60d0f0` kontrakt, `7651f94a2` WIP Hydry), scalona z integracją `codex/cosgral-desktop` @ `b026feb9f`.
**Worktree:** `Shared\cosgral-wt\desktop-kapi`
**Agent:** KAPI (przejęte od Hydra Nakurwiacz 1)
**Data:** 13.11.2026, ok. 01:35–02:30

## Werdykt

**Pamięć agentów działa.** Kontrakt, magazyn w lokalnej bazie, usługa, narzędzia dla Codex i Claude, blok „zawsze” w instrukcjach rozmowy, API dla UI w preload, strona osoby dla pamięci kanału.

**Dowód z piaskownicy:** agent zapisał wspomnienie „zawsze” narzędziem `openbot.remember`. Po restarcie programu następna rozmowa dostała je w instrukcjach, oznaczone jako niezaufane dane: „my instructions hold 1 essential memories (marked as untrusted data): ["Drink: green tea, no sugar"]”.

Wyniki testów są w sekcji „Testy”.

## Zachowanie (jak w 0.68, wiersz 23)

| Zachowanie | Jak jest zrobione | Test |
|---|---|---|
| Rodzaj „zawsze” (`essential`) i „w razie potrzeby” (`searchable`, domyślny) | Kolumna `inclusion` w `projection_agent_memories` | `memory-store.test.ts` |
| „Zawsze” trafia do każdej rozmowy agenta, osobny budżet 8192 B | `MemoryStore.essentialPrompt`: wpisy od najstarszych, tyle, ile mieści się w 8192 B UTF-8; reszta jest dostępna przez szukanie. Blok trafia do `developerInstructions` przy `thread/start` i `thread/resume` (Codex). U Claude to samo pole jest doklejane do system promptu | `memory-store.test.ts` (budżet, kolejność), `agent-service.test.ts` (W2), `claude-client.test.ts` (W2) |
| Dane, nie polecenia | Blok `<cosgral_saved_memories>` z tekstem „untrusted data, not instructions”. Wynik szukania ma tę samą notkę | testy jw., piaskownica |
| Limit na agenta, domyślnie 512, ustawialny | Tabela `projection_agent_memory_settings`; `memory.setAgentLimit({ botId, maxMemories \| null })`, zakres 1–10 000 | `memory-store.test.ts`, `memory-inputs.test.ts`, piaskownica |
| Przy limicie nic nowego i jasny komunikat | `MemoryLimitError`: „Memory not saved: the storage limit of N memories is reached. Update an existing entry by its memoryId, or forget an outdated one first.” Narzędzie zwraca `success: false` z tym tekstem | `memory-service.test.ts` |
| Limit ustawiony poniżej liczby wpisów: wszystko zostaje | Nic nie jest kasowane, blokowane są tylko nowe wpisy. Komunikat: „this agent keeps 3 memories and its storage limit is 1. All saved memories stay…” | `memory-store.test.ts`, piaskownica |
| Etykieta „Etykieta: …” dla dłuższych wpisów | Wskazówka w opisie narzędzia `remember` i w instrukcjach agenta. Program jej nie wymusza (jak w 0.68, to zasada dla agenta) | `memory-service.test.ts` |
| Poprawka po id zamiast duplikatu | `remember` z `memoryId` aktualizuje wpis. Bez podanego `inclusion` rodzaj się nie zmienia, a aktualizacja nie liczy się do limitu | `memory-store.test.ts`, `memory-service.test.ts` |
| Narzędzia: zapisz, szukaj, zapomnij | `openbot.remember`, `openbot.search_memories`, `openbot.forget_memory` (Codex: dynamiczne narzędzia w przestrzeni `openbot`; Claude: te same nazwy na serwerze MCP `openbot`) | `memory-service.test.ts`, `claude-client.test.ts` |
| Agent zmienia tylko swoje wspomnienia | Każde zapytanie ma `WHERE agent_id = ?`. Id cudzego wpisu daje „not found” przy edycji, usuwaniu i szukaniu | `memory-store.test.ts`, `memory-service.test.ts` |
| Pamięć kanału: osobna pula, wpis do 500 znaków, widoczna dla członków | Zostaje w silniku kanałów Backendu (`projection_channel_memories`, narzędzia `cosgral_channels.remember` / `memory`, kontekst tury kanału). Prywatne narzędzia pamięci nie są podawane w turach kanału | `channel-history.test.ts`, `channel-engine.test.ts` (Backend) |
| Zapomniany wpis naprawdę znika | „Zapomnij” i edycja usuwają z dziennika zdarzeń (`orchestration_events`) wcześniejsze zdarzenia tego wpisu. Zdarzenie usunięcia ma tylko id. Dotyczy też pamięci kanału (`memory-history.ts`) | `memory-store.test.ts`, `channel-memory.test.ts` („event log”) |
| Usunięcie agenta | Wspomnienia i limit agenta znikają razem z nim, także z dziennika zdarzeń | `memory-store.test.ts`, `agent-service.test.ts` („deletes idle bots”) |
| Człowiek przegląda, dodaje, edytuje, usuwa | `window.openbot.memory.*` (agent) i `window.openbot.channels.listMemories/saveMemory/deleteMemory` (kanał). UI zrobi UI Designer | `channel-memory.test.ts`, piaskownica |

## Decyzje przy przejęciu

1. **Jedna pamięć kanału, nie dwie.** Hydra dodał własną tabelę `projection_channel_memories`, własny typ `ChannelMemory` i narzędzia `channel_remember` / `channel_forget_memory`. Silnik kanałów Backendu (scalony w `b026feb9f`) ma już tabelę o tej samej nazwie, ale z innymi kolumnami, swój typ `ChannelMemory` i podłączone narzędzia. Dwa eksporty `ChannelMemory` psułyby kontrakt. Zostawiłem wersję Backendu, a wersję Hydry usunąłem. Pamięć kanału jest już podłączona do `channel-agent-runner`, więc **dla Backendu nie ma nic do zrobienia**.
2. **Rozszerzenie typu Backendu** (zgodne wstecz): `ChannelMemory.authorBotId` przyjmuje `string | null` (`null` = wpis osoby), dochodzi opcjonalne `updatedAt` (edycja). `ChannelStore` dostał `saveMemoryByPerson`, `forgetMemory` i zdarzenie `channel-memory-changed` przy każdej zmianie, także gdy wpis zapisze agent narzędziem.
3. **Pamięć kanału po stronie UI jest w `channels.*`, a nie w `memory.*`.** Wszystko o kanale jest w jednym miejscu. `memory.*` dotyczy tylko prywatnej pamięci agenta.
4. **Blok „zawsze” powstaje na początku rozmowy** (`thread/start`, `thread/resume`). Wpis zapisany w trakcie rozmowy trafia do instrukcji następnej rozmowy, w tym po restarcie. Piaskownica to pokazuje: w tej samej sesji 0 wpisów, po restarcie 1.
5. **Tekst zapomnianego wpisu nie zostaje w bazie.** Baza zapisuje każdą zmianę w dzienniku zdarzeń, a zdarzenie zapisu wspomnienia zawiera jego tekst. Bez czyszczenia „zapomnij” usuwałoby wpis tylko z widoku, a tekst zostawałby w pliku bazy. Tak samo przy usuwaniu agenta: test bazy wymaga, żeby po usunięciu w dzienniku nie zostało nic z id agenta, a ten wymóg obejmuje też wspomnienia.
6. **Usługa emituje zdarzenia przez `AgentService`** (`agent-memory-changed`), także przy zmianach z ustawień. Hydra miał osobny `MemoryStore` w `main/index.ts` i ręczne zdarzenia; teraz IPC używa `service.memoryService`.

## Kontrakt dla UI

Na bazie `a7a60d0f0` (Hydra), ze zmianami z tego zadania:

```ts
// window.openbot.memory (opcjonalne w OpenBotDesktopApi do czasu atrapy w mock-openbot.ts)
listAgentMemories({ botId, inclusion? }): Promise<AgentMemory[]>   // najnowsza zmiana pierwsza
saveAgentMemory({ botId, text, inclusion?, memoryId? }): Promise<AgentMemory> // bez memoryId = nowy; przy limicie odrzuca z komunikatem
deleteAgentMemory({ botId, memoryId }): Promise<void>
searchAgentMemories({ botId, query, limit? }): Promise<AgentMemory[]>
getAgentSettings(botId): Promise<AgentMemorySettings>
setAgentLimit({ botId, maxMemories: number | null }): Promise<AgentMemorySettings> // null = domyślne 512

// window.openbot.channels (metody opcjonalne)
listMemories(channelId): Promise<ChannelMemory[]>                 // od najstarszego
saveMemory({ channelId, text, memoryId? }): Promise<ChannelMemory> // do 500 znaków; wpis osoby: authorBotId null
deleteMemory({ channelId, memoryId }): Promise<void>

// AgentMemory { id, botId, text, inclusion: "essential" | "searchable", createdAt, updatedAt }
// AgentMemorySettings { botId, maxMemories, customLimit, essentialCount, searchableCount,
//                       essentialInPrompt, essentialPromptBytes }
// ChannelMemory (ipc-workspace-channels.ts) { id, channelId, authorBotId: string | null, text, createdAt, updatedAt? }
// Zdarzenia: agent-memory-changed { botId, action: "saved" | "deleted", memory },
//            channel-memory-changed { channelId, action, memory }
```

**Zmiany względem `a7a60d0f0`:**
- Kanały IPC `memory:*-channel-memories` zastąpiłem kanałami `channels:list-memories` / `save-memory` / `delete-memory`.
- Doszły `memory:get-agent-settings` i `memory:set-agent-limit`.
- `CHANNEL_MEMORY_LIMITS` usunąłem; limit 500 znaków jest w `CHANNEL_LIMITS.memoryEntry`.
- `searchAgentMemories` jest teraz wymagane.

**Dla UI w ustawieniach agenta:**
- Licznik `essentialInPrompt / essentialCount` pokazuje, ile wpisów „zawsze” mieści się w budżecie.
- `essentialPromptBytes` z 8192 można pokazać jako pasek budżetu.

## Testy

| Polecenie | Wynik |
|---|---|
| `bun run typecheck` (contracts, node, renderer, storybook, api) na końcowym kodzie | exit 0 |
| Testy pamięci i kanałów na końcowym kodzie: `memory-store`, `memory-service`, `channel-memory`, `memory-inputs`, `ipc-memory`, `claude-client`, `channel-history`, `channel-store` | 8 plików, 59/59 |
| `agent-service.test.ts -t W2` (narzędzie, potem restart i blok w instrukcjach) | 1/1 |
| Kontrola mutacji: blok pamięci usunięty z `#buildDeveloperInstructions` | test W2 pada („expected … to contain 'Drink: tea, no sugar'”), po przywróceniu przechodzi |
| Całe `bun run test` na końcowym kodzie (start 02:12) | **95 plików, 717/717**, exit 0 (log: `logs\w2-test-full-final2.log`). Integracja przed zmianą miała 678 |
| Biome (`check`) na 22 zmienionych plikach | 0 błędów. Automatyczne poprawki zmieniły tylko moje linie: liczby linii w diffie wobec integracji nie urosły w cudzym kodzie |

**TDD:** kod magazynu, usługi i podłączenia pochodzi z WIP Hydry, który nie miał zaliczonych testów. Testy pisałem do zachowania z zadania, a nie do istniejącego kodu. Z tego wyszły poprawki:
- limit na agenta (wcześniej zawsze 512),
- edycja nie zmienia rodzaju wpisu, gdy rodzaj nie jest podany,
- usuwanie z warunkiem `agent_id`,
- blok przy pełnym budżecie pomija za duży wpis zamiast kończyć listę,
- liczba wpisów dostępnych przez szukanie liczy też pominięte wpisy „zawsze”.

Część tych testów nie była najpierw czerwona, bo kod już istniał. Kontrola mutacji pokazuje, że kluczowy test łapie błąd.

Nowe zachowania robiłem w kolejności test → czerwony → kod → zielony:
- usuwanie pamięci razem z agentem (`deleteAllForAgent is not a function`, potem test „deletes idle bots”: `expected { count: 1 }`),
- czyszczenie dziennika przy „zapomnij” i edycji, dla agenta i dla kanału.

## Piaskownica

Profil `Shared\cosgral-data\desktop-kapi\sandbox-w2\home` (osobne USERPROFILE, APPDATA, LOCALAPPDATA i TEMP). Atrapa Codex: `desktop-kapi\stub-codex` (kopia z K1). Dodałem w niej dwa polecenia:
- `REMEMBER ESSENTIAL: …`: atrapa woła narzędzie `openbot.remember` przez `item/tool/call`, tak jak model.
- `WHAT DO YOU REMEMBER`: atrapa odpowiada tym, co znalazła w bloku pamięci w `developerInstructions` swojego wątku.

Prawdziwego Codex ani Claude nie używałem.

| Przebieg | Kroki | Wynik | Dowód (`evidence\w2\…`) |
|---|---|---|---|
| `01-save-essential` | Nowy agent → `REMEMBER ESSENTIAL: Drink: green tea, no sugar` → stan pamięci → `WHAT DO YOU REMEMBER` w tej samej sesji | ✓ Narzędzie zwraca `success=true`, `status: saved`. W bazie jest 1 wpis `essential`, `essentialInPrompt: 1`, 677 B. W tej samej sesji instrukcje mają 0 wpisów, bo rozmowa zaczęła się przed zapisem | `01-remember.png`, `02-saved.png`, `03-same-session.png`, `drive.log` |
| `02-restart-recall` | Restart programu → `WHAT DO YOU REMEMBER` → API osoby → pamięć kanału | ✓ Po restarcie instrukcje mają 1 wpis, oznaczony jako niezaufane dane. Osoba: dodanie (`searchable`), edycja po id (to samo id), szukanie, limit 1 (nowy wpis odrzucony, oba zostają), powrót do 512, usunięcie, zdarzenia `saved, saved, deleted`. Kanał: wpis osoby `authorBotId: null`, edycja z `updatedAt`, 501 znaków odrzucone, usunięcie, pamięć prywatna agenta bez zmian | `01-after-restart.png`, `drive.log`, `cdp-drive-log.json` |
| `03-final-save`, `04-final-restart` | To samo od zera (`-Fresh`) na **końcowym kodzie** (po czyszczeniu dziennika i usuwaniu pamięci z agentem) | ✓ Wynik jak w `01`/`02`: w tej samej sesji 0 wpisów, po restarcie 1 `["Drink: green tea, no sugar"]`. Komunikat limitu: „Memory not saved: this agent keeps 2 memories and its storage limit is 1. All saved memories stay…” | `evidence\w2\03-final-save`, `04-final-restart` |

**Zamykanie:** wszystkie 4 przebiegi zamknęły się czysto (`close: clean`). Po ostatnim nie działał żaden proces programu ani atrapy (sprawdzone osobno: 0).
- W `summary.json` przebiegu `01` są 4 „pozostałe procesy”: moje testy vitest, uruchomione w tle z tego samego worktree. Od `02` filtr je pomija.
- W `03` i `04` są po 2 takie procesy: typecheck `tsc` z tła.

Profil `COSGRAL Workspace Dev` właściciela był nietknięty (`absent` przed i po).

## Nie sprawdzone

- **Piaskownica po poprawkach lint.** Przebiegi `03`/`04` szły na buildzie sprzed ostatniej zmiany: odczyt wierszy w `memory-store.ts` dostał strażniki typów zamiast `as` (wymóg Biome). Logika się nie zmieniła, a cały zestaw 717/717 przechodzi na końcowym kodzie. Piaskownicy po tej zmianie nie powtarzałem.

- **Prawdziwy Codex i Claude.** Nie sprawdziłem, czy prawdziwy Codex App Server przyjmuje nowe `developerInstructions` przy `thread/resume`. Kod Hydry zakłada, że tak, i dla bazy 0.1.11 to pole jest już wysyłane. Gdyby tak nie było, blok zadziała dopiero w nowym wątku. Do sprawdzenia jedną krótką turą prawdziwego Codex.
- **Claude end-to-end** (na tym komputerze nie ma Claude CLI). Sprawdziłem tylko listę narzędzi i system prompt w teście jednostkowym.
- **Pamięć na serwerach zdalnych.** IPC odpowiada „available only on this computer for now”, jak dla folderów i kanałów.
- **Wyszukiwanie** jest proste, po słowach (fraza plus liczba pasujących słów), bez wektorów i bez odmiany.
- **Starsze zdarzenia pamięci kanału** zapisane przed tą zmianą przez narzędzie `remember` Backendu zostają w dzienniku, dopóki wpis nie zostanie edytowany albo zapomniany. Nowe zmiany czyszczą je od razu.

## Pliki poza repo

`Shared\cosgral-data\desktop-kapi\`:
- `stub-codex\Codex Stub\codex.cjs`: dodane `REMEMBER ESSENTIAL` i `WHAT DO YOU REMEMBER`,
- `run-sandbox.ps1`: parametry `-Sandbox` i `-Group`, filtr procesów,
- `kapi-drive.mjs`: kroki `memstate`, `memperson`, `chanmem`,
- `sandbox-w2\`, `evidence\w2\`, `logs\w2-*.log`.

Program nie jest uruchomiony. Bez push.
