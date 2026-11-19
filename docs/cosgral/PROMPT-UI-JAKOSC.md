# Prompt: jakość UI COSGRAL Workspace (dla każdego agenta, który rusza wygląd)

Właściciel, 19.11.2026: „Każda sekcja ma wyglądać jakościowo, a nawet lepiej niż sam OpenBot. Zmiany w UI mają być
diametralne i dużo wnoszące: ikonki, sekcje, to jak to wygląda. Kolory mniej ważne.”

Wkład produktowy: `PRODUCT.md` (użytkownicy, zasady, ograniczenia). Ten plik mówi, JAK pracować nad wyglądem.

## Cel

1. Układ jak w OpenBocie (pasek stron, lista agentów, rozmowa). Ktoś biegły w OpenBocie znajduje wszystko tam, gdzie się spodziewa.
2. Wykonanie lepsze niż OpenBot w każdej sekcji: gęstość, rytm odstępów, ikony z jednej rodziny, stany (pusty, błąd, ładowanie, fokus), szczegół.
3. Stworki (awatary agentów) są sercem produktu: dopracowane rysunki, mimika, ruch (mrugnięcie, „myślę”, „mam wiadomość”), zawsze też w wersji bez ruchu.
4. Logo „C”, ciemny motyw domyślny, awatary-stworki: zostają (zobowiązania marki).

## Jak pracować

1. **Porównuj na żywo.** OpenBot jest zainstalowany na komputerze właściciela. Patrz (zrzuty), nie klikaj w jego rozmowy, nie zmieniaj jego danych.
2. **Nie kopiuj 0.71.** Ani kodu, ani obrazków, ani ikon z paczki OpenBota 0.71 (licencja PolyForm Noncommercial, repo publiczne). Rysujemy i piszemy swoje.
3. **Sekcja po sekcji**, od najczęściej oglądanej: pasek boczny z agentami → nagłówek i pole wiadomości → wiadomości w rozmowie → strony (Zadania, Przepływy, Zużycie, Biblioteka) → ustawienia → okna dialogowe.
4. **Duży skok, nie kosmetyka.** Jedna zmiana sekcji = widoczna różnica na zrzucie przed/po. Jeśli przed i po wyglądają prawie tak samo, to nie jest ta zmiana.
5. **Sprawdzaj w prawdziwym oknie.** Zbuduj (`bun run build`), uruchom w piaskownicy z `--remote-debugging-port`, zrób zrzut przez CDP. Zrzut przed i po każdej sekcji.
6. **Po polsku.** Każdy nowy napis przez `t()`, klucz w `pl.ts` i `en.ts` (równe klucze). Żadnych uciętych etykiet po polsku.
7. **Bez ruchu też działa.** Ten komputer ma „ogranicz animacje”. Nic nie może zależeć od animacji (np. `opacity: 0` czekające na animację = niewidoczna treść).
8. **Testy zielone.** Testy jednego pliku, `typecheck:renderer`, Biome, Storybook dla zmienionych historyjek, wizualne. Zmiana wzorca zrzutu tylko po obejrzeniu różnicy.

## Poziom wykonania (podłoga)

- Jedna rodzina ikon (obecnie `lucide-solid` + własne SVG w `PageRail.tsx`): ta sama grubość linii i rozmiar w obrębie sekcji.
- Jeden rytm odstępów (tokeny `--openbot-space-*`), większy odstęp nad nagłówkiem niż pod nim.
- Typografia: tokeny `--openbot-text-*`; przycisk `md` = 13px.
- Każdy element interaktywny ma stan najechania, fokus z klawiatury i stan wyłączony z powodem.
- Kontrast WCAG AA w obu motywach (Storybook a11y to sprawdza).
- Stany puste mówią, co zrobić dalej, jednym zdaniem i jednym przyciskiem.

## Czego unikać

- Pływających „wysp” i chipów bez funkcji, przełączników na wierzchu, które są rzadko używane (chować do menu filtra).
- Kropek, plakietek i kolorów, które niczego nie znaczą (np. kropka „przypięta” na każdej ikonie).
- Generycznych kafelków z ikoną, szklanych efektów i gradientów zamiast prawdziwej treści.

