# W6-UI5-FIX

Baza: codex/cosgral-desktop 3307e6cd8. Galaz: team/ui/w6-ui5-fix. Bez push.

## Przyczyna i poprawka
- Sidebar renderowal threadRowLabel jako bot-row-preview wewnatrz avatara. Opis licznika jest teraz sr-only (istniejaca klasa systemu), pozostaje dostepny dla czytnika.
- Nowe Threads i Context podniosly minimalna wysokosc automatycznego wiersza grid aplikacji. Screenshot mial 1280x860, a zawartosc wychodzila poza viewport. app-frame ma teraz max-height:100dvh i grid-template-rows:minmax(0,1fr). Przewija sie historia rozmowy, composer pozostaje na dole.
- Test regresji sprawdza wysokosc aplikacji <= viewport oraz prostokat opisu czytnika 1x1 px. Przed poprawka test:visual odtworzyl blad 1280x715 vs 1280x860 (6/7).

## Oglad zrzutu przed aktualizacja wzorca
Po poprawce: 1280x720, bez bialej pasy i bez nakladajacych sie licznikow pod agentami. Wiersze Chief, Research, Sales maja kompaktowe avatary i pojedynczy podglad. Threads: New thread i Context tworza stos pod naglowkiem rozmowy; historia przewija sie pod nimi; composer widoczny przy dolnej krawedzi. To celowe elementy W6, nie regresja do ukrycia we wzorcu.

## Zakres wzorcow
Application wymaga aktualizacji dla celowo dodanych Threads i Context. Join-server zawiera te sama aplikacje za modalem: aktualizacja dopuszczalna tylko dla zmienionego tla i usuniecia pasa, bez zmiany formularza. Foundations nie zmieniamy.

## I18n
Dopisano do docs/cosgral/i18n-inwentarz.md: Pokaż ukryte w angielskim sidebarze -> W7-UI2. Tekst teraz bez zmian.

## Ograniczenia
Bez Electrona, pelnego check i prawdziwych kont. Atrapy Storybook, Chromium Windows. W konsoli istniejace ostrzezenia Solid STRICT_READ_UNTRACKED. Graphify: brak graph.json w udostepnionym graphify-out (tylko cache i blokada), nie przebudowywano wspolnego grafu.

## Wyniki koncowe (16.11.2026)
| Kontrola | Wynik |
| --- | --- |
| Storybook AccessBudgets, axe error, dark/light | 18/18 |
| Storybook IsolationBrowser, axe error, dark/light | 8/8 |
| Storybook SettingsModal, axe error, Open/Interactive/OpenLight | 3/3, EXIT=0 |
| Biome zmienionych 4 plikow kodu | zielony |
| test:visual bez -u, po aktualizacji | 4 pliki, 7/7, EXIT=0 |

Wszystkie przebiegi ciezkie kolejno, bez Electrona i pelnego check. SettingsModal OpenLight ustawia motyw na documentElement i przywraca poprzedni przy cleanup, obejmuje portal modala. Osobnego typecheck nie uruchamiano.

Aktualizacja -u ograniczona testNamePattern representative application. Zmienione tylko application i join-server-dialog. Foundations, host i picker pozostaly identyczne. Join-server: modal i pola bez zmian; rozmiar obrazu i rozmyte tlo aplikacji zmienione wskutek naprawy siatki i nowych paneli Threads/Context.

Dowody: [application](../../tests/visual/__screenshots__/ui-foundation.visual.test.tsx/application-chromium-win32.png), [join server](../../tests/visual/__screenshots__/ui-foundation.visual.test.tsx/join-server-dialog-chromium-win32.png).

Pliki robocze poza commitem: ignorowane logi w6-*.log oraz cache runnerow. Wlasne .vitest-attachments po diagnozie usunieto. Brak zmian danych OpenBota.
