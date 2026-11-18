# KAPI-X — i18n FallbackOrder + ProviderFallbackLists

**Gałąź:** `team/kapi/w12-p`  
**Kolejka:** #14  
**Czas:** 19.11 ~00:20  
**Bez push, bez Electrona/dist:win** (brak `GO-kapi-dist.txt`)

## Wynik

| Plik | Zmiana |
|---|---|
| `fallback-order.tsx` | pełne `t()` (aria, Up/Down/Remove, limity, Add/Save) |
| `ProviderFallbackLists.tsx` | łańcuch, listy, Reload, błędy zapisu |
| `en.ts` / `pl.ts` | +~23 klucze (bez duplikatów istniejących) |

## Testy

- `i18n` + `AgentSettingsW3` + `ProvidersFallbackW5` + `ProviderFallbackW6` → zielone
- Biome OK
- `typecheck:renderer` OK

## Notka UI/KK

Kolejka modeli zapasowych i łańcuch „Agent / Dostawca / Wszyscy” po PL.

## Luki

- #3/#7 `dist:win` nadal na `GO-kapi-dist.txt`
- Nie w oknie Electron
- Komunikaty kontraktu `fallbackModelsProblem(...)` nadal EN (silnik)
