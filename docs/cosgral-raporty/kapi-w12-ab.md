# KAPI-AB (kolejka #18) — ActionCard / ApiKeys / ComingSoon / ChatTasksSwitch

**Gałąź:** `team/kapi/w12-p`  
**Baza:** `codex/cosgral-desktop` @ `2dfb55f09`  
**Bez push.** Bez Electron / dist:win (brak `GO-kapi-dist.txt`).

## Co

1. **`ActionCard`:** szkic / takeover przeglądarki — przyciski i etykiety przez `t()`.
2. **`ApiKeysSection` + `api-keys-view`:** statusy, błędy, Save/Check/Remove.
3. **`ComingSoon`**, **`ChatTasksSwitch`:** Coming soon / Chat|Tasks / Channel view.
4. Katalogi: +~27 kluczy PL/EN.

## Testy

| Co | Wynik |
|---|---|
| Biome (własne) | OK |
| `typecheck:renderer` | OK |
| `i18n.test` | 8/8 |

## Notka UI

Needs you (szkic/takeover) i Dostawcy → klucze API po PL. Chat|Zadania w kanale po PL.

## Luki

- `#3` / `#7` `dist:win` czekają na `GO-kapi-dist.txt`.
- Nie ruszano RemoteDesktop/Mobile (KK).
- Storybook / Electron / pełny check: bez GO.
