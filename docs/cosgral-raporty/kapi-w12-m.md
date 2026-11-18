# KAPI-M — podgląd web < 1,8 MB + i18n composer/zakładki

Gałąź: `team/kapi/w12-m` (baza `4ddcbb5d3`). Bez push, bez Electrona, bez `dist:win`.

## 1. Podgląd (`scripts/web-preview`)

Cel hostingu: razem < 1,8 MB, każdy plik < 1 MB, działanie bez zmian. Publikację robi lider.

| | Bajty | MB (dziesiętne) |
|---|---:|---:|
| Przed (integracja, Inter woff2) | 2 001 202 | **1,908** |
| Po (system fonts + chunki + minify) | 1 865 099 | **1,779** |
| Oszczędność | −136 103 | −0,129 |

- Usunięte `.woff2` Inter; `styles.css` w podglądzie dostaje `system-ui` / `Segoe UI`.
- `manualChunks`: `locales`, `fixtures`, `solid`, `ui-vendor`, `vendor`.
- `cssMinify` + Tailwind `optimize: true`; strip `@font-face` w `generateBundle`.
- Największy plik po: ~781 KB JS. Plików: 9. Brak `norbert` / `openbot.run` / `.woff2` w assets.
- Budowa: `bun x vite build --config scripts/web-preview/vite.config.ts` → `out/web-preview` (nie publikowane).

## 2. i18n Conversation (composer + przeglądarka/zakładki)

+**42** klucze PL/EN (równe zbiory) w `en.ts` / `pl.ts`.

Objęte m.in.: drop załączników, Effort, picker To:, Account notices, Decision, reply/queue edit, attach menu, Stop/Send, panel Browser (karty, toolbar, empty state), aria komputer/remote.

Pozostałe sztywne EN w tym samym pliku (settings side panel, Pinned/Edited, media preview) — poza zakresem M; osobna runda.

## 3. Testy / Biome

- `src/renderer/src/i18n.test.tsx` (po jednym pliku)
- Biome na zmienionych plikach
- bez pełnego check / Electron / dist:win

## Luki

1. Bufor podglądu ~21 KB do limitu 1,8 MB — kolejne duże ekrany/fixture mogą znów nacisnąć; rozważyć dalsze cięcie fixtures albo lazy route w podglądzie.
2. Settings side panel w `Conversation.tsx` nadal po EN (Name/Title/Runtime…).
3. `Decision · pinned` kicker nadal sztywny.
4. Podgląd nieopublikowany — czeka na lidera.
