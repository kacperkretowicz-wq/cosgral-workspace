# UI densify (Windows) — raport

**Gałąź:** `team/ui/w12-ae`  
**Cel właściciela:** Linux później; na Windows zagęścić ruch i jakość UI.

## Zrobione (kod, bez testów — GO leży)

1. Wspólny `CosgralLoadingSkeleton` — pulsujące paski zamiast gołego „Loading…”.
2. Podpięte w: karty agenta, katalog dostawców, biblioteka plików, aplikacje wtyczek.
3. Empty state: `cosgral-empty-enter` na „No files found.” / „No matching apps.”.
4. Arrive: też `.provider-catalog-card` i `.library-row` w `motion-reveal.css` (ta sama warstwa co KK).

## Po zniku GO

- testy po 1 pliku: `AgentCardsSection.test`, UI-AD (`App` rename, Endpoints, check:ui)
- Biome na zmienionych CSS/TSX

## Luki

- Nieoglądane w oknie; Storybook/visual tylko lider.
- Inne panele nadal tekst „Loading…” (Voice, Thread, Integrations…).
- Linux/Oracle: nie ruszam.
