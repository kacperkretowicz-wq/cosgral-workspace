# Raport Tester W1-T2 — odbiór scalonej wersji w piaskownicy

**Gałąź:** `team/tester/w1-odbior`  
**Worktree:** `Shared\cosgral-wt\desktop-tester`  
**Integracja bazowa:** `5934131e3` (B1, A1, B4, W1-BE1, W1-UI1, W1-T1)  
**Data:** 12.11.2026  
**Czas:** ~2 h

## Werdykt

Odbiór w osobnej piaskownicy (stub Codex) **przeszedł dla rdzenia W1 już scalonego**: start lokalny, czat, Needs you + karta pytania, foldery trwałe, szyna stron, czyste zamknięcie.  
**Znany błąd UI potwierdzony:** po reloadzie okna backend trzyma pending, renderer gubi kartę/Needs you.  
**Nie powtórzono** żywych oczu (prawdziwy Codex) ani karty approval (atrapa nie emituje). Globalne wyszukiwanie w automacie nie znalazło znanego tekstu.

Tabela odbioru: `docs/cosgral/odbior-runda1.md`.

## Środowisko

| Element | Wartość |
|---|---|
| USERPROFILE / APPDATA / LOCALAPPDATA | `Shared\cosgral-data\desktop-tester\sandbox-w1-t2\home\...` |
| Atrapa | `Shared\cosgral-data\desktop-backend\stub-codex\Codex Stub\codex.cmd` |
| Sterowanie | CDP loopback (`cdp-drive.mjs` + `run-sandbox.ps1` w data/tester) |
| Build | `bun install` (1439 pkg), `bun run build` (electron-vite OK) |
| NSIS | **nie** uruchamiany |
| Zmienne CLAUDE/OPENBOT/… | czyszczone w skrypcie |
| Prawdziwy profil COSGRAL Dev | nietknięty (`realDevUserDataAfter: absent`) |

## Przebiegi

| Run | Cel | close / leftovers |
|---|---|---|
| `01-start-chat` | start (bez create-agent — czat padł) | clean / 0 |
| `03-chat-cards-folders` | szyna + foldery (bez modelu — czat padł) | clean / 0 |
| `04-chat-cards` | Luna + chat + ASK ME + reload + answer + folders | clean / 0 |
| `05-restart-folders` | foldery + historia po restarcie | clean / 0 |
| `06-queue-search` | dwie wiadomości FIFO + search + stopEyes | clean / 0 |

## Twierdzenia z raportów — skrót

| Twierdzenie | Status |
|---|---|
| Start bez konta / localProfile | ✓ |
| Stub odpowiada | ✓ (~1,5 s) |
| Zamknięcie bez procesów | ✓ |
| Needs you + sticky przy otwartej karcie | ✓ |
| Pending po reload (backend) | ✓ |
| Karta po reload (UI) | ✗ (znany, UI) |
| Foldery po restarcie | ✓ |
| Duplikat folderu bez agentów | ✓ |
| Oczy live + zgoda | — (nie w tej sesji; A1 ma dowód) |
| `stopEyes` / `getEyesState` | ✓ puste stany |

## Wiersze listy funkcji (2, 5, 6, 9–11, 17–19)

Szczegóły w `odbior-runda1.md`. Aktualizacja `parytet-0.68.md` tylko tam, gdzie jest dowód z tej sesji (szyna stron, foldery backend).

## Błędy (rola)

1. **UI** — reload gubi kartę pytania mimo `listPendingRequests` (W1-UI2).  
2. **UI (?)** — Search chats → „No matches” dla `unique-marker-alpha` obecnego w historii; może fokus CDP.

## Foldery — odpowiedź dla Backendu

- Duplikat: **nie kopiuje** placementów agentów (1 agent zostaje w oryginalnym zagnieżdżeniu).  
- Decyzja lidera „najpierw foldery” — bez sprzeczności z layout API; pełny order w UI DOM nie mierzony osobno.

## Poza repo

- `Shared\cosgral-data\desktop-tester\evidence\w1-t2\` (PNG, logi, summary)  
- `Shared\cosgral-data\desktop-tester\run-sandbox.ps1`, `cdp-drive.mjs`  
- `Shared\cosgral-data\desktop-tester\sandbox-w1-t2\`

Nic nie jest uruchomione. Bez push.
