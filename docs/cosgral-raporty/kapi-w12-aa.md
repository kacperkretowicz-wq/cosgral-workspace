# KAPI-AA (kolejka #17) — View→Show + TablesPanel / VaultRequestCard

**Gałąź:** `team/kapi/w12-p`  
**Baza:** `codex/cosgral-desktop` @ `2dfb55f09`  
**Bez push.** Bez Electron / dist:win (brak `GO-kapi-dist.txt`).

## Co

1. **Kolizja `View` z KK** (RemoteDesktop „Podgląd”): `SkillsSettings` używa teraz `t("Show")` → PL **Pokaż**.
2. **`TablesPanel` + `RowEditor`:** etykiety, błędy, konflikt wersji, filtry przez `t()`.
3. **`VaultRequestCard`:** prośba Vault / Decline / błędy przez `t()`.
4. Katalogi: +~33 kluczy PL/EN (w tym `Show`).

## Testy

| Co | Wynik |
|---|---|
| Biome (własne) | OK |
| `typecheck:renderer` | OK |
| `i18n.test` | 8/8 |

## Notka UI

Przycisk podglądu skillu = **Pokaż** (nie koliduje z „Podgląd” pulpitu). Tabele i karta Vault request po PL.

## Luki

- `#3` / `#7` `dist:win` czekają na `GO-kapi-dist.txt`.
- Nie ruszano `agent-service.ts` / `main/index.ts`.
- Storybook / pełny check / Electron: bez GO.
