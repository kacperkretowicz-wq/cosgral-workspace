# UI fidelity gate (Tester T-A / T-B)

Thin overlay on Backend `scripts/openbot-probe/compare.ts`. **Do not duplicate** colour/length diffs — compare already uses ±5 colour and ±2 px.

## What this adds

| Piece | Role |
|---|---|
| `gate.ts` | PASS / FAIL / niejasne per screen from `odbior-071.md` rules |
| `run.ts` | Uses `compare.ts` helpers, writes per-screen `.md` + `INDEX.md` + `GATE.md` |
| `gate.test.ts` | Unit tests on synthetic diffs (no Electron) |

## Output (outside repo)

```
Shared/cosgral-docs/porownanie-ui/
  INDEX.md          ← from compare.ts
  <screen>.md       ← from compare.ts
  GATE.md           ← from this gate
```

Refuse writing inside the public repo (same rule as compare).

## Usage

```bash
# After both probe runs exist (OpenBot extract + COSGRAL --target cosgral):
bun scripts/ui-fidelity/run.ts \
  --reference "…/openbot-0.71-ui/main-shell" \
  --ours "…/porownanie-ui/cosgral-probe" \
  --out "…/Shared/cosgral-docs/porownanie-ui" \
  [--map map.json]
```

Unit tests only:

```bash
bunx vitest run scripts/ui-fidelity/gate.test.ts
```

## Verdict rules

| Verdict | When |
|---|---|
| **PASS** | No critical style/token gaps within compare tolerances; texts match as sets |
| **FAIL** | Critical look (size/radius/padding/gap/colour) still missing after ±2 / ±5 |
| **niejasne** | Text-only delta (sense needs human/i18n), or unpaired screen, or no probe yet |

Window proof (Electron / `sandbox:e2e`) still needs leader `GO-*.txt`. Static code review goes in `docs/cosgral-raporty/tester-w11-odbior.md`.
