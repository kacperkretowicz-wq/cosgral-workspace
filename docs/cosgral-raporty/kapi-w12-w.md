# KAPI-W — i18n McpSettings + AgentSettingsW3

**Gałąź:** `team/kapi/w12-p`  
**Kolejka:** #13  
**Czas:** 18.11 ~23:50  
**Bez push, bez Electrona/dist:win** (brak `GO-kapi-dist.txt`)

## Wynik

| Plik | Zmiana |
|---|---|
| `McpSettings.tsx` | błędy przez `t()` (MCP unavailable / action failed / no agent) |
| `AgentSettingsW3.tsx` | Create agent, profil, Model/Tools, Save, fallback, Templates |
| `en.ts` / `pl.ts` | +~22 klucze (bez duplikatu `Agent's own list`) |
| `AgentSettingsW3.test.tsx` | PL: „Zapisz ustawienia” / „Zapisano ustawienia.” |

## Testy

- `i18n.test` + `AgentSettingsW3.test` → **13/13**
- Biome (własne pliki) OK
- `typecheck:renderer` OK

## Notka UI/KK

Ekran ustawień agenta (tworzenie, profil, zapis, zapasowe, szablony) i komunikaty `McpSettings` idą przez katalogi PL/EN.

## Luki

- #3/#7 `dist:win` nadal wymagają `GO-kapi-dist.txt` (sandbox bez GO-*)
- Nie widziane w oknie Electron
- Teksty z silnika (`unavailableReason` itd.) nadal EN — Backend
