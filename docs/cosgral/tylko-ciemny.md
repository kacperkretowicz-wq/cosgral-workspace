# Tylko ciemny wygląd (27.11.2026)

Kacper zdecydował: jasny motyw znika. COSGRAL Workspace ma jeden wygląd, ciemny, w stylu Hub (graphite, szkło, biały „papier” przy przyciskach i zakładkach).

## Co się zmieniło

- Ustawienia > Wygląd nie mają już listy „Motyw”. Zostają: skala, czcionka, grubość tekstu, akcent, skrót wysyłania, nieprzeczytane najpierw, kroki agenta.
- Usunięte pliki stylów jasnego motywu (`theme-light.css`, `hub-light.css`) i wszystkie reguły `:root[data-theme="light"]` w pozostałych arkuszach, razem z poprawkami jasnego z PR 65.
- Okno zawsze ma `data-theme="dark"` i `color-scheme: dark` (`public/theme-init.js`), więc nie ma błysku jasnego tła przy starcie.
- Aplikacja na telefon też jest tylko ciemna (bez przycisków Systemowy / Jasny / Ciemny na karcie „Ten telefon”).
- Storybook: usunięte wszystkie historie „Light”.

## Zapisane ustawienie „jasny” albo „systemowy”

Ustawienia zapisane wcześniej mają pole `theme` ze starą wartością. Program go nie usuwa (zgodność ze starymi danymi i ze starszymi serwerami we wspólnej przestrzeni), ale **każda wartość znaczy teraz „ciemny”** (`normalizeAppTheme`). Starsza kopia w pamięci przeglądarki okna (`cosgral-theme`) i w telefonie (`cosgral.theme`) jest przy starcie kasowana. Test: `src/backend/agent-settings-theme.test.ts`, `packages/contracts/src/ipc-theme.test.ts`.

## Gdyby kiedyś wrócić do jasnego

Historia git (PR 65 i wcześniejsze) ma pełny kod jasnego motywu. Wrócić trzeba byłoby do całości naraz, bo ciemny wygląd Hub jest teraz jedyny sprawdzany.
