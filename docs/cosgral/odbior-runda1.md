# Odbiór rundy 1 / W1-T2

**Data:** 12.11.2026  
**Gałąź:** `team/tester/w1-odbior`  
**Integracja:** `codex/cosgral-desktop` @ `5934131e3`  
**Piaskownica:** `Shared\cosgral-data\desktop-tester\sandbox-w1-t2` + atrapa Codex (`Shared\cosgral-data\desktop-backend\stub-codex`)  
**Dowody:** `Shared\cosgral-data\desktop-tester\evidence\w1-t2\` (poza repo)  
**Build:** `bun install` + `bun run build` OK; Electron Dev w piaskownicy (bez NSIS).

Legenda wyniku: ✓ OK · ✗ fail · ~ częściowo · — nie uruchomione.

| Wiersz / twierdzenie | Kroki | Wynik | Dowód |
|---|---|---|---|
| Start bez logowania (B1) | Fresh sandbox → okno; `localProfile: true`, stub Codex `available` | ✓ | `01-start-chat`, `04-chat-cards` / `summary.json` |
| Odpowiedź agenta (atrapa) | create-agent → Luna → chat „hello W1-T2 unique-marker-alpha” | ✓ stub ~1,5 s | `04-chat-cards` `chat:02-hello` `replied=true` |
| Czysty koniec | CloseMainWindow | ✓ `close=clean`, leftovers=0 | wszystkie `summary.json` |
| Wiersz 2 · szyna stron | click Schedule → Coming soon; click Agents → lista wraca | ✓ | `03-chat-cards-folders` `09-schedule` / `10-agents-back`; `06` `pageButtons` |
| Wiersz 5 · myśli / praca | Podczas ASK ME UI pokazuje „Thinking”; activity potem `waiting`/`idle` | ~ (working w activity API słabo widoczne w CDP; UI „Thinking”) | `04` `06b-ui-reload` text „Thinking”; `05-card-open` activity |
| Wiersz 6 · czeka na Ciebie | ASK ME → NEEDS YOU 1 + Needs you + activity `waiting` | ✓ | `04-chat-cards` `05b-needs-you.png`, `w1state:05` |
| Wiersz 9 · rozmowa + restart | Chat + odpowiedź; restart bez Fresh → historia i marker | ✓ | `05-restart-folders` `01-ui` |
| Wiersz 10 · karta pytania | ASK ME → karta „Which plan…”, odpowiedź Pro → stub kontynuuje | ✓ | `04` `05-card-open` / `08-after-answer` |
| Wiersz 11 · karta zatwierdzenia | Atrapa nie emituje approval | — | stub tylko `ASK ME` |
| Wiersz 17 · kolejka | send q1 + q2 bez czekania → obie w historii w kolejności | ~ (FIFO OK; `getQueue` null po zakończeniu; restart w trakcie kolejki nie sprawdzany) | `06-queue-search` |
| Wiersz 17 · kolejka po restarcie | Restart po zakończonych wiadomościach | ~ historia OK; aktywna kolejka nie była w locie | `05-restart-folders` |
| Wiersz 18 · search w rozmowie | Osobnego UI ChatSearch nie sterowano w CDP | — | — |
| Wiersz 19 · search globalne | Search chats → dialog; type markera → „No matches” | ✗ / do wyjaśnienia (UI fokus?) | `06` `03-search` / `04-search` |
| Needs you + sticky Decyzja | Przed reload: Needs you + pytanie w UI | ✓ | `04` `05b-needs-you` |
| Karta po reload okna | Backend `pending=1`, UI `questionCardVisible=false`, brak NEEDS YOU | ✗ znany błąd **UI** (W1-UI2) | `04` `w1state:06-after-reload` |
| Foldery po restarcie | create/nest/duplicate/rename → restart → 4 foldery, 1 placement | ✓ | `05` `w1state:01-folders-after-restart` |
| Duplikat folderu a agenci | Duplicate Sales → Sales copy + Leads; placement tylko w oryginale | ✓ **nie kopiuje agentów** | `03`/`04` `folders` layout |
| Oczy + zgoda + Stop | Atrapa bez tools oczu; `getEyesState`/`stopEyes` istnieją (puste) | — live (real Codex = konto właściciela); API ✓ | `06` `stopeyes`; A1: `evidence\b1\a1-eyes-final` |
| Profil lokalny | Po setup brak Sign out w shellu; na ekranie SETUP widać e-mail+Sign out | ~ | `01-start-chat` vs `04` ready |

## Błędy z odtworzeniem

1. **UI — karta pytania znika po reloadzie okna**  
   Kroki: ASK ME → karta widoczna → `location.reload()`.  
   Backend: `listPendingRequests().length === 1`, activity `waiting`.  
   UI: brak karty / Needs you.  
   Rola: **UI** (W1-UI2: `listPendingRequests` przy starcie + `*-resolved`).

2. **UI/sterowanie — globalne Search chats nie znalazło znanego tekstu wiadomości**  
   Kroki: mieć wiadomość z `unique-marker-alpha` → Search chats → wpisać marker.  
   Wynik: „No matches” mimo że tekst jest w rozmowie.  
   Rola: **UI** (albo fokus pola w teście CDP — do potwierdzenia ręcznie).

## Foldery (pytanie Backendu)

Z API w piaskownicy (nie z UI 0.68): **duplikat nie kopiuje agentów** (1 placement na oryginalnym Leads). Kolejność folderów w layout: najpierw foldery root, potem zagnieżdżone; UI pasek „foldery przed agentami” — pełny DOM order nie mierzony; decyzja lidera bez sprzeczności z API.
