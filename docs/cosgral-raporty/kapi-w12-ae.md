# KAPI-AE (kolejka #21) — ProviderPicker / DataWipeSection / AcpLogin

**Gałąź:** `team/kapi/w12-p`  
**Baza:** `codex/cosgral-desktop` @ `2dfb55f09`  
**Bez push.** Bez Electron / dist:win (brak `GO-kapi-dist.txt`).

## Co

1. **`ProviderPicker`:** statusy Available / Sign in / Not installed / itd. przez `t()`.
2. **`DataWipeSection`:** Usuń moje dane + potwierdzenie przez `t()`.
3. **`AcpLogin` (karta):** Signed in / Log in / kod / Cancel przez `t()` (preset card: częściowo EN).
4. Katalogi: +~19 kluczy PL/EN.

## Testy

| Co | Wynik |
|---|---|
| Biome (własne) | OK |
| `typecheck:renderer` | OK |
| `i18n.test` | 8/8 |

## Notka UI

Wybór dostawcy (badge statusu), wipe danych i logowanie ACP po PL.

## Luki

- `#3` / `#7` `dist:win` czekają na `GO-kapi-dist.txt`.
- Tip nie wymaga odświeżania `merge-preview` — dogonić po scaleniu.
- `AcpPresetCard` (komendą instalacji) jeszcze EN.
