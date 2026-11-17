# Tester W12 — odbiór2 (T-E, bramka jakości)

**Data:** 17.11.2026  
**Gałąź:** `team/tester/w12-odbior2` @ `9b571a8ab` (integracja `codex/cosgral-desktop`)  
**Metoda:** odbiór **statyczny** (kod + testy jednostkowe w repo). Electron / `COSGRAL_MODE=w11` / pixel-diff: **czekają na GO-*.txt** (brak znaku w `Shared\cosgral-sandbox`).

## 1. Odbiór statyczny (pkt 1)

| Obszar | Verdict | Dowód | Adresat |
|---|---|---|---|
| Side question (wykonawca) | **PASS** | `main/index.ts` ~1767: `ask: (run) => service.runSideQuestion(run)`; `agent-service.ts` `runSideQuestion`; test `agent-service.test.ts` „W12: a side question…”; `side-question-runner.ts` + 6 testów | — |
| agentCards silnik + IPC | **PASS** | `registerAgentCardsIpc` w `main/index.ts` ~955; `AgentCardsService` ~1779–1796; testy `agent-cards.test.ts` | — |
| serverSettings 14 sekcji | **PASS** | `SERVER_SETTINGS_SECTIONS` 14 id w `ipc-server-settings.ts:10-25`; IPC `server-settings-ipc.ts`; silnik `server-settings.ts`; Members/Sites = `unavailable` | — |
| Slack tylko DM | **PASS** | `slack-driver.ts` ~179 `channel_type === "im"` → `kind: "private"`; most `messenger-bridge.ts:414-417` ignoruje `kind !== "private"`; testy `slack-driver.test.ts` (kanał C… odrzucony) | — |
| Slack tokeny nie wracają | **PASS** (kod/test) | Sterownik: tokeny write-only, błędy = stałe zdania (`MESSENGER_FAILURE_SENTENCES`); lokalne IPC odmawia remote (`local-only-ipc.test.ts`) | — |
| OAuth MCP | **PASS** (kod) | `mcp-oauth-ipc.ts` + `McpOAuthService` w `main/index.ts` ~977/1503; 5 kanałów `mcp-oauth:`; raport `kk-w12-oauth.md` | — |
| UI effort w nagłówku | **PASS** | `Conversation.tsx` ~1598 `header-effort` obok modelu (`7a210e611`) | — |
| UI menu + (skill / side) | **PASS** | `Conversation.tsx` ~2273–2309: Attach files / Use a skill / Side question; `SideQuestionPanel.tsx` | — |
| UI `@` → searchMentions | **FAIL** w integracji | Na `9b571a8ab` brak commita UI-E; w kanale UI-E `fa1789faf` na `team/ui/w12-ui2` (nie scalone) | UI (po merge) / Lider |
| UI „N steps” | **niejasne** | UI-E zgłasza `0df6f56a1` poza integracją; w integracji nadal stary chrome | UI / Lider |
| UI agentCards ekran | **FAIL** w integracji | Brak sekcji w rendererze na `9b571a8ab`; UI-E `79af15cf5` na `w12-ui2` | UI |
| UI Vault/Apps ekrany | **FAIL** | Brak podpięcia `vaultConnectors` / `pluginCatalog` w UI na integracji | UI |
| Prywatność diff `6752d67a1..9b571a8ab` | **PASS** | Brak `Users\…`, e-maili konta, tokenów produkcyjnych; trafienia grepa = tylko „ask-first” (poziom dostępu) | — |

**Podsumowanie pkt 1:** BE/KK scalone **PASS**; UI chrome P0 częściowo **PASS** (effort, menu +); `@` / karty / Vault/Apps **FAIL** do scalenia UI-E.

## 2. Spec ekranów (pkt 2)

→ `docs/cosgral/spec-w12-ekrany.md` (Tasks↔chat, 14 sekcji serwera, Marketplace 3 zakładki, ustawienia aplikacji).

## 3. Zamknięte FAIL z T-D (`tester-w12-odbior.md`)

| Stary FAIL | Stan teraz | Uwaga |
|---|---|---|
| agentCards IPC/silnik w oknie | **zamknięty** | Silnik + IPC w integracji |
| effort tylko w ustawieniach | **zamknięty** | Effort w nagłówku |
| menu Attach bez skill/side | **zamknięty** | Menu 3 pozycje |
| OAuth MCP poza integracją | **zamknięty** | Scalone (`c87b04d74`) |
| `@` searchMentions | **otwarty** | Dopiero na `w12-ui2` |
| Karty/Vault/Apps UI | **otwarty** | UI-E w toku |
| Side question „not connected” jako jedyny stan | **zamknięty** (API) | Executor wpięty; UI nadal pokazuje failed gdy brak odpowiedzi |

## 4. Czego nie sprawdziłem

- Brak `GO-*.txt` → **nie** uruchamiałem `COSGRAL_MODE=w11`, e2e, Electron, pixel-diff / `ui-fidelity`.
- Prawdziwego Slacka / OAuth MCP w oknie.
- Gałęzi `team/ui/w12-ui2` poza raportami kanału (tylko odczyt integracji).
- Pełnego `bun run check` (robi lider).
