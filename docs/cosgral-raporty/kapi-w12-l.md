# Raport KAPI-L: dist:win + i18n Library/Conversation

**Gałąź:** `team/kapi/w12-l` (z `1e5f2bd70`)  
**Data:** 18.11.2026

## Pkt 1–2 — dist:win

| | |
|---|---|
| Wynik | **OK** (EXIT 0, ~10 min) |
| Instalator | `COSGRAL Workspace-0.2.0-x64.exe` |
| Rozmiar | **108 553 103 B (103,52 MiB)** |
| SHA-256 | `2dc347e0fe11a0eb8cf82162259b3d7495eac6a95c3bb9880660a60cba784e31` |
| Pomiar | `Shared/cosgral-docs/dist-win-measurements/dist-win-2026-11-18T16-44-50-235Z.{json,txt}` |
| Log | `…/kapi-l-dist-win.log` (poza repo) |
| Podpis | brak (SmartScreen) |
| GO | `GO-kapi-dist.txt` **usunięty** |

## Pkt 3 — i18n

| Plik | Stan |
|---|---|
| `LibraryPanel.tsx` | cały UI → `t()`; PL hardcode Pobierz/Pokaż → Download/Show in folder |
| `Conversation.tsx` | setup/onboarding + browser actions + błędy → `t()` |
| `AgentActivity.tsx` | Queued/Working + aria |
| `ChannelRoutinesPanel` | już pokryty (0 braków w katalogu) |
| Katalogi | 1341→**1378** (+37), równe |

## Testy

| Krok | Wynik |
|---|---|
| `i18n.test` | 9/9 |
| `AgentActivity.test` | 4/4 |
| Biome | OK |
| `typecheck:renderer` | EXIT 0 |

## Luki

- Reszta Conversation (composer, browser tabs Close…, mark-as-read) jeszcze częściowo EN.
- Instalator nie podpisany; nie instalowany na czystym koncie.
- Pełny `bun run check` nie biegł.
