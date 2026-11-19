# KAPI-AC (kolejka #19) — ChannelEditor / JoinServerDialog / MemorySettings

**Gałąź:** `team/kapi/w12-p`  
**Baza:** `codex/cosgral-desktop` @ `2dfb55f09`  
**Bez push.** Bez Electron / dist:win (brak `GO-kapi-dist.txt`).

## Co

1. **`ChannelEditor`:** nowy/edycja kanału, błędy walidacji, przyciski przez `t()`.
2. **`JoinServerDialog`:** dołączanie do serwera zdalnego po PL.
3. **`MemorySettings`:** błędy pamięci agenta i kanału przez `t()`.
4. Katalogi: +~26 kluczy PL/EN.

## Testy

| Co | Wynik |
|---|---|
| Biome (własne) | OK |
| `typecheck:renderer` | OK |
| `i18n.test` | 8/8 |

## Notka UI

Dialogi kanału i „Join server” po PL; błędy pamięci w ustawieniach po PL.

## Luki

- `#3` / `#7` `dist:win` czekają na `GO-kapi-dist.txt`.
- Nie ruszano RemoteDesktop/Mobile (KK).
- Storybook / Electron / pełny check: bez GO.
