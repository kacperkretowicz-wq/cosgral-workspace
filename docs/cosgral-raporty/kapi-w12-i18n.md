# KAPI-D — audyt PL/EN (Dostawcy / Konta / Użycie)

Gałąź: `team/kapi/w12-i18n` z integracji `4a02078bc`.

## Wynik

Naprawiona mieszanka PL/EN na stronie Dostawcy (zrzut 14-providers): konta były po polsku na sztywno, a przełącznik limitu i reszta strony po angielsku.

### Poprawione (klucze `t()` + `en.ts` / `pl.ts`)

| Plik | Co |
|---|---|
| `ProviderAccounts.tsx` | Cały ekran Konta/pula — wcześniej ~40 sztywnych napisów PL + 1 EN (`Return to the first account…`) |
| `UsagePage.tsx` | Tytuł, opis, błędy |
| `ProvidersPage.tsx` | „Usage and limits”, Refresh, fallback, aria |
| `ProviderCatalogPanel.tsx` | Plakietki wsparcia (Built in / preset / …) przez `t()` |

### Dla UI Designera (nie edytowałem)

| Plik | Problem |
|---|---|
| `PluginAppsPanel.tsx` | `FILTERS` / `STATE_LABELS` po angielsku bez `t()` (Marketplace Apps) |
| `MarketplaceGallery.tsx` / `Workflows*` | poza zakresem tej tury (kolejka UI-V) |

### Testy

- `i18n.test.tsx` + `ProviderAccounts.test.tsx` — **20/20** (lokatory EN po `t()`)
- Biome na 8 plikach — OK
- Pełny `typecheck:renderer` / Electron — nie (limit modelu; lekka tura)

### Notka dla UI

W PL język bierze angielski klucz z `t("…")` i tłumaczy z `pl.ts`. Sztywny tekst w TSX = zawsze EN albo zawsze PL niezależnie od ustawienia.

## Nie sprawdzone

Electron / zrzut 14 po poprawce; pełny `typecheck:renderer`; pozostałe sztywne EN w ProvidersPage (formularze ACP poza Usage/Fallback).
