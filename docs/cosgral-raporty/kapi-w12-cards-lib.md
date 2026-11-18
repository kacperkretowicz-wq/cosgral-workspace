# KAPI-C — karty agenta + Biblioteka/Użycie/Harmonogram

Gałąź: `team/kapi/w12-cards-lib` (po `git merge codex/cosgral-desktop`, ff do `54076d666`).

## Wynik pkt 1 (kontrakt + mock)

**Stan:** kontrakt i atrapa kart agenta **już są w integracji** (Backend BE-B / BE-G: `backend-w11-agent-cards.md`, `backend-w12-cards2.md`). Podczas pauzy KAPI (503 Gemini → Cursor Auto) Backend oddał pełny zakres KAPI-C pkt 1. Nie dublowałem API.

### `window.openbot.agentCards`

| Wywołanie | Rola |
|---|---|
| `overview({botId})` | jedna lista wszystkich kart (`AGENT_CARD_IDS`) ze `available`, `count`, `summary` |
| `getPreferences` / `updatePreferences` | Chat / Advanced / Notifications (kolor, busyMessage, poziom powiadomień, skrypty lokalne…) |
| `resetSession` | reset sesji dostawcy (historia zostaje) |
| `details({botId, card})` | otwarta karta: **files**, **folders**, **usage**, **publish**, **advanced**, **notifications** |
| `publishTemplate` / `unpublishTemplate` | publikacja = szablon kreatora na tym komputerze |

Pliki: `packages/contracts/src/ipc-agent-cards.ts`, `ipc-agent-card-details.ts`; atrapa: `src/renderer/stories/mock-agent-cards.ts`.

### Testy (ten przebieg, jeden plik naraz razem w jednej komendzie vitest — tylko te 3)

| Plik | Wynik |
|---|---|
| `ipc-agent-cards.test.ts` | OK |
| `ipc-agent-card-details.test.ts` | OK |
| `mock-agent-cards.test.ts` | OK |
| **Razem** | **13/13** |

### Luki / czego nie sprawdziłem

1. Electron / Storybook — bez GO (brak znaku w piaskownicy w tej turze).
2. Silnik `agent-cards-details` / IPC w oknie — nie odpalałem ponownie (Backend już zielony w swoim raporcie).
3. Karta Użycie = `BudgetStatus` (dzień/miesiąc), bez historii 7–90 dni (to `usageReport`, pkt 2 / BE-H).
4. UI Designer: ekrany na tym kontrakcie — poza mną.

## Pkt 2 (Biblioteka / Użycie / Harmonogram) — odczyt

Też już w integracji (Backend BE-H, `backend-w12-library.md`): `window.openbot.libraryView`, `usageReport`, `schedule` (`ipc-insights.ts` + mock-insights). Nie dubluję. Po potwierdzeniu pkt 1 przez lidera mogę tylko dopiąć luki dokumentacyjne albo odbiór kontraktów.

## Ciągła praca (po „wznów”)

1. Scalono integrację `f87181e1a`.
2. **Silnik:** gdy brak portów `details`, `overview` oznacza karty files/folders/usage/publish/advanced/notifications jako `available: false` („Not available in this build”) — UI nie woła `details` w próżnię.
3. **Parytet:** wiersze 20 (wstrzymania) i 21 (Cofnij) zaktualizowane do **jest** po Backend w12-holds / w12-undo — kodowo **77,1%** (55,5/72); ostrożnie 57,6%. Decyzje „ROBIĆ” w tej tabeli = 0 h.
4. Testy: `agent-cards-details` 6/6, `ipc-queue-holds` 6/6 (łącznie 12/12 w tym przebiegu).

## Czas

Merge + weryfikacja pkt 1: ~15 min. Ciągła: ~20 min.
