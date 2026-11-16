# W5-UI2a: użycie konta i karty limitu

Gałąź: `team/ui/w5-ui2a` (z `team/ui/w4-ui5` + merge `team/ui/w5-ui1b`). Bez push. Bez Electrona i bez `sandbox:e2e`.

## Co zbudowałem (EN, mock)

1. **AccountUsageMeter** — okno użycia przy koncie: pasek (`<meter>`), stany OK / Exhausted / Unknown, reset time, fokus klawiatury (`tabindex` + focus-visible), etykiety dla czytnika (`region` / `fieldset` / `meter` aria-label). Tokeny: `--openbot-danger`, `--openbot-accent`, `--openbot-bg-secondary`, soft backgrounds.
2. **AccountLimitReachedCard** — karta „Limit reached”: powód, wyczerpane konto, przełączenie na konto X **albo** komunikat że cała pula wyczerpana; przycisk „Return to … after reset” **tylko** gdy `canReturnAfterReset` + etykieta powrotu; bez martwych przycisków.
3. **AccountSwitchedCard** — „Switched to account X”, informacyjna, zamykana (Dismiss).
4. Historie Storybook `COSGRAL/Account usage limits` (7): ok, exhausted, unknown, limit-switched (interakcja Return+Dismiss), limit-all (brak Return), switched notice (Dismiss), ok light.

## Z kontraktu vs zgadnięte

| Element | Źródło |
|---|---|
| `ProviderAccount` (label, provider, `limitedUntil`) | kontrakt UI1b / BE2 na gałęzi |
| `AccountUsageWindow` primary/secondary (`usedPercent`, `resetsAt`, `windowDurationMins`) | kontrakt `ipc-conversation` (istniejące AccountUsage) |
| `ProviderUsage` jako mostek gdy brak okien per konto | kontrakt W3 providers |
| Etykiety „5-hour” / „Weekly” z `windowDurationMins` | **zgadnięte** z spec U01 (mapowanie primary≈5 h, secondary≈tydzień) |
| View modele `AccountLimitReachedView` / `AccountSwitchedView` | **zgadnięte** do czasu W5-K1 (brak zdarzenia switch w kontrakcie) |
| Przycisk powrotu po resecie | **zgadnięte** zachowanie UI (spec wiersz 22 / F34); brak IPC `returnAfterReset` dla kont |
| Podpięcie do App/Conversation | **nie** — tylko komponenty + Storybook/testy; K1 musi dać zdarzenia |

## Dowody

- Unit (tylko nowe pliki): AccountUsageMeter 4/4 + AccountLimitCards 3/3 = **7/7**.
- Biome na zmienionych plikach: zielony. `check:ui`: zielony. `typecheck:renderer`: zielony.
- Historie napisane z `play` (interakcje); **nie** uruchamiałem Storybook Chromium w tej sesji (KK/Backend mają e2e — jedno ciężkie naraz).

## Czego nie sprawdziłem

- Electron, sandbox:e2e, prawdziwe limity / atrapa K1, podpięcie do żywej rozmowy.
- Pełny `bun run check` / build / typecheck:node / test całego repo.
- Storybook test-runner i ręczny podgląd kontrastu poza tokenami w CSS.
- Czytnik ekranu poza atrybutami ARIA w teście.
