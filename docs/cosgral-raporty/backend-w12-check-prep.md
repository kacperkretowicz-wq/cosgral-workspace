# Backend W12 – pełny `bun run check` w cichym oknie (BE-P)

Gałąź `team/backend/w12-check-prep` (z integracji c6a0c24cb). Zmienione: timeouty testów (bez ruszania asercji), nowy skrypt `scripts/quiet-check.ts`.

## 1. Komenda do cichego okna (kopiuj)
```
cd C:\Users\x1 Yoga\OpenBot\Shared\cosgral-desktop
set PATH=C:\Users\x1 Yoga\OpenBot\Shared\tools\bun;C:\Users\x1 Yoga\OpenBot\Shared\tools\node;C:\Users\x1 Yoga\OpenBot\Shared\tools\git\cmd;%PATH%
set COSGRAL_TEST_TIMEOUT_SCALE=3
node scripts/quiet-check.ts --out C:\Users\x1 Yoga\OpenBot\Shared\cosgral-sandbox\check-final
```
- Skrypt robi **te same 11 kroków co `bun run check`**, w tej samej kolejności, ale każdy ma własny log (`<krok>.log`) i czas, idzie dalej po czerwonym kroku (`--stop` zatrzymuje) i na końcu drukuje tabelę: krok, OK/RED, sekundy, **przyczyna** (timeout = maszyna, asercja = program). Kod wyjścia 0 tylko, gdy wszystkie 11 kroków zielone.
- Przed startem czeka do 20 min na spokojną maszynę (procesor < 50%, wolne ≥ 2 GB) i zapisuje obciążenie (`sandbox-load.ts`). `COSGRAL_SKIP_LOAD_WAIT=1` pomija.
- `COSGRAL_TEST_TIMEOUT_SCALE=3` mnoży limity: globalne vitest (`testTimeout` 5 s, `hookTimeout` 10 s, `teardownTimeout` 10 s) i limity wolnych zestawów (`suiteTimeout`, 19 plików). Bez zmiennej nic się nie zmienia.
- Opcje: `--only a,b` (tylko te kroki), `--skip a,b`, `--out <folder>`. Przykład powtórki jednego czerwonego kroku: `node scripts/quiet-check.ts --only test`.
- Krok `test` to `vitest run --maxWorkers=1` (pliki i tak idą po kolei: `fileParallelism: false`; jeden proces = mniej pamięci i brak „Timeout terminating forks worker”).

## 2. Kolejność i czas na spokojnej maszynie
Źródła: zielony przebieg 16.11 (`leader-check9.log`: 253 pliki, 1703 testy), przebieg 17.11 (`leader-int14.log`: 330 plików, 2317 testów, 901 s), moje pomiary 18.11.

| # | Krok | Polecenie | Czas (spokojnie) | Skąd liczba |
|---|---|---|---|---|
| 1 | check:ui | `bun scripts/ui-foundation-check.ts` | ok. 1 s | pomiar |
| 2 | lint | `biome check .` | 45–55 s | logi (43–53 s) |
| 3 | typecheck | contracts, node, renderer, storybook, api, mobile-app | ok. 3 min | pomiar 184 s |
| 4 | test | `vitest run` | **15–17 min** (to 70% całości) | logi 901–989 s |
| 5 | test:storybook | `vitest --config vitest.storybook.config.ts run` (Chromium) | 2,5–4 min | logi 148–246 s |
| 6 | test:visual | `vitest --config vitest.visual.config.ts run` | ok. 15 s | logi |
| 7 | test:api | `bun run --cwd apps/auth-api test` | 2–10 s | pomiar 5 s |
| 8 | test:browser | `bun scripts/browser-smoke.ts` (Electron) | ok. 1 min | nie zmierzone czysto |
| 9 | api:build | build auth-api | < 1 min | nie zmierzone |
| 10 | build-storybook | `storybook build` | 1,5–2 min | log: 1 m 40 s |
| 11 | build | `electron-vite build` | ok. 0,5–1 min | logi (kilkanaście sekund na część) |

**Razem ok. 25–30 min** na spokojnej maszynie. Pod obciążeniem (7,8 GB, procesor 100%) krok `test` trwał 1894 s (przebieg 18.11), a pojedyncze pliki 10–60× dłużej.

## 3. Testy wolne lub wrażliwe na obciążenie
Liczby „obciążona maszyna” pochodzą z `lead-vitest-b1e28.log`, `lead-vitest-55ac3.log`, `leader-int18.log`; „spokojnie” z moich uruchomień 18.11.

