# UI-AF: rename in-place + densify Voice/Thread/Integrations

Gałąź: `team/ui/w12-af` z integracji `3b41ffa54`. Bez push. Bez Storybooka/Electrona.

## Co zrobione
1. **Rename in-place** na wierszu paska bocznego: menu kontekstowe → Rename otwiera pole `Agent name` w tytule wiersza (Enter/blur zapisuje przez `agent.updateBot`, Escape anuluje). `Edit agent` nadal otwiera ustawienia.
2. **Voice heading**: `h2` „Voice” / „Głos” na górze `VoiceOverviewPanel` (MISS z vs-071 17-11-g).
3. **Skeleton**: Voice/Thread/Integrations już miały `CosgralLoadingSkeleton` (densify). Dopieszczone: 4 paski + `cosgral-arrive` w wspólnym komponencie.

## Testy
| Krok | Wynik |
|---|---|
| `App.test` −t renames an agent in place | ✅ 1/1 |
| `VoiceOverviewPanel.test` | ✅ 6/6 |
| Biome (zmienione TS/TSX) | ✅ |
| `typecheck:renderer` | ✅ EXIT 0 |

## Luki
- Rename nie potwierdzone w Electronie (Tester: first-run bez fixture).
- Message menu Copy/Pin/…, Updates heading+track — poza tym ticketem (Backend/KK).
- Kafle paska / maskotki nadal lżejsze niż 0.71.
- Rutyna „UI: testy po GO densify” nadal żyje — z rutyny nie kasuję (lider: `ca17f7b6-…`).
