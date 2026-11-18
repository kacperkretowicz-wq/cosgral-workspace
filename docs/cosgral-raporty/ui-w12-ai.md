# UI-AI — chat chrome launcher, Agent settings Brain/Knows, Tasks hero

**Gałąź:** `team/ui/w12-ai`  
**Baza:** `206fdc9b0` (integracja po UI-AH / T-AF)  
**Data:** 18.11.2026

## Wynik

1. **Chat chrome (P0, zrzut 052):** prawy launcher `ChatSidePanelLauncher` (Browser / Files / Agent settings / Voice) gdy panel zamknięty; w otwartym panelu pasek zakładek `ChatRightPanelTabs`. Panele Files (karta plików agenta) i Voice (nagrywanie do composera).
2. **Agent settings (P1, zrzut 059):** identity (avatar, name, title, description) na górze panelu; karty w grupach **Brain / Knows / More** z chevronem; nagłówek „Agent settings”.
3. **Tasks (P1, zrzut 078):** hero „Hand off the work… answer.” + kolumny Needs you / Working / Waiting na Active bez filtra; lista jak wcześniej przy Archived / chipach / wyszukiwaniu.

Bez zmian w `SettingsModal` i `ChannelView`.

## Zgodność P0/P1 (uczciwie, z vs-071 17-11-h + kolejka-ui)

Źródła: `Shared\cosgral-docs\zrzuty-cosgral-17-11-h\vs-071.txt`, `openbot-0.71-kolejka-ui.md` (7 pozycji P0+P1).

| Priorytet | Ekran | vs-071 / stan przed UI-AI | Po UI-AI |
|---|---|---|---|
| P0 | Sidebar + rail | OK (densify, kafle) | zgodny |
| P0 | New agent | OK (12 maskotek) | zgodny |
| P0 | Chat chrome | częściowo (menu + było MISS na tipie 4ddcbb; UI-AH już w 206fdc9b0; brak launchera 052) | **bliżej** (launcher + tabs + Files/Voice) |
| P1 | Agent settings | karty widoczne, układ ≠ 059 | **bliżej** (Brain/Knows, identity na górze) |
| P1 | Server settings | OK sekcje | zgodny |
| P1 | Marketplace 3 tabs | OK Agents/Skills | zgodny (Apps było wcześniej) |
| P1 | Tasks ↔ chat | OK open-as-chat/steps | **bliżej** (hero + board; funkcje bez zmian) |

**Liczby:** z 7 pozycji P0+P1 w kolejce: **4 zgodne** (Sidebar, New agent, Server settings, Marketplace), **3 bliżej / częściowo** (Chat chrome, Agent settings, Tasks). Żadna nie jest już „brak”.

## Testy

| Co | Stan |
|---|---|
| `ChatSidePanelLauncher.test` | 3/3 |
| `AgentCardsSection.test` | 7/7 |
| `TasksViewScreen.test` | 4/4 |
| `i18n.test` | 9/9 |
| Biome (zmienione) | OK |
| `typecheck:renderer` | OK |

## Luki

- Teach a task / Voice w menu „+” nadal bez silnika (UI-AH).
- Voice w prawym panelu = nagrywanie do pola; pełne modele głosu w Settings → Voice.
- Karty Knows (instructions/memories/skills) nadal otwierają istniejące sekcje niżej / detail tylko dla DETAIL_CARD_IDS.
- Tasks board nie pokazuje failed/cancelled w kolumnach (są w filtrach).
- Nie ruszane: SettingsModal, ChannelView (KK).
