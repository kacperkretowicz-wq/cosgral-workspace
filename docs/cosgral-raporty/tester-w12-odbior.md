# Tester W12 — kroki W11 + odbiór statyczny (T-D)

**Data:** 17.11.2026  
**Gałąź Testera:** `team/tester/w12-steps` (merge `codex/cosgral-desktop` @ `6752d67a1`)  
**Gałąź UI (odczyt):** `team/ui/w11-ui1` @ `a20241d8e`  
**Kryteria UI:** `docs/cosgral/odbior-071.md` · odniesienie poza repo: `Shared\cosgral-docs\openbot-0.71-ui\main-shell\`  
**Kroki okna:** `COSGRAL_MODE=w11` → `scripts/sandbox-w11-acceptance.ts` (`docs/cosgral/odbior-w11.md`) — **nie uruchamiane** (brak GO; pełny check lidera do ~14:40).

## 1. Kroki odbioru w oknie (gotowe do GO)

| ID | Temat | Oczekiwanie | Uwaga przed GO |
|---|---|---|---|
| W11-0 | Setup | First run EN, Assistant | `--lang=en-US` + `cleanEnvironment()` |
| W11-1 | Thread tabs | `threadTabs.get` + pasek Threads | Silnik w integracji (engines) |
| W11-2 | Search tabs | `search.query` + All/Agents/…/Routines | Ctrl+K |
| W11-3 | `/` | listSlashCommands ≥ compact/new-thread/side + listbox | UI @ `a20241d8e` |
| W11-4 | `@` | `searchMentions` API | UI nadal filtruje lokalnych botów — listbox soft |
| W11-5 | Side question | `failed` + `/not connected/i` | PASS dopóki BE nie podłączy wykonawcy |
| W11-6 | agentCards | 14 kart w stałej kolejności + preferences | **IPC main brak** — krok padnie do czasu rejestracji (BE-D) |
| W11-7 | Vault connectors | 3 konektory, bez sekretów w statusie | KK atrapa/silnik w integracji |
| W11-8 | Marketplace Apps | `pluginCatalog.info` + `plugins[]` | KK; katalog folder poza repo |

## 2. Odbiór statyczny kontraktów / silników (Backend + KK)

| Obszar | Dowód w integracji `6752d67a1` | Verdict | Adresat |
|---|---|---|---|
| U3 search | kontrakt `ipc-search.ts`, silnik `search-service.ts`, IPC `composer-ipc`, preload | **PASS** (kod) | — |
| U6 threadTabs | kontrakt + `thread-tabs.ts` + IPC + UI ThreadTabs | **PASS** (kod) | — |
| U5 `/` + `@` | `composer-service` listSlashCommands / searchMentions; IPC 4 kanały | **PASS** (kod) | UI: `@` jeszcze bez `searchMentions` |
| U4 side question | stany + błąd „not connected” bez executor | **PASS** (oczekiwany stan) | Backend (wykonawca BE-D) |
| agentCards | kontrakt + atrapa + preload; **brak** `register*Ipc` / silnika w `main` | **FAIL** (okno) / **PASS** (kontrakt) | Backend |
| Vault connectors | kontrakt + IPC 8 + silnik 1P/BW; Proton Pass stała porażka; brak wpięcia w `agent-service` | **PASS** (atrapa/API) · **niejasne** (agent tools) | Backend (szew narzędzi) |
| Marketplace Apps (`pluginCatalog`) | kontrakt + IPC 8 + loader; OAuth `link` luka (226/251) — KK OAuth MCP osobno | **PASS** (API atrapa) · **niejasne** (OAuth w oknie) | UI (ekran) / KK (OAuth) |
| mcpOAuth (KK-C) | na `team/kk/w12-oauth` — **nie** w `6752d67a1` | **niejasne** (poza tą integracją) | Lider (merge) |

## 3. Odbiór UI `team/ui/w11-ui1` @ `a20241d8e` vs `odbior-071` + main-shell

Metoda: tylko kod/testy (bez Electrona, bez pixel-diff).

| Ekran / kryterium | ID | Verdict | Różnice | Adresat |
|---|---|---|---|---|
| Tokeny / sidebar (T-B) | S-SIDEBAR | **PASS** | bez zmiany względem T-B | — |
| Zakładki wątków | S-CHAT-L1 część | **PASS** (kod) | `ThreadTabs` + `threadTabs`; brak px vs extract | Tester po GO |
| Wyszukiwarka + zakładki | S-SIDEBAR / S-CHAT | **PASS** (kod) | `GlobalSearch` All…Routines + `search`; napisy EN przez `t()` | Tester po GO |
| Polecenia `/` | S-CHAT-F | **PASS** (kod) | `ComposerEditor` + `listSlashCommands` | — |
| Pasek modelu + effort w nagłówku | S-CHAT-L1 | **FAIL** | `ProviderModelPicker` jest w `conversation-header`; **effort/Reasoning tylko w panelu ustawień**, nie obok modelu w nagłówku (extract 60: model+Wysiłek razem) | UI Designer |
| Menu załączników | S-CHAT-F2 | **FAIL** | Tylko „Attach files”; brak „Use a skill” / „Side question” (UI-D P0) | UI Designer |
| `@` z `searchMentions` | S-CHAT | **FAIL** | Mention picker filtruje `props.bots`, nie woła `composer.searchMentions` | UI Designer |
| „1 step” / kroki planu | S-CHAT-L2 | **niejasne** | `PlanPanel`: „X of Y steps finished” — nie ma zwartego chipa „1 step” jak na zrzutach 0.71; brak pary px | UI / Tester po GO |
| Zadania (Chat \| Tasks) | S-TASKS | **PASS** (kod kanału) | `ChatTasksSwitch` + `ChannelView` tab Tasks; brak dowodu wyglądu vs main-shell zadań | Tester po GO |
| Karty agenta / Vault UI / Apps UI | P1 | **FAIL** | Brak podpięcia `agentCards` / `vaultConnectors` / `pluginCatalog` w rendererze UI | UI Designer |

**Podsumowanie UI:** 5 PASS (kod) · 4 FAIL · 1 niejasne · px/Electron: nie sprawdzone.

## 4. Czego nie sprawdziłem

- Electron, `sandbox:e2e`, W5, W11 (brak GO; ciężki check u lidera).
- Pixel-diff / `ui-fidelity` na żywej app vs `main-shell`.
- Storybook, pełny `bun run check`, prawdziwe konta Vault/MCP.
- Gałęzi UI nowszej niż `a20241d8e` (UI-D w toku).
- Silnika agentCards i OAuth MCP po scaleniu KK `6a20f95a9`.
