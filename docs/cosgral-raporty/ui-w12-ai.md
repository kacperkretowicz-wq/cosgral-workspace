# UI-AI — chat chrome launcher, Agent settings Brain/Knows, Tasks hero (+ kontynuacja kolejki 1–15)

**Gałąź:** `team/ui/w12-ai`  
**Tip gałęzi:** `7c087bbd0`  
**Baza startu UI-AI:** `206fdc9b0`  
**Integracja (tip):** `2dfb55f09` (już w gałęzi)  
**Data oddania (wznowienie):** 19.11.2026

## Wynik (UI-AI + późniejsza kolejka)

**UI-AI (pierwsze 2–3 ekrany):**
1. **Chat chrome (P0):** launcher prawego panelu + zakładki Browser / Files / Agent settings / Voice.
2. **Agent settings (P1):** identity + grupy Brain / Knows / More.
3. **Tasks (P1):** hero + kolumny Active.

**Potem kolejka KOLEJKA UI 1–15 (zrobione na tej samej gałęzi):** Knows/Brain karty, Marketplace Apps, sidebar pin/Więcej, Appearance, skeleton Loading, Unread first, PWA kanały, FLIP unread-first, a11y po T-AJ. Ostatni marker: UI-15 @ `b27b2b107` / docs `7c087bbd0`.

Bez zmian w `SettingsModal` i `ChannelView` (KK).

## Zgodność P0/P1 (uczciwie)

Źródło: `Shared\cosgral-docs\zrzuty-cosgral-17-11-j\vs-071-p0p1.txt` (T-AJ @ `2dfb55f09`):

| Priorytet | Ekran | Stan T-AJ |
|---|---|---|
| P0 | Sidebar + rail | zgodny |
| P0 | New agent | zgodny |
| P0 | Chat chrome | częściowo (steps/@/slash; Teach/Voice off) |
| P1 | Agent settings | częściowo (Brain/Knows; nie pełny 059–074) |
| P1 | Server settings | zgodny |
| P1 | Marketplace | zgodny |
| P1 | Tasks ↔ chat | częściowo (board Failed/Stopped; hero ≠ 078–086) |

**Liczby:** **4 zgodne / 3 częściowo / 0 brak** (7 pozycji P0+P1).

## Testy (ostatnie przebiegi na gałęzi)

| Co | Stan |
|---|---|
| UI-AI: launcher / AgentCards / TasksView | przechodziły przy oddaniu |
| UI-15: `ui-recent-a11y.test` | 2/2 |
| Biome / `typecheck:renderer` | OK na zmianach UI |
| Storybook / Electron | nie (brak GO-ui) |

## Luki

- Teach / Voice w menu „+”: brak silnika.
- `byServer` / `useRestoreWorkspace`: w `merge-preview`, **nie** w tipie `2dfb55f09`.
- Agent settings: nie pełny zakres zrzutów 059–074.
- Tasks hero ≠ 078–086; Unread first w tipie dopiero po scaleniu UI.
- Kolejka UI 1–15 pusta — dalsze ekrany po tipie/liderze.
