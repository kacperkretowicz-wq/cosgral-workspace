# W11-UI1 — wygląd klasy OpenBot 0.71 w COSGRAL (własna implementacja)

Źródło wartości: pomiary ekstraktora (poza repo). W repo są tylko nasze tokeny i kod.

## Commit 1 — tokeny
- `styles/cosgral-tokens.css`: `--cosgral-*` (ciemny + jasny). `--openbot-*` w styles.css wskazują na nie, więc cała aplikacja zmienia wygląd naraz.
- Jasny akcent #0069d9 (nie #007cf7), bo test kontrastu wymaga 4,5:1 dla białego tekstu na akcencie; w ciemnym #007cf7 daje ok. 4,0:1 przy białym tekście (do oceny wizualnej).
- Kontrola: theme-palette + theme test 4/4, check:ui OK, Biome OK.
- Nie sprawdzono: Storybook, test:visual (wzorce zmienią się — wymagają GO i aktualizacji po ocenie), Electron. Czcionka Inter nie jest dołączona (wymaga zależności @fontsource-variable/inter, licencja OFL) — decyzja lidera.

## Commit 2 — pasek boczny + szyna (zrzuty 089–092, 099; folder 01-new-agent)
- Szyna ikon 52 px, przyciski 36 px / promień 8, stan aktywny `--cosgral-bg-control-hover`.
- Wiersz wyszukiwania: pole + „+” z menu: Nowy agent, Nowy kanał (gdy jest `onSelectChannels`), Nowy folder (gdy `layout && folderActions`). Usunięto osobne przyciski w nagłówku.
- Kontrola: Sidebar.folders 25/25, App.folders 6/6, i18n 9/9, typecheck:renderer OK, Biome OK, check:ui OK. App.test.tsx: 91/92; jedyny czerwony `hides and shows without dropping…` (menuitem „Ukryj”) jest czerwony także BEZ moich zmian (sprawdzone na Sidebar.tsx z HEAD) — do naprawy osobno (test zakłada polski język).
- Nie zrobiono: filtr zakładek wyszukiwarki globalnej (Wszystko/Agenci/Kanały/Wiadomości/Pliki/Rutyny), zwijanie szyny, karta „mobile”. Storybook/test:visual/Electron nie uruchamiano.
