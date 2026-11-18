# UI-AT (kolejka #12): Unread first w Appearance

## Wynik
Przełącznik **Unread first** w `AppearanceSettings` (obok Send message with) → `appSettings.update({ appearance: { unreadFirst } })`. Pasek sortuje nieprzeczytanych na górze poziomu (BE-AC).

## Pliki
- `AppearanceSettings` + Switch + i18n PL/EN
- `appearance.ts`: sygnał `unreadFirst` (reaktywny)
- `sidebar-tree.ts`: `sortUnreadFirst` + opcja w `buildSidebarRows`
- `Sidebar.tsx`: podpięcie przy `agentStates…unread`

## Testy
| Plik | Wynik |
|---|---|
| AppearanceSettings | 3/3 |
| appearance | 3/3 |
| sidebar-tree | 16/16 |
| Biome | OK |
| typecheck:renderer | OK |

Bez Storybooka / Electrona (brak GO-ui).

## Luki
- Nie w oknie.
- Tip integracji nadal bez BE-AC — ta gałąź niesie UI+sort, żeby działało po scaleniu z Backendem.
- Bez animacji przeskoku; nie dotyczy osób/kanałów.
