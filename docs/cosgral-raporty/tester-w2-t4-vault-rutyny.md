# Raport Tester W2-T4 — odbiór Vault oraz rutyn i webhooków

**Gałąź:** `team/tester/w2-t4`  
**Worktree:** `Shared\cosgral-wt\desktop-tester`  
**Integracja bazowa:** `ad9a6a5b6` (zadanie wskazywało `105089d1a`; w worktree tip ma też tabele/pliki)  
**Data:** 13.11.2026  
**Czas:** ~2 h

## Werdykt

Vault i rutyny/webhooki **przeszły odbiór API** w piaskownicy (`src/backend/w2-t4-vault-routines.acceptance.test.ts` + `scripts/w2-t4-vault-routines-smoke.ts`): **21/21** checks, `evidence.ok: true`.  
Wspierające unit: `vault-store` + `vault-tools` + `routine-manager` + `webhook-receiver` → **31/31**.  
**UI Vault / Harmonogram — nie ma.** **Prawdziwy Codex / Claude:** nie używane (zadanie).  
**Electron fill na żywo:** nie powtarzane w tej sesji; Backend ma `ok: true` w `Shared\cosgral-data\desktop-backend\sandbox-w2-vault\evidence.json` — ten odbiór pokrywa te same zachowania przez atrapę przeglądarki (`typeSecret`).

## Środowisko

| Element | Wartość |
|---|---|
| Profil | `Shared\cosgral-data\desktop-tester\sandbox-w2-t4-vault-routines` |
| Test | vitest `@vitest-environment node` → acceptance (1/1) |
| Skrypt | `scripts/w2-t4-vault-routines-smoke.ts` |
| SecretBox | atrapa szyfrująca (jak MCP/Vault testy) |
| Rutyny | `RoutineManager` + `FakeRunner` + podstawiony zegar |
| Webhook | `handleWebhook` (Standard Webhooks) na `127.0.0.1` URL |

## Tabela odbioru — Vault (spec-w2 §3)

| Punkt | Kroki | Wynik | Dowód |
|---|---|---|---|
| Zapis login / karta / kontakt / API key (+ TOTP przy loginie) | `VaultStore.save` ×4 | ✓ | `vault-save-kinds` |
| Lista bez sekretów | `list()` JSON | ✓ | `vault-list-no-secrets` |
| Agent loguje na lokalnej stronie bez ujawnienia | `fill_login` + `fill_totp` na `http://127.0.0.1:41727` | ✓ hasło i kod w `typeSecret`, brak w wyniku agenta | `vault-fill-local-no-reveal` |
| Login nie na obcej stronie | fill na `evil.example` | ✓ odmowa | `vault-foreign-site` |
| Brak pozycji → Needs you | `request_vault_item` → `vault-request` mode=add | ✓ | `vault-request-needs-you` |
| Po odpowiedzi osoby | `respond` + wynik provided bez sekretu | ✓ | `vault-request-provided` |
| Karta dopiero po potwierdzeniu | `fill_card` keep-draft | ✓ not-confirmed, 0 type | `vault-card-needs-confirm` |
| Po Confirm | `fill_card` send | ✓ filled; preview `•••• 4242` | `vault-card-after-confirm` |
| Sekret niejawny w bazie | skan SQLite | ✓ 0 hits | `vault-secret-not-in-db` |
| Po restarcie | close DB → reopen | ✓ hasło + TOTP kod OK | `vault-after-restart` |

## Tabela odbioru — rutyny i webhooki (spec-w2 §4)

| Punkt | Kroki | Wynik | Dowód |
|---|---|---|---|
| Strefa + nextRunAt | interval 1 min, `Europe/Warsaw` | ✓ next `04:01Z` | `routine-timezone-next` |
| Co minutę 2 przebiegi | tick + finish ×2 | ✓ 2× `done`, nagłówek `[COSGRAL routine run]` | `routine-every-minute-2` |
| Bez nakładania | drugi tick przy trwającym | ✓ `skipped` still running | `routine-no-overlap` |
| Po restarcie lista zostaje | reopen manager | ✓ | `routine-persists` |
| Bez nadrabiania | start po 10 min offline | ✓ `skipped` „was not running”; 0 tur | `routine-no-catch-up` |
| Sekret webhooka raz | `create` person | ✓ `whsec_…`; brak w `list` | `webhook-secret-once` |
| Dobry podpis | POST body + HMAC | ✓ 202 + untrusted payload w turze | `webhook-good-202` |
| Zły podpis | zła signature | ✓ 401 | `webhook-bad-401` |
| > 64 KiB | body limitu | ✓ 413 | `webhook-413` |
| Powtórzony webhook-id | ten sam id | ✓ 200, bez nowej tury | `webhook-dedupe` |
| Sekret nie w bazie | skan SQLite | ✓ 0 hits | `webhook-secret-not-in-db` |

Pełny JSON: `Shared\cosgral-data\desktop-tester\sandbox-w2-t4-vault-routines\evidence.json`. Kopia: `evidence\w2-t4\`.

## Do odbioru w UI

1. Panel Vault: lista podsumowań, formularze login/karta/kontakt/API/TOTP, bez „pokaż sekret” (API go nie zwraca).  
2. Needs you: karta `vault-request` (add / choose) + `respondToRequest`.  
3. Confirm przed wpisaniem karty płatniczej (już ten sam mechanizm kart).  
4. Strona Harmonogram/Rutyny: lista, nextRunAt, pauza, historia przebiegów, „uruchom teraz”.  
5. Webhook: URL loopback, sekret pokazany raz (`create` / `regenerateSecret`), statusy 202/401/413.  
6. Atrapa `mock-openbot.ts`: `vault.*` i `routines.*` (jeśli brak).

## Nie sprawdzone

- Ponowny Electron `vault-electron-smoke` w tej sesji (jest dowód Backendu).  
- Prawdziwy Codex / Claude.  
- UI Electron.  
- Konektory 1Password/Bitwarden/Proton (W3).  
- Publiczny adres webhooka (W3).  
- Filtry JSON Pointer / 429 / `[SILENT]` (KAPI: nie zrobione).