## Dziennik zmian sekcji

| Data | Sekcja | Co zmieniono | Zrzuty |
|---|---|---|---|
| 19.11 | Pasek stron | 5 stron domyślnie (Agenci, Przepływy, Zadania, Zużycie, Biblioteka) + „Więcej”, bez kropek, bez poziomego paska przewijania | — |
| 19.11 | Pasek boczny agentów | „Pokaż ukryte” do menu filtra (lejek), „Przeglądaj/Nowy kanał” do menu „+”, stan pusty z przyciskiem „Nowy agent” | — |
| 19.11 | Wiersze agentów | Płaska lista jak w OpenBocie (bez kart i kolorowego paska), stworek 42px, rola w linii podglądu zamiast plakietki ucinającej nazwę | — |
| 19.11 | Stworki | Gradient światła, odblask przycięty do kształtu, błysk w oczach, miękki cień; kształty bez zmian | — |
| 19.11 | Nagłówek rozmowy | Pliki / Ustawienia agenta / Głos jako ikony w nagłówku zamiast pływającej kolumny przycisków | — |
| 19.11 | Pole wiadomości | „Wybierz z biblioteki” w menu „+”, ikony przy każdej pozycji menu | — |
| 19.11 (2) | Stworki: mimika | Twarz mówi stan agenta: pracuje (oczy na dwóch wysokościach, z ruchem rozgląda się), potrzebuje Cię (szerokie oczy, uniesione brwi, z ruchem podskok), nowa wiadomość/odpowiedział („^ ^” i rumieńce), błąd (smutne oczy, kropla potu), limit (przymknięte oczy, „zz”). Pozy są statyczne (`blobatar/expression`, zapieczone w geometrii), więc działają przy „ogranicz animacje”. Historyjka `Identity/AgentAvatar › Moods` | Storybook `identity-agentavatar--moods` |
| 19.11 (2) | Wiersze agentów | Godzina nigdy nie jest ucinana („Yesterd…”, „10:00 …” → pełne); „Pracuje w: …” w linii podglądu zamiast w kółku stworka; stworek pokazuje stan miną | `cosgral-w1-ui2--activity-states-dark/light` |
| 19.11 (2) | Nagłówek rozmowy | Stworek 24px i nazwa pogrubiona; stworek „myśli”, gdy agent pracuje; „Nowy wątek” jako ikona w nagłówku, gdy agent ma jeden wątek | `app--playground` |
| 19.11 (2) | Pasek kart wątków | Przy jednym wątku nie rysuje się wcale (jedna karta nic nie mówi); od dwóch wątków jak dotąd | — |
| 19.11 (2) | Wiadomości | Odpowiedź agenta bez dymka (czysty tekst na tle, wiersz 22px, max 720px), dymek tylko dla wiadomości człowieka (jak w OpenBocie) | `app--playground` |
| 19.11 (2) | Po polsku | Stany w wierszu („Limit · wznowi o…”, „Błąd · …”, „Myśli”, liczba odpowiedzi), „Steruje komputerem / Zatrzymaj”, „Oznacz jako przeczytane”, etykiety dostępności wiersza | — |

## Następne sekcje (kolejność)

1. Stworki dalej: mimika także w kanałach i w wiadomościach (awatar przy odpowiedzi), edytor stworka (kształt + kolor z podglądem min).
2. Wiersz agenta: kanały jako wiersze ze stosem awatarów członków; sekcje „Nieprzeczytane / Przypięte / reszta”.
3. Rozmowa: kroki agenta jako zwijana oś czasu z ikonami narzędzi; pole wiadomości (wybór agenta przy kanałach).
4. Strony: Przepływy, Zużycie, Biblioteka, Katalog dodatków, Dostawcy (Zadania: właściciel mówi, że na razie niepotrzebne).
5. Ustawienia i okna dialogowe.
