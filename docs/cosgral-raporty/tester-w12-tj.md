# Tester T-J / T-K — typecheck shots + 3 FAIL e2e

Gałąź: `team/tester/w12-tj` (baza integracja `98d3553cb` / lider podawał `49f990a22` + UI motion). Bez Electrona (czekam na GO). Bez push.

## 1. Typecheck `sandbox-shots-w12.ts`

- Przyczyna: `page.evaluate(async () => window.openbot…)` — Node typecheck nie zna `Window.openbot`.
- Fix: string evaluate + `Reflect.get(window, "openbot")` (bez asercji typów).
- Kontrole: `bun x biome check --write scripts/sandbox-shots-w12.ts`, `bun run typecheck:node`.

## 2. Diagnoza 3 FAIL (log `e2e-ti4`, evidence `fail-11` / `fail-17` / `fail-19`)

| Krok | Plik:linia | Przyczyna | Rola |
|---|---|---|---|
| overflow pages | `sandbox-e2e.ts` ~665 | `page.setViewportSize(1100×400)` **nie zmienia** rozmiaru BrowserWindow → szyna dalej „wysoka”, brak „More pages” (aria `fail-11`: wszystkie strony widoczne, zero overflow). Dodatkowo (dla UI): `PageRail.measure` bierze `.page-rail-list > button` (przy ContextMenu może nie trafić) i **nie odejmuje** wysokości logo — gdyby okno było krótkie, pomiar i tak jest zawyżony. | **Tester** (skrypt: `setContentSize` na prawdziwym oknie). **UI** (twardnienie measure: `.page-rail-button` + odejmij logo). |
| ipc getters ×4 | `sandbox-e2e.ts` ~917 | `composer.listSlashCommands`, `agentCards.getPreferences`, `threadTabs.get` → „Choose an agent”; `mcpOAuth.status` → „Choose a server”. To walidacja IPC (UI-F / brak wybranego agenta lub serwera MCP), nie crash. Regex `needsInput` ich nie łapał. | **Tester** (dopisać do `needsInput`). |
| navigation duplicate | `sandbox-e2e.ts` ~954 | e2e startuje `--lang=en-US`, skrypt klikał **„Duplikuj”** i szukał PL „Kopia gotowa…”. Na `fail-19` menu ma **Duplicate** (EN). Nazwa kopii nadal `… kopia` (silnik). | **Tester** (EN: Duplicate + „Copy ready…”). |

Stałe 36 px przycisków szyny **nie** są bezpośrednią przyczyną tych 3 FAIL (overflow padał, bo okno w ogóle nie kurczyło się).

## 3. Naprawy skryptu (ten commit)

1. Overflow: `BrowserWindow.setContentSize(1100, 400)` + viewport, restore w `finally`.
2. IPC: `needsInput` += `Choose an agent|Choose a server`.
3. Duplicate: menuitem `Duplicate`, tekst `/Copy ready\..*Memory, history/`.

## 4. Dla UI Designera (regresja produktu — nie blokuje GO skryptu)

1. `PageRail.tsx` `measure`: selektor `.page-rail-button` (nie `> button`), odejmij wysokość `.page-rail-logo` od `available`.
2. Po GO Tester sprawdzi overflow przy prawdziwym krótkim oknie; jeśli „More pages” dalej brak — to Wasza poprawka.

## 5. Czekam na GO

`GO-tester-*.txt` → ponownie `sandbox:e2e` + W5 + zrzuty (maskotki UI-J).
