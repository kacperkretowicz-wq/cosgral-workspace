# KAPI-V — aria/i18n P1 paneli MCP/Memory/Vault/Routine/Skills (kolejka #12)

Gałąź: `team/kapi/w12-p` (baza `2dfb55f09`). Bez push, bez Electrona/dist:win.

## Wynik

| Co | Stan |
|---|---|
| Nowe klucze | **+38** PL/EN |
| McpPanel | pełne `t()` (lista + formularz) |
| SkillsPanel | pełne `t()` |
| MemoryPanel | aria + Memory text / Inclusion |
| VaultPanel | form aria + Kind/rodzaje + Vault |
| RoutinePanel | Create routine + Routines + pola |

## Notka dla UI / KK

Panele W2 (MCP, pamięć, Vault, rutyny, skille) mówią po PL przy `language=pl`. KK #8 może odhaczyć te powierzchnie w inwentarzu.

## Testy

| Co | Wynik |
|---|---|
| `i18n.test` | ✅ 8/8 |
| Biome | ✅ |
| `typecheck:renderer` | ✅ |

## Luki

1. `#3/#7 dist:win` bez `GO-kapi-dist.txt` (sandbox ma `GO-tester-e2e`).
2. Część etykiet Vault (Site URL, Username…) nadal EN poza aria Kind/Password.
3. Nic nie widziane w Electronie.
