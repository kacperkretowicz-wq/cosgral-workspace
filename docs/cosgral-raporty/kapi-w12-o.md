# KAPI-O — rozmiar podglądu web (< 1,8 MB)

Gałąź: `team/kapi/w12-o` (baza `961ac2c3f`). Bez push, bez Electrona, bez `dist:win`.

## Wynik

| | Przed | Po |
|---|---:|---:|
| Razem | 1 887 828 B (1,800 MB) | **1 785 507 B (1,703 MB)** |
| Max plik | 792 753 B | 792 753 B (`index-*.js`) |
| Plików | 9 | 8 |

Cel: razem < 1,8 MB ✅, każdy plik < 1 MB ✅.

## Co zrobiłem (tylko `scripts/web-preview`)

1. **`locale-stubs.ts`** — puste `en`/`pl`; plugin `previewLocaleStubs` podmienia importy katalogów. Chunk `locales` ~87 KB → **22 B**. `t()` zwraca klucz EN.
2. **Bez motion** — `main.tsx` bez `blobatar/motion.css`; `styles.css` w podglądzie bez `motion.css` / `motion-reveal.css` (~7 KB CSS mniej).
3. Fonty systemowe (jak wcześniej) — bez Inter woff2.

Desktop / Electron **bez zmian** (pełne słowniki, motion, Inter).

## Notka dla UI / lidera

- Po scaleniu przebuduj podgląd: `bun x vite build --config scripts/web-preview/vite.config.ts`.
- W podglądzie PL nie tłumaczy (klucze) — świadomy trade-off pod limit hostingu.
- Fixtures nadal ~253 KB; kolejne duże atrapy mogą znów nacisnąć 1,8 MB.

## Testy / sprawdzenia

| Co | Wynik |
|---|---|
| `vite build` web-preview | ✅ EXIT 0 |
| Pomiar bajtów `out/web-preview` | ✅ 1,703 MB / max 793 KB |
| Biome (zmienione pliki preview) | przed commitem |
| typecheck / Electron / dist:win | nie (poza zakresem; #3 kolejki za GO) |

## Luki

1. Podgląd bez prawdziwego PL (stubs).
2. Avatary / przejścia bez motion w podglądzie.
3. Kolejka KAPI #3 (`dist:win`) czeka na `GO-kapi-dist.txt`.
