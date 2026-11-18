# Raport KAPI-K: i18n Endpoints+Plan + pomiar instalatora

**Gałąź:** `team/kapi/w12-k` (z `3b41ffa54`)  
**Data:** 18.11.2026  
**Ciężkie:** bez `dist:win` (Tester ma Electron / GO-tester-e2e).

## Pkt 1 — PL/EN

| Plik | Stan |
|---|---|
| `EndpointsSection.tsx` | cały sztywny EN → `t()` |
| `PlanPanel.tsx` | fazy/kroki/przyciski → `t()` |
| `locales/en.ts` + `pl.ts` | +59 par (1282→1341), katalogi równe |
| `i18n.test.tsx` | dodane `EndpointsSection`, `PlanPanel` |

**Nowe klucze:** 59 (Endpoints + Plan).

## Pkt 2 — pomiar instalatora (przygotowanie)

| Artefakt | Rola |
|---|---|
| `scripts/measure-dist-win.mjs` | po `dist:win`: rozmiar + SHA-256 → folder **poza repo** |
| Domyślny katalog raportu | `Shared/cosgral-docs/dist-win-measurements/` (albo `COSGRAL_DIST_REPORT_DIR`) |

```
bun run dist:win
COSGRAL_GIT_SHA=$(git rev-parse --short=9 HEAD) bun scripts/measure-dist-win.mjs
```

Raport: tylko nazwa pliku, bajty, MiB, sha256 — bez ścieżek z nazwą profilu.

## Testy (lekkie)

| Krok | Wynik |
|---|---|
| `i18n.test` | 9/9 |
| `EndpointsSection.test` | 8/8 |
| Biome własne | OK (3 format) |
| `typecheck:renderer` | EXIT 0 |

## Luki

- `dist:win` + pomiar: czeka na zniknięcie `GO-tester-e2e.txt` i `GO-kapi-dist.txt` od lidera.
- Conversation / ChannelRoutinesPanel (reszta) / LibraryPanel: nadal sztywne EN (kolejna runda).
- Nieoglądane w oknie.
