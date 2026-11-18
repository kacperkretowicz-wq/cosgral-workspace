# UI-AO — Marketplace Apps bliżej 0.71 (kolejka UI #7)

**Gałąź:** `team/ui/w12-ai`  
**Baza:** po UI-AN `21e626b24`  
**Data:** 18.11.2026

## Wynik

Apps jak na zrzutach 035–036 (własny kod COSGRAL):

1. **Shell Marketplace:** lewa nawigacja Apps / Agents / Skills (gdy jest `pluginCatalog`).
2. **Hero Apps** + podpis „Connect the tools…”.
3. **Pasek:** Search + „+ Add custom”; chipy All / Installed / Featured / Needs attention.
4. **Sekcje kategorii** z liczbą i „See all”; Featured osobno; wiersze 2-kolumnowe z monogramem, tagline i „+ Connect”.

## Testy

| Co | Stan |
|---|---|
| `PluginAppsPanel.test` | 6/6 |
| `i18n.test` | 8/8 |
| Biome | OK |
| `typecheck:renderer` | OK |

Bez Storybooka / Electrona.

## Luki

- Ikony marek = monogram, nie logo (PolyForm).
- Agents/Skills nadal stara galeria (nie osobny hero jak Apps).
- Nie w oknie.