| Plik | Spokojnie | Obciążona maszyna | Limit przed → teraz (skala 3) | Objaw |
|---|---|---|---|---|
| `agent-service.test.ts` (85 testów) | 54 s | 425 s, 4 padły (po 20–21 s każdy) | 20 s → 60 s | timeout testu |
| `agent-service-fallback-accounts.test.ts` (10) | 9 s (25 s z importem) | 214 s, 7 padło (20–28 s każdy) | 30 s → 90 s | timeout |
| `acp-login.test.ts` (15) | 3 s | 182 s, 7 padło (12–41 s) | 30 s → 90 s | timeout |
| `ProvidersFallbackW5.test.tsx` (7) | kilka s | 19,7 s, 1 padł (7,1 s) | 5 s → 15 s (globalnie) | timeout |
| `acp-client`, `marketplace`, `skill-tools` | krótkie | „Timeout terminating forks worker” | teardown 10 s → 30 s | zamykanie procesu |
| pozostałe `agent-service-*.test.ts` (access, accounts, acp-login, budgets, context-threads, endpoints, isolation, message-actions, plans, queue-holds, subagents, threads) | 10–30 s każdy | nie padały, ale mają ten sam limit 20–30 s | 20/30 s → 60/90 s | ryzyko |
| `claude-auth-status`, `cli-timeout`, `mcp-manager`, `mcp-tool-filter` | krótkie | — | 30 s → 90 s | ryzyko |
| `isolation-host`, `w2-*.acceptance`, `isolation-service`, `provider-accounts`, `App.test` | — | własne limity 15–120 s, bez zmian | bez zmian | — |

## 4. Co zmieniłem (bez ruszania asercji)
1. `src/backend/testing/timeouts.ts`: `suiteTimeout(windows, other)` = dotychczasowy limit × `COSGRAL_TEST_TIMEOUT_SCALE` (domyślnie 1). 29 miejsc `process.platform === "win32" ? A : B` w 15 plikach oraz 4 limity `{ timeout: 30_000 }` zamienione na `suiteTimeout(...)`. Test helpera: 3/3.
2. `vitest.config.ts`: `testTimeout`, `hookTimeout`, `teardownTimeout` = wartości domyślne vitest × skala. Bez zmiennej identycznie jak przed zmianą.
3. `scripts/quiet-check.ts` (opis wyżej).

## 5. Jak odróżnić środowisko od regresji
1. **Środowisko**, gdy log mówi `Test timed out in …ms`, `Hook timed out`, `Timeout terminating forks worker`, `did not answer within 20 s`, a plik **sam, na spokojnej maszynie, przechodzi**. Skrypt oznacza to „timeout (the machine)”.
2. **Regresja**, gdy w logu jest `AssertionError`, `TypeError`, `ReferenceError`, błąd `TS…` albo „Formatter would have printed” (Biome). To nie zależy od obciążenia. Skrypt: „assertion or type error (the program)”.
3. Test rozstrzygający: `set COSGRAL_TEST_TIMEOUT_SCALE=3` i `bun x vitest run <plik>` pojedynczo na spokojnej maszynie (`sandbox-load` mówi, czy jest spokojna). Zielone = środowisko; czerwone z tym samym objawem = produkt.
4. Dwa realne błędy z tej nocy dla porównania: `ReferenceError: queueHoldOf is not defined` (zły import) i `no such table` przy `stop()`: to były asercje/wyjątki, nie timeouty, i wyszły w pierwszym uruchomieniu pliku.
5. Wskaźniki obciążenia: `describeLoad` w każdym kroku (procesor %, wolna pamięć). Poniżej 1,5 GB wolnej pamięci wyniki są niewiarygodne: zamknąć agentów KK/UI (każdy trzyma proces `claude`) i powtórzyć krok.

## 6. Nie sprawdzone
1. Pełny przebieg `quiet-check.ts` (to jest cały `check`, ciężki, zostawiony na ciche okno). Sprawdziłem na sucho dwa lekkie kroki (`check:ui`, `test:api`): tabela i logi działają.
2. Wskazówka „timeout/asercja” to dopasowanie tekstu logu; może się pomylić przy mieszanym logu (wtedy pisze „timeout x N and assertion x M”).
3. Czasy kroków 8, 9, 11 są szacunkiem z logów, nie osobnym pomiarem.
4. Testy storybook i visual mają własne konfiguracje (`vitest.storybook.config.ts`, `vitest.visual.config.ts`), których skala nie obejmuje.
