# W11-UI1 — wygląd klasy OpenBot 0.71 w COSGRAL (własna implementacja)

Źródło wartości: pomiary ekstraktora (poza repo). W repo są tylko nasze tokeny i kod.

## Commit 1 — tokeny
- `styles/cosgral-tokens.css`: `--cosgral-*` (ciemny + jasny). `--openbot-*` w styles.css wskazują na nie, więc cała aplikacja zmienia wygląd naraz.
- Jasny akcent #0069d9 (nie #007cf7), bo test kontrastu wymaga 4,5:1 dla białego tekstu na akcencie; w ciemnym #007cf7 daje ok. 4,0:1 przy białym tekście (do oceny wizualnej).
- Kontrola: theme-palette + theme test 4/4, check:ui OK, Biome OK.
- Nie sprawdzono: Storybook, test:visual (wzorce zmienią się — wymagają GO i aktualizacji po ocenie), Electron. Czcionka Inter nie jest dołączona (wymaga zależności @fontsource-variable/inter, licencja OFL) — decyzja lidera.
