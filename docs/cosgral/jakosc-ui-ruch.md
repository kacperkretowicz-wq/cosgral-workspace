# Jakość UI i ruch (inspiracja openbot.run)

Źródło obserwacji: publiczna strona https://openbot.run (18.11.2026).  
**Bez kopiowania** kodu, tekstów, ikon i grafik (PolyForm-NC, repo publiczne). Bierzemy tylko rytm: paleta, czas, krzywa, kolejność.

## Co widać na stronie
- Tło ok. `#1a1a1a`, tekst biały / `#979797`, Inter, pigułki (`border-radius` 999px) i karty 12px.
- Krzywe: `cubic-bezier(0.23, 1, 0.32, 1)` (wejście), `cubic-bezier(0.77, 0, 0.175, 1)` (pętle).
- Ruch: hero `landing-hero-in`, karty/sekcje wjeżdżają, skeleton `t-skel-pulse`, logo ma kilka mikro‑animacji, nawigacja panel enter/leave ~0,16–0,4 s.
- Nasz COSGRAL już ma zbliżoną paletę, Inter, `motion.css` (panele, menu, maskotka) i tokeny `--cosgral-duration-*` (120/150/250 ms).

## Propozycje (8)

| # | Nazwa | Tokeny (czas / krzywa) | Prefer reduced motion | Koszt |
|---|--------|------------------------|------------------------|-------|
| 1 | **Kolejność kart listy** — wiersze wjeżdżają jedno po drugim (tylko `transform`) | `--cosgral-arrive-duration` 180–260 ms, `--cosgral-arrive-step` 24–28 ms, ease `0.23,1,0.32,1` | wyłącz całą animację | **tanie (CSS)**; KK ma szkic `motion-reveal.css` |
| 2 | **Skeleton zamiast „Loading…”** — 2–3 paski pulsujące w miejscu listy | `--cosgral-pulse-duration` ~1,4 s, ease loop; opacity tylko w skeletonie (nie w kartach treści) | `animation: none` | **tanie (CSS + 1 komponent)** |
| 3 | **Mikro‑nacisk przycisku** — `:active` scale 0,97 na `.ui-button` / wierszach paska | 120 ms, `--cosgral-ease` | bez transform | **tanie (CSS)** |
| 4 | **Pasek „praca trwa”** (sweep) pod nagłówkiem gdy agent działa | 900–1200 ms linear infinite, tylko `translateX` | wyłącz | **tanie (CSS)**; podpięcie pod stan silnika = średnie |
| 5 | **Pusty stan** — lekki wjazd bloku empty (8 px w górę) | 180 ms arrive | wyłącz | **tanie (CSS)** |
| 6 | **Przejście motywu** jasny↔ciemny — crossfade tła i tekstu | 180–220 ms na `background-color`/`color` | skróć do 0 | **średnie** (klasa na `html`, ryzyko migania) |
| 7 | **Wejście prawego panelu ustawień** — slide 8 px + bez opacity od 0 | 180 ms | wyłącz | **średnie** (selektory panelu) |
| 8 | **Ilustracja pustego czatu** (własna SVG COSGRAL) | statyczna + opcjonalny breathe 4 s | tylko breathe off | **droższe** (grafika + i18n) |

### Zasady bezpieczeństwa (z odbioru Storybooka)
- Karty treści: **nie** animować opacity od 0 (kontrast / „czy widoczne” czytają ekran zaraz po draw).
- Max ~8 opóźnień w kolejce; całość wejścia listy &lt; 400 ms.
- Czas animacji 120–220 ms (pętle skeleton/sweep mogą być dłuższe).
- Kontrast bez zmian (≥ 4,5).

## Pierwsze 3 do wdrożenia (UI-AE)
1. **Kolejność kart** — własny plik CSS na bazie idei (wspólnie z KK: jeden plik, bez drugiej wersji).
2. **Skeleton** podpięty w `AgentCardsSection` (zamiast samego tekstu „Loading cards…”).
3. **Mikro‑nacisk** `.ui-button` + wiersz agenta na pasku.

Pozostałe (4–8) po scaleniu i zielonym checku, w kolejności: sweep → empty → motyw → panel → ilustracja.
