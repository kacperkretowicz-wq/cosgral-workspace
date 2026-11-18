# T-AG / Tester — zgodność P0/P1 + sondy (bez Electrona)

Gałąź: `team/tester/w12-tg` (z `206fdc9b0`, FF `78d908540` dla `KOLEJKA-ZADAN.md`). Bez push. Bez GO / Electrona.

Źródła: zrzuty `Shared\cosgral-docs\zrzuty-cosgral-17-11-h` + `vs-071.txt` (build T-AF @ `4ddcbb5d3`); indeks `openbot-0.71-screens-indeks.md`; kolejka `openbot-0.71-kolejka-ui.md`. Tip ma już UI-AH (menu „+”, wątek Restore) — **nie** na zrzutach h.

## Tabela P0/P1 (7 ekranów)

| Priorytet | Ekran | Stan | Jedno zdanie różnicy vs 0.71 |
|---|---|---|---|
| P0 | Sidebar + rail | **częściowo** | Densify 68 px + maskotki OK (01/02); brak pin/Więcej i collapse jak 089–092. |
| P0 | New agent | **zgodny** | 12 maskotek + formularz + sugestie (03) ≈ 001/041–043. |
| P0 | Chat chrome | **częściowo** | Steps/@/slash/menu wiadomości OK; na 05 menu „+” tylko 3 pozycje (Teach/Voice = UI-AH po zrzutach). |
| P1 | Agent settings | **częściowo** | Karty widoczne (10); nie Brain/Knows / 12 kart jak 059–074 (UI-AI poza zrzutami h). |
| P1 | Server settings | **zgodny** | Sekcje + Vault/MCP/RD (11); Members/Transfer/Import 0.71 celowo poza tym odbiorem. |
| P1 | Marketplace | **częściowo** | Agents/Skills OK (12); głębokość Apps/Connect vs 035–039 nie potwierdzona. |
| P1 | Tasks ↔ chat | **zgodny** | Open as chat + Steps + seed (09) ≈ 078–086. |

**Licznik:** zgodny **3** / częściowo **4** / brak **0** (z 7 P0+P1).

**Priorytet dla UI (kolejność):** (1) Chat chrome — menu „+” + side panel jak 046/052/055, (2) Agent settings — układ kart 059–074, (3) Marketplace Apps/Connect, (4) Sidebar pin/Więcej.

## Sondy (gotowe po GO)

Skrypt: `scripts/sandbox-next-probes.ts`

```text
COSGRAL_SANDBOX_ROOT=<Shared>\cosgral-sandbox\tg-probes
COSGRAL_GO_DIR=<Shared>\cosgral-sandbox
COSGRAL_PROBE=all   # lub: restore-thread | menu-plus | clear-history | history-window | external-links
node scripts/sandbox-next-probes.ts
```

| Sonda | Co sprawdza | Soft-SKIP |
|---|---|---|
| `restore-thread` | UI-AH: `workspace.last.threadId` → restart → zakładka wątku | — |
| `menu-plus` | Attach/Skill/Side + Teach/Voice **wyłączone** | — |
| `clear-history` | `channels.clearHistory` → 0 wiadomości | gdy API brak (przed scaleniem KK-AG) |
| `history-window` | `historyWindow=20` | gdy pole brak (przed BE-Z) |
| `external-links` | `behavior.externalLinks` app→browser | — |

Dodatkowo: `sandbox-shots-w12.ts` krok 05 ma checklist Teach/Voice.

## KOLEJKA-ZADAN (Tester)

- [zrobione: ten SHA] pozycja 2 (tabela zgodności) i 4 (sondy).
- Następna: pozycja **1** (pełny odbiór Electron — **czeka na GO**); pozycja 3 już pokryta T-AD.

## Luki / nie sprawdzone

1. Zgodność liczona ze zrzutów **17-11-h**, nie z tipu po UI-AI/KK-AG.
2. Sondy nie uruchamiane (brak GO).
3. Fizyczny tray, pełny Storybook — poza zakresem.
