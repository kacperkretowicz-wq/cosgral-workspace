# Tester W12 — odbiór3 (T-G, bramka jakości)

**Data:** 17.11.2026  
**Gałąź:** `team/tester/w12-odbior3` @ `ad104419c` (baza integracji `codex/cosgral-desktop` @ `4b07fe914`)  
**Metoda:** odbiór **statyczny** (kod + testy w repo). Electron / zrzuty: **czekają na `GO-tester-*.txt`** w `Shared\cosgral-sandbox` (Backend ma GO na probe).

## 1. Odbiór statyczny (pkt 1)

| Obszar | Verdict | Dowód (plik:linia / test) |
|---|---|---|
| KK w12-g2: zip-slip | **PASS** | `src/backend/zip.ts:45-50` `isSafeZipName` odmawia `..`, absolute, `\`; test `zip.test.ts:73-76` „refuses names that would leave the folder (zip-slip)” |
| KK w12-g2: limity ZIP / bomb | **PASS** | limity `INSTANCE_TRANSFER_LIMITS` `ipc-instance-transfer.ts:17-32` (archive/entry/unpacked/entries); reader `zip.ts:112+`; test `zip.test.ts:79-87` (bomb, checksum, claimedSize) |
| KK w12-g2: brak sekretów w eksporcie | **PASS** | kontrakt: „WHAT NEVER TRAVELS” `ipc-instance-transfer.ts:5-7`; silnik komentarz `transfer-service.ts:4-5`; test `transfer-service.test.ts:166-186` „carries nothing secret” — `SECRET` nie w bytes |
| KK w12-g2: import tylko nowych agentów | **PASS** | `transfer-service.ts` apply + `copyName`; test `transfer-service.test.ts:222-262` — istniejący „Chief” nietknięty, nowe „Chief (imported 2)” |
| KK w12-g2: rutyny wstrzymane | **PASS** | host `createPausedRoutine` → `paused: true` `instance-transfer-host.ts:139-150`; silnik `transfer-service.ts:301`; test `transfer-service.test.ts:255-260` + warning „created paused” |
| KK w12-g2: źródła importu | **PASS** | test `transfer-service.test.ts:491-497` — agent-zip / other-computer available, hermes false |
| KK w12-connect: `serverIds` | **PASS** | `PluginSummary.serverIds` `ipc-plugin-catalog.ts:119` + walidator `:312-313`; silnik `plugin-catalog-service.ts:386`; test `plugin-catalog.test.ts:484-493` |
| KK w12-connect: `chooseCatalogFolder` | **PASS** | kontrakt `ipc-plugin-catalog.ts:203`; IPC `plugin-catalog-ipc.ts:60-65` (dialog → `setCatalogFolder` lub null); mock test `mock-plugin-catalog.test.ts:177-178`; kanał `plugin-catalog:choose-folder` local-only |
| Backend w12-providers: katalog 18 | **PASS** | `CATALOG_PROVIDER_IDS` 18 id `ipc-provider-catalog.ts:13-32`; test `ipc-provider-catalog.test.ts:21-28`; silnik `provider-catalog.test.ts:25-34` |
| Backend w12-providers: klucze maskowane | **PASS** | `maskProviderKey` `ipc-provider-catalog.ts:445`; test kontraktu `:79-81`; silnik `provider-catalog.test.ts:36-44` — JSON odpowiedzi bez plaintextu klucza |
| Backend w12-providers: „unverified” | **PASS** | tylko `antigravity` = `documented` (`:205`); reszta launchów przez `unverified()` (`:145`); test `ipc-provider-catalog.test.ts:30-36` |
| Prywatność diff `6b43b27d6^..4b07fe914` | **PASS** | grep: brak `Users\…`, e-maili konta, tokenów produkcyjnych, ścieżek AppData\Roaming\OpenBot w diffie scalenia g2+connect+providers |

**Podsumowanie pkt 1:** KK g2 + connect + Backend providers — **PASS** (statycznie). UI wyglądu (ciemny / Nowy agent) **nie** w tym odbiorze — to UI-F + zrzuty po GO.

## 2. Skrypt zrzutów (pkt 2) — przygotowany, nie uruchomiony

| Plik | Rola |
|---|---|
| `scripts/sandbox-shots-w12.ts` | lista stanów T-G; wyjście poza repo; wymaga `GO-tester-*.txt` + env |
| `src/backend/testing/channel-codex.cjs` | atrapa emituje `phase: "commentary"` przed odpowiedzią → UI „N steps” |

**Stany do złapania (skrypt):** ciemny + jasny motyw; Nowy agent (formularz/awatary/sugestie); czat + atrapa + N steps; menu `+`; menu `@`; `/`; wyszukiwarka; Zadania; karty agenta; ustawienia serwera; Marketplace; Vault.  
**Out po GO:** `Shared\cosgral-docs\zrzuty-cosgral-17-11-b\` + porównanie z `openbot-0.71-screens\…\001-A-new-agent.png` + kontrola duplikatów (hash ×2).

## 3. Po GO — tabela porównania (do wypełnienia przy pkt 3)

Wzorzec: `Shared\cosgral-docs\openbot-0.71-screens\openbot-v0.71.0-screenshots\` (poza repo).  
Out: `Shared\cosgral-docs\zrzuty-cosgral-17-11-b\` (poza repo).

| Ekran (skrypt) | Stan oczekiwany | Uwaga / vs 0.71 |
|---|---|---|
| 01-dark-sidebar | ciemny motyw, pasek | (po GO) |
| 02-light-sidebar | jasny motyw | (po GO) |
| 03-new-agent | formularz + awatary + sugestie | wzór `001-A-new-agent.png` |
| 04-chat-nsteps | stub + „N steps” | (po GO) |
| 05-menu-plus | menu + | (po GO) |
| 06-menu-at | menu @ | (po GO) |
| 07-slash | menu / | (po GO) |
| 08-search | Ctrl+K | (po GO) |
| 09-tasks | Zadania | (po GO) |
| 10-agent-cards | karty agenta | (po GO) |
| 11-server-settings | ustawienia serwera | (po GO) |
| 12-marketplace | Marketplace | (po GO) |
| 13-vault | Vault | (po GO) |
| hash×2 | brak duplikatów PNG | (po GO) |

## 4. Czego nie sprawdziłem

- Electron / Playwright / zrzuty (brak `GO-tester-*.txt`; Backend ma probe).
- Pełnego `bun run test` / `check` / e2e / W5.
- Wyglądu UI-F (`team/ui/w12-ui2` @ `c46ecbe56`) w oknie — poza integracją `4b07fe914`.
- Prawdziwego 1Password/Bitwarden, OAuth MCP, Slack w oknie.
