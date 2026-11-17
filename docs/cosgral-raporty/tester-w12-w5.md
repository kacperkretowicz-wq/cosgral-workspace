# Tester T-I — W5 + e2e na i18n CLI

**Wynik:** W5 **29/29 PASS** → tłumaczenie CLI (`team/ui/w12-i18n-cli`) **można scalić**. e2e **27 ok / 3 FAIL** (po poprawkach skryptu).

| Pole | Wartość |
|---|---|
| Gałąź | `team/tester/w12-w5` |
| SHA | (patrz `git log -1`) |
| Baza | `codex/cosgral-desktop` @ `b46ff76eb` + merge `team/ui/w12-i18n-cli` @ `1e82f7335` |
| GO | `GO-tester-w5.txt` (usunięty po oddaniu) |

## Zmiany w skryptach

1. `sandbox-acceptance.ts` (C01–C14): PL→EN (Download, Update, Check, Remove, Retry, Pin/Unpin, Custom path…, CLI tools, Latest, Downloaded|Custom path|System, …).
2. `sandbox-installed.ts`: `Download and continue`.
3. `sandbox-shots-w12.ts`: Biome (bez `as`/`!`, precyzyjny return type, format) + wersja T-H.
4. `sandbox-e2e.ts`: `--lang=en-US` + PL fallback first-run; tworzenie agenta przez IPC (UI-F start na formularzu); chat przez `sendMessage`.

## W5 (`COSGRAL_MODE=w5`)

29/29 ok, 0 błędów konsoli. W tym kroki CLI (C*) na angielskich napisach.

## sandbox:e2e (ostateczny przebieg)

| Stan | Liczba |
|---|---|
| ok | 27 |
| FAIL | 3 |

**FAIL:**
1. `navigation: overflow pages…` — klik w krótkim viewport (More pages).
2. `ipc: every read-only call…` — 4 wywołania: `composer.listSlashCommands`, `agentCards.getPreferences`, `threadTabs.get` (wymagają agenta), `mcpOAuth.status` (wymaga serwera); smoke nie traktuje „Choose an agent” jak needsInput.
3. `navigation: duplicate…` — timeout (etykieta Duplikuj / kopia).

**CLI / accounts / providers / wipe:** ok.

## Czy scalić i18n CLI?

**TAK** — W5 zielone na tej gałęzi; krok `cli:` w e2e też ok.

## Nie sprawdzone

Pełny `bun run check`; prawdziwe konta; OpenBot właściciela nietknięty; bez push.
