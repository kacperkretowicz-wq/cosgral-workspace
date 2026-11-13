# Raport Tester W1-T3 — odbiór silnika kanałów i kart

**Gałąź:** `team/tester/w1-t3`  
**Worktree:** `Shared\cosgral-wt\desktop-tester`  
**Integracja bazowa:** `b026feb9f` (W1-BE2/BE3, W2-T1, K1)  
**Data:** 13.11.2026  
**Czas:** ~2 h

## Werdykt

Silnik kanałów i kart **przeszedł odbiór API/skryptem** w piaskownicy na atrapie Codex (`channel-codex.cjs` + `scripts/channel-sandbox-smoke.ts`): 3 agentów, limity, pauza/wznowienie, Stop, Send / Keep draft, przejęcie przeglądarki, szkic po restarcie bazy.  
**UI kanału / kart szkicu i przejęcia — nie sprawdzane w Electron** (W1-UI3). Needs you po reloadzie: backend `listPendingRequests` OK (test + wcześniejszy W1-T2); renderer nadal osobny temat UI.

## Środowisko

| Element | Wartość |
|---|---|
| USERPROFILE / APPDATA / LOCALAPPDATA | `Shared\cosgral-data\desktop-tester\sandbox-w1-t3-channels\home\...` |
| Skrypt | `scripts/channel-sandbox-smoke.ts` (uruchomiony przez Node po bundlu esbuild; Bun nie ma `node:sqlite`) |
| Atrapa | `src/backend/testing/channel-codex.cjs` |
| Build | `bun run build` OK |
| NSIS / prawdziwy Codex / Claude | **nie** |
| `run-sandbox.ps1` | poprawiony: try/finally + zabijanie leftoverów; dowód przy `driveExit=42` → 0 leftoverów |

## Tabela odbioru (spec W1 + BE2/BE3)

| Wiersz / temat | Kroki | Wynik | Dowód |
|---|---|---|---|
| 1.1 / 1.6 Kanał + lider + 2–3 agenci | `createBot`×3, `ChannelStore.create` z `leadBotId` | ✓ 3 agentów, kanał `sandbox` | `evidence.json` → `channel.memberBotIds` (3), `smoke.out.log` `agents:3` |
| 2.2 / 3.1 Zadanie z wiadomości | `TEAM SMOKE` → podzadania Facts/Verify | ✓ 3 zadania (root+2), wyniki | `tasks` TEAM/Facts/Verify `done` |
| 3.5 Wynik z wersjami | dwa `result` na root | ✓ v1 superseded, v2 aktualny | `resultVersions:2`, teksty v1/v2 |
| 1.7 Pamięć kanału | helper zapisuje | ✓ „Sandbox channel memory only” | `memory[0].text` |
| 1.8 Bez wycieku do 1:1 | odczyt rozmów botów | ✓ 0 wiadomości DM | `dmMessages:0` |
| Fast helper | `FAST SMOKE` | ✓ wynik „Stub: fast combined”, nie tekst czekania | `fastHelperWaitingTextNotResult:true` |
| 3.7–3.8 Limit 8 + paused + resume | `LIMIT SMOKE` → `paused` → człowiek `resume` | ✓ `assignmentCount:8`, potem `done` „Stub: resumed by human” | LIMIT SMOKE w `tasks` |
| 3.10 Waiting / pytanie | `QUESTION SMOKE` + `respondToPrompt` | ✓ `waiting` → `done` | QUESTION SMOKE `done` |
| 4.2 Send (karta confirm/draft) | `CARD SMOKE send` → decision `send` | ✓ | „Stub: card decision send” |
| 4.4 Keep draft + po restarcie | `CARD SMOKE keep` → `keep-draft`; reopen DB | ✓ 1 szkic w `DraftStore` po reopen | `draftCardKeptDrafts:1` |
| 4.3 Edit | nie w smoke; osobno | ✓ (jednostkowo) | `action-cards.test.ts` Edit/confirm |
| 5.1–5.4 Przejęcie | `TAKEOVER SMOKE` take-over → return → `snapshot` | ✓ ta sama karta `tab-1` | `browserTakeoverReturned:true` |
| 3.7 Stop | `STOP SMOKE` + `actOnTask(stop)` | ✓ `cancelled`, brak wyniku | STOP SMOKE `cancelled` |
| Needs you po przeładowaniu | `listPendingRequests` przy otwartych kartach | ✓ backend; UI nie w tym odbiorze | `agent-service.test.ts` „keeps open cards…”, W1-T2 UI gubi |
| Zamknięcie po błędzie drivera | celowy `cdp-drive` exit 42 | ✓ `leftoverProcesses:0` | `evidence/w1-t3/cleanup-on-drive-fail/summary.json` |

## Co zostaje do odbioru w UI (W1-UI3+)

1. Widok kanału: lista, lider, członkowie, instrukcje, historia.  
2. Chat \| Zadania na prawdziwym `channels.*` (stany w tym `paused`).  
3. Karta szkicu (draft/confirm: Send / Edit / Keep draft) i sticky Decyzja.  
4. Karta przejęcia przeglądarki w czacie + Needs you.  
5. Needs you / karta po reloadzie okna (backend trzyma; UI nadal do poprawy).

## Poprawka `run-sandbox.ps1`

Plik poza repo: `Shared\cosgral-data\desktop-tester\run-sandbox.ps1`.  
Zmiana: błąd skryptu sterującego nie pomija zamykania Electron; po close dodatkowe `Stop-Process` leftoverów; `driveExit` w `summary.json`.  
Dowód: run `cleanup-on-drive-fail` — `driveExit: 42`, `leftoverProcesses: 0`, realny profil Dev nietknięty.

## Pliki dowodów (poza repo)

- `Shared\cosgral-data\desktop-tester\sandbox-w1-t3-channels\evidence.json`  
- `Shared\cosgral-data\desktop-tester\sandbox-w1-t3-channels\smoke.out.log`  
- `Shared\cosgral-data\desktop-tester\evidence\w1-t3\channel-smoke\`  
- `Shared\cosgral-data\desktop-tester\evidence\w1-t3\cleanup-on-drive-fail\summary.json`

## Nie sprawdzone

- UI Electron dla kanałów/kart (brak widoku).  
- Decyzja `edit` end-to-end w smoke (tylko test jednostkowy).  
- Prawdziwy Codex / Claude / NSIS.  
- Archiwum zadań (Archive/Restore) w tym smoke.
