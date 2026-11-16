# Tester W5-T3 — przegląd bezpieczeństwa kluczy API i kont

**Następny krok (lider):** przeczytaj tabelę; ewentualne poprawki to Backend/KK (ten review **nie** zmienia kodu produkcyjnego).

Gałąź: `team/tester/w5-security-review` (baza `team/backend/w5-be3` @ `c5c1a3191` + merge `team/kk/w5-k1` @ `0f2486e9f`).  
Zakres: tylko czytanie kodu + testy jednostkowe. **Bez Electrona, bez prawdziwych kluczy/logowań, bez odczytu plików kont.**

---

## Werdykt

Nie znaleziono wycieku pełnego klucza API do bazy jawnej, odpowiedzi IPC/preload, argumentów procesu ani `process.env` programu. Maska krótkiego klucza nie odtwarza treści. `check` ma stałe URL, `redirect: "error"` i timeout 15 s. Folder konta ma whitelist id + kasowanie junction bez follow. Odmowa `serverId !== "local"` jest na `apiKeys` i `subscriptions` (C13).

**Resztkowe ryzyka (nie krytyczne):** klucz w **env procesu dziecka** (widoczny w liście procesów — zamysł), dziedziczenie sekretów już obecnych w `process.env` hosta przy spawn, zrzuty e2e mogą pokazać maskę / URL logowania.

---

## Tabela znalezisk

| Waga | Plik:linia | Opis | Jak odtworzyć w teście |
|---|---|---|---|
| niska | `app-server-client.ts:79`, `claude-client.ts:259` | Klucz trafia do **env procesu dostawcy** (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY`), nie do argv. Na Windows/Linux env dziecka widać w narzędziach procesów — to zamierzony kanał, nie wyciek do UI/bazy. | `app-server-client-api-key.test.ts` (BE3): klucz w env atrapy, brak w argv i w `process.env` programu. |
| niska | `provider-accounts.ts:172–173` + klienci `...this.#env` | Spawn bierze `{...baseEnv\|process.env, ...apiKeyEnv}`. Sekret **już** ustawiony w środowisku użytkownika (poza magazynem) też idzie do CLI. Magazyn sam `process.env` nie ustawia (`api-key-env.ts:21–26`, test BE3). | Ustawić w teście `baseEnv.OPENAI_API_KEY` obce i sprawdzić env spawnu (nie dopisane tu; residual). |
| niska | `scripts/sandbox-e2e.ts` (~`dump`) | Zrzut PNG / ARIA może zawierać `maskedKey` (ostatnie 4) albo URL/kod urządzenia z logowania konta — nie pełny klucz API. | Nie uruchamiane (zakaz Electron). |
| niska | `api-key-store.ts:135–136` vs test BE3 | Test BE3 sprawdzał tylko `redirect: "error"` na atrapie `fetch`, nie prawdziwe podążanie za 302. Timeout: `AbortSignal.timeout(15000)` w kodzie. | Nowy: `w5-security-review.test.ts` — assert `redirect` + obecność `signal`. Prawdziwy undici/redirect: **nie sprawdzono**. |
| — | (brak wysokich) | Brak znalezionego wycieku jawnego klucza do DB / eventów / preload. | — |

### Ścieżki przeglądane punkt po punkcie

| Pytanie | Wynik | Dowód (plik:linia) |
|---|---|---|
| 1a. Baza jawna? | Nie — tylko `key_cipher` + `key_mask` | `api-key-store.ts:20–28`, `101–106`; test BE3 „never writes clear text” |
| 1b. Logi / zdarzenia? | Redakcja w `#emitError` i `redactDiagnostic` | `agent-service.ts:3516`, `app-server-client.ts:97`, `229–233`, `api-key-env.ts:30–38` |
| 1c. Odpowiedź API/preload? | Tylko `ApiKeyEntry.maskedKey` | `api-key-store.ts:205–216`, `ipc-api-keys.ts:20–31`, `preload/api-keys-api.ts:15–18` |
| 1d. Argv procesu? | Nie — tylko env | `app-server-client.ts:71–79` |
| 1e. `process.env` programu? | Nie ustawia z magazynu | `api-key-env.ts:21–26` + test BE3 |
| 1f. Błędy UI? | Stałe komunikaty check; redakcja w error event | `api-key-store.ts:140–149`, `3516` |
| 2. Masked odtworzyć? | Nie: `<12` → tylko `••••`; `≥12` → ostatnie 4 | `api-key-store.ts:62–65`; nowy test mask |
| 3. check redirect/host/timeout? | Stałe `CHECK_URLS`, `redirect:"error"`, 15 s | `api-key-store.ts:37–41`, `132–136` |
| 4. Path traversal / junction? | Id tylko `acc-[a-z0-9]{8,32}`; delete: resolve+prefix+unlink junction | `provider-accounts.ts:43`, `480–491`, `532–533`, `613`; test BE2 junction + nowy load |
| 5. C13 zdalne/telefon? | `apiKeys` i `subscriptions` (CLI + konta) rzucają przy `serverId !== "local"`; mobile IPC bez tych metod | `api-keys-ipc.ts:12`, `subscriptions-ipc.ts:125`, `164`; `mobile-ipc.ts` bez apiKeys |

---

## Co jest dobrze

1. Szyfrowanie przed zapisem; bez `canEncrypt` brak zapisu (`api-key-store.ts:90–96`).
2. Błąd boxa nie cytuje klucza (`95–96`).
3. Jeden klucz na dostawcę; odpowiedzi bez plaintext.
4. `check` nie oznacza klucza przy 429/sieci; wersjonowanie przy wymianie w trakcie check.
5. Konta: systemowych nie usuwa; `remove` → `#deleteFolder` tylko własnego folderu; junction nie follow (`480–491`).
6. Router K1 (`account-router.ts`) operuje na id kont i env folderów — bez odczytu sekretów z dysku.
7. C13: ta sama bramka lokalna co Vault/MCP dla nowych powierzchni W5.

---

## Dopisane testy (osobny commit)

Plik: `src/backend/w5-security-review.test.ts` (tylko testy).

| Test | Wynik |
|---|---|
| maska krótka/długa nie odtwarza klucza | OK |
| `check` ustawia `redirect:"error"` + `signal` | OK |
| `accounts.json` z id `../` i `/` ignorowane przy load; `CODEX_HOME` kończy się na `acc-…` | OK |
| reguła C13: remote `serverId` → błąd „this computer only” | OK (logika jak w IPC; nie Electron) |

Przebieg: `node node_modules/vitest/vitest.mjs run src/backend/w5-security-review.test.ts` → **4/4**.

---

## Czego nie sprawdzono

1. Electron, `sandbox:e2e`, prawdziwy DPAPI/`safeStorage`.
2. Prawdziwy `fetch` z HTTP 302 (czy runtime naprawdę nie wyśle nagłówka na inny host).
3. Widoczność env w menedżerze zadań na żywym CLI.
4. Treść plików wewnątrz `CODEX_HOME` / logowań ChatGPT (zakaz).
5. Czy telefon (Mobile Connect) ma osobny HTTP API poza IPC okna — w kodzie `mobile*` brak `apiKeys`/`subscriptions`.
6. Wszystkie ścieżki logów poza `#emitError` / diagnostyką Codex.
7. Gałąź BE4 / K2 (endpointy własne) — poza zleceniem; przy scaleniu K2 warto powtórzyć check pod kątem własnego URL.

---

## Commity

Zobacz `git log` na gałęzi: merge bazowy, raport, testy (SHA w wyniku kanału).
