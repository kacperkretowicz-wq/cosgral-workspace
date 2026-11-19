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

## Następne sekcje (kolejność)

1. Stworki: mimika stanów (pracuje, ma wiadomość, potrzebuje Cię, błąd), mrugnięcie przy najechaniu, wersja bez ruchu; jeśli trzeba, grafiki z generatora obrazów (zgoda właściciela).
2. Wiersz agenta: licznik nieprzeczytanych na rogu stworka, kanały jako wiersze ze stosem awatarów członków.
3. Pasek kart wątków nad rozmową: uprościć, gdy jest jeden wątek.
4. Strony: Przepływy, Zużycie, Biblioteka, Katalog dodatków, Dostawcy (Zadania: właściciel mówi, że na razie niepotrzebne).
5. Ustawienia i okna dialogowe.
