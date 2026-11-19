# KAPI-AD (kolejka #20) — VoicePlayback / VoiceRecorder / VoiceSettings

**Gałąź:** `team/kapi/w12-p`  
**Baza:** `codex/cosgral-desktop` @ `2dfb55f09`  
**Bez push.** Bez Electron / dist:win (brak `GO-kapi-dist.txt`).

## Co

1. **`VoicePlayback`:** Read aloud / Stop reading przez `t()`.
2. **`VoiceRecorder`:** nagrywanie / transkrypcja / mikrofon przez `t()`.
3. **`VoiceSettings`:** ekran głosu, modele, zgody przez `t()`.
4. Katalogi: +~34 kluczy PL/EN.

## Testy

| Co | Wynik |
|---|---|
| Biome (własne) | OK |
| `typecheck:renderer` | OK |
| `i18n.test` | 8/8 |

## Notka UI

Czytanie na głos, nagrywanie i ustawienia głosu po PL.

## Luki

- `#3` / `#7` `dist:win` czekają na `GO-kapi-dist.txt`.
- Tip można scalić po `merge-preview` (KK nie goni); nie blokuję scalenia.
- Storybook / Electron / pełny check: bez GO.
