# T-AI / Tester — tabela P0/P1 po UI-A* + sonda a11y (bez Electrona)

Gałąź: `team/tester/w12-ti` (z tipu `4f21fbfe7`). Bez push. Bez GO / Electrona. Zrzuty **17-11-i nie istnieją** (ostatnie: `zrzuty-cosgral-17-11-h`).

## Źródła (bez nowych PNG)

| Źródło | Co dało |
|---|---|
| `tester-w12-tg.md` + `vs-071` 17-11-h | baza przed UI-AI |
| `ui-w12-ai.md` | Chat launcher, Brain/Knows, Tasks hero |
| `ui-w12-aj.md` / `aj-fix` | skeleton Loading (P2 panele) |
| `ui-w12-ak.md` | Prompt/Condition (P2 Workflows) |
| `ui-w12-al.md` | stany puste Library/Usage/Schedule (P2) |
| `ui-w12-am.md` | fokus / kontrast / reduced-motion CSS |
| `kk-w12-ag.md` / `kk-w12-ai.md` | Clear history + historyWindow (kanał) |

## Tabela P0/P1 (7 ekranów) — stan tipu wg raportów

| Priorytet | Ekran | Stan | Jedno zdanie |
|---|---|---|---|
| P0 | Sidebar + rail | **zgodny** | Densify 68 px + kafle (UI-AG/h); pin/Więcej nadal poza zakresem 0.71 089–092. |
| P0 | New agent | **zgodny** | Bez regresji vs T-AG. |
| P0 | Chat chrome | **częściowo** | UI-AI: launcher Browser/Files/Agent settings/Voice + zakładki; **nie** na zrzutach 17-11-i. |
| P1 | Agent settings | **częściowo** | Brain / Knows / More + identity na górze (UI-AI); pełne 12 kart 059–074 nie potwierdzone w oknie. |
| P1 | Server settings | **zgodny** | Bez regresji vs T-AG. |
| P1 | Marketplace | **zgodny** | UI-AI: Apps uznane wcześniej; głębokość Connect nie w oknie. |
| P1 | Tasks ↔ chat | **częściowo** | Hero + kolumny (UI-AI); Open as chat ze zrzutów h; board ≠ pełny 078–086 w oknie. |

**Licznik:** zgodny **4** / częściowo **3** / brak **0** (było 3/4/0 na 17-11-h).

**Priorytet UI (nadal):** (1) Chat chrome — potwierdzenie launchera w oknie + Teach/Voice w „+”, (2) Agent settings Knows podstrony, (3) Tasks board vs 0.71, (4) Sidebar pin/Więcej.

## Sonda a11y (gotowa po GO)

Skrypt: `scripts/sandbox-a11y-probe.ts` (kolejka Tester #6).

```text
COSGRAL_SANDBOX_ROOT=<Shared>\cosgral-sandbox\ti-a11y
COSGRAL_GO_DIR=<Shared>\cosgral-sandbox
COSGRAL_PROBE=all   # lub: css | focus | motion
node scripts/sandbox-a11y-probe.ts
```

| Sonda | Co |
|---|---|
| `css` | CSSOM: `:focus-visible`, `prefers-reduced-motion`, `prefers-contrast` (UI-AM) |
| `focus` | Tab → outline na launcherze / rail |
| `motion` | CDP `prefers-reduced-motion: reduce` (SKIP bez CDP) |

## KOLEJKA

- #5 oznaczona zrobione z zastrzeżeniem: **bez PNG 17-11-i** — tylko raporty.
- #6 skrypt gotowy; **nie odpalany** (brak GO).
- #1 i #7 = Electron → czekają na GO.

## Luki

1. Brak folderu `zrzuty-cosgral-17-11-i` — pełna tabela po GO + `sandbox-shots-w12`.
2. a11y / historyWindow / Clear history / sendShortcut / MaxListeners — nie w oknie.
3. axe Storybook — poza zakresem (lider).
