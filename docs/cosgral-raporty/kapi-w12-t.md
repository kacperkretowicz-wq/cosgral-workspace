# KAPI-T — AgentSettingsW3.test + setLanguage("pl") (kolejka #10)

Gałąź: `team/kapi/w12-p` (baza integracji `2dfb55f09`). Bez push, bez Electrona/dist:win.

## Wynik

| Co | Stan |
|---|---|
| Test konta | `setLanguage("pl")` tylko w teście z „Konto” |
| Pozostałe testy pliku | nadal EN (Create agent / fallback) |
| `afterEach` | reset `en` + unstub |

## Notka dla UI / KK

Brak zmian produkcyjnych. Picker konta po PL w teście ustawień agenta.

## Testy

| Co | Wynik |
|---|---|
| `AgentSettingsW3.test` | ✅ 5/5 |
| Biome | ✅ |

## Luki

1. `#3/#7 dist:win` bez `GO-kapi-dist.txt` (sandbox ma tylko `GO-tester-e2e.txt`).
2. Nagłówki Model/Save settings w `AgentSettingsW3` nadal sztywne EN.
