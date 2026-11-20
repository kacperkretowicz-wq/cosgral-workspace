# Plan: spójne, proste kolory (Azure Glass bez „napakowania”)

Cel właściciela (19.11): kolory spójne, przejrzyste, proste, w naszym stylu; mniej „napakowanego”. Ten plik to plan
pracy na kolejny dzień.

**Stan 20.11 (koniec dnia):** wszystkie kroki wykonane. Kroki 2–4 i 6 (żetony, sekcje, pigułki, wiersz 20.11 (1)),
krok 1 (pomiar: `tools/measure-hues.py` na zrzutach z `set.cjs`: odcienie nasycone w obszarze treści, próg 0,4% pola)
i krok 5 (poświaty). Pomiar: **przed** średnio 1,29 odcienia na ekran (Zużycie 3: niebieski, czerwony, zielony),
**po** 1,14 (Zużycie 2: niebieski i głęboki Azure), pozostałe ekrany 1 (niebieski) w ciemnym; w jasnym średnio 0,71.
Decyzje: dok zostaje kolorowy, stworki w pełnych kolorach, kafle Zużycia Azure / głęboki Azure / Azure, przyciski
drugorzędne jako szklane pigułki.

## 1. Stan wyjściowy (zmierzone 19.11)

- Literały kolorów (`#hex`, `rgb()`, `oklch()`) są tylko w plikach tokenów (`cosgral-tokens.css` 218, `theme-light.css`
  54) i w `blobatar.ts` (stworki). Reszta CSS używa `var(--openbot-*)`. **Problemem nie jest dyscyplina tokenów, tylko
  liczba różnych kolorów naraz na ekranie.**
- Siatki gradientu (`--openbot-mesh-*`): 7 odcieni (niebieski, zielony, czerwony, cyjan, różowy, pomarańczowy, limonka)
  użyte w 76 miejscach `azure-glass.css`: dok, nagłówki stron, kafelki sekcji, karty agenta, typy plików, kroki
  przepływów, `PanelHeading`. Na jednym ekranie (np. panel agenta) widać 6–7 odcieni jednocześnie.
- Do tego: poświaty (`glow-*`), pule światła w kaflach (`tile-blue/red/green`), pigułki błyszczące, ziarno, tło okna
  z plamami. Każda warstwa osobno jest w porządku, razem robią hałas.

## 2. Zasady (do zatwierdzenia na początku dnia)

1. **Trzy rodziny, każda ma rolę:** Azure (marka, akcje, zaznaczenie), zimna czerwień (niebezpieczeństwo, nieprzeczytane),
   neutralne szkło (reszta). Zielony i bursztyn **tylko** jako stan (OK, uwaga), nigdy dekoracja.
2. **Kolor niesie znaczenie, nie ozdobę.** Kafelek z ikoną w jednej ze stron = Azure w dwóch odcieniach (jasny, głęboki),
   różnicę robi ikona i podpis, nie kolor.
3. **Jedna głośna rzecz na widok:** jedna błyszcząca akcja główna, jedna czerwona plakietka, jedna rozświetlona karta.
4. **Warstwy po kolei:** tło okna (plamy) → szkło paneli → karty. Poświata tylko na aktywnym/fokusie, pule światła
   tylko w liczbach i wykresie.
5. Tylko tokeny z `:root` (AGENTS.md); nowy token tylko dla nowej roli.

## 3. Decyzje dla właściciela (rano, 10 min)

- **Dok stron:** zostaje kolorowy (podobał się w inspiracjach) czy przechodzi na Azure w odcieniach? Propozycja:
  zostaje kolorowy, bo to jedyne miejsce, gdzie kolor = nawigacja; wszędzie indziej mono-Azure.
- **Stworki** zostają w mocnych kolorach (to „postacie”, nie UI).
- **Kolory typów plików / kroków przepływu:** zostawić 3 (dokument, obraz, dane) zamiast 5–7?

## 4. Kroki

| # | Praca | Efekt | Czas |
|---|---|---|---|
| 1 | Skrypt pomiarowy (Playwright): dla każdego ekranu i obu motywów policz różne odcienie (kubełki hue) i liczbę warstw z poświatą; zapisz tabelę „przed” | liczby zamiast wrażeń; próg: ≤ 3 odcienie poza dokiem i stworkami | 1 h |
| 2 | Paleta: ograniczyć `--openbot-mesh-*` do `blue`, `deep` (głębszy Azure), `red`; usunąć `lime/pink/orange/cyan` z tokenów, zostawić aliasy tylko tam, gdzie są użyte w dziennym dok | mniej tokenów, jedna rodzina | 1 h |
| 3 | Kafelki sekcji i `PanelHeading`: przejść na `blue`/`deep`; czerwony tylko dla „niebezpiecznych” sekcji (Izolacja, usuwanie) | spokojny panel agenta, Telefon, Zdalny pulpit, Dostawcy | 2 h |
| 4 | Karty agenta, Biblioteka, Przepływy: kolor grupy → jeden odcień + ikona; typy plików 3 odcienie | koniec tęczy w siatkach kart | 2 h |
| 5 | Poświaty i pule światła: zostawić na aktywnym/fokusie, w liczbach i wykresie; zdjąć z kafli spoczynkowych (karty, listy, formularze) | mniej warstw | 1,5 h |
| 6 | Statusy (zielony/bursztyn/czerwony) jednolicie: pigułka `status-*`, ten sam kształt, ta sama siła; usunąć kolorowe tła tam, gdzie wystarczy kropka | czytelny stan | 1 h |
| 7 | Jasny motyw: te same zasady; sprawdzić kontrast pigułek i kafli | równa jakość | 1 h |
| 8 | Weryfikacja: skrypt z kroku 1 „po”, axe 373/373, `bunx biome check .`, testy, zrzuty przed/po (ciemny + jasny) dla: stworki/kanał, Zadania, Przepływy, panel agenta, Dostawcy, Zużycie, Biblioteka | dowód | 1 h |
| 9 | Dziennik: wiersz w `PROMPT-UI-JAKOSC.md`, `PRZEKAZANIE.md`; commit + push na `claude/charming-euler-ag7ese` | | 0,5 h |

Razem ok. 11 h; kroki 2–4 dają największą zmianę wizualną, jeśli czasu zabraknie, robić je w tej kolejności po kroku 1.

## 5. Kryteria odbioru

- Poza dokiem i stworkami: na każdym ekranie ≤ 3 rodziny kolorów (Azure, czerwień, neutral) + stan.
- Brak nowych literałów kolorów poza plikami tokenów; `--openbot-mesh-*` ≤ 3.
- Axe 373/373 w obu motywach; zrzuty przed/po zatwierdzone przez właściciela.
- Nic nie zależy od animacji.

## 6. Ryzyka

- Usunięcie tokenów łamie historyjki i testy odwołujące się do nich: najpierw grep, potem aliasy na `blue`.
- „Mniej” może wyjść nijako: robić po jednym ekranie, pokazywać zrzut, dopiero potem reszta.
