# UI-AE: jakość UI / ruch (openbot.run → własne)

Stan: kod na `team/ui/w12-ae` @ `6e6199ad5` (nad UI-AD `fe22919`). GO leży — testy po zniku. Nieoglądane w oknie.

## Dokument
`docs/cosgral/jakosc-ui-ruch.md` — 8 propozycji + wybór pierwszych 3.

## Pierwsze 3 (wdrożone)
1. **Kolejność kart** — `motion-reveal.css` (wspólna warstwa z KK, czasy ściągnięte do 200/24 ms ≤ 220 ms).
2. **Skeleton** w `AgentCardsSection` zamiast samego tekstu „Loading cards…”.
3. **Mikro‑nacisk** — transition 120 ms na `.ui-button` / wiersz agenta (scale już było w primitives).

## Współpraca z KK
KK wcześniej wrzucił szkic `motion-reveal` na swojej gałęzi. Tutaj ten sam plik (jedna wersja), żeby nie było drugiego toru jak przy rutynach. Lider scala jedną kopię.

## Historyjki / testy (kod; uruchomienie po GO)
- `MotionQuality.stories.tsx` — Dark/Light (arrive + skeleton + press, kontrast ≥ 4,5).
- `AgentCardsSection.test.tsx` — skeleton podczas ładowania.
- Po GO: ten test + Biome; pełny Storybook/visual tylko lider.

## Luki
- Sweep / empty / motyw / panel / ilustracja — w dokumencie, nie w tej turze.
- Skeleton tylko w kartach agenta; inne „Loading…” jeszcze tekst.
- Nieoglądane w oknie; OpenBot.run tylko publiczna strona (idea, nie kod).
