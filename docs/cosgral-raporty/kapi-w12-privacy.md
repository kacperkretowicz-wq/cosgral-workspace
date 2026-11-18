# KAPI-E — skan prywatności przed push

**Zakres:** `b59e6492e..cd7c8dc3e` (to, czego nie ma w origin / GitHub tip).  
**Metoda:** tylko odczyt `git diff` / `git grep` w worktree integracji; bez zmian tam.  
**Werdykt:** **CZYSTE** (brak plik:linia do naprawienia przed push).

## Wzorce sprawdzone

| Wzorzec | Wynik w diffie |
|---|---|
| Nazwa profilu Windows / `Users\<prawdziwa>` | **0** |
| E-maile prywatne (`gmail`/`outlook`/`wp.pl`/…) | **0** |
| Tokeny `sk-…`, `ghp_…`, `AIza…`, `Bearer <długi>`, `BEGIN … PRIVATE KEY` | **0** prawdziwych |
| Prefiksy Slack `xoxb-` / `xapp-` | tylko dokumentacja, walidatory regex i **atrapy** testowe (np. `xoxb-` + powtórzone cyfry) |
| `C:\Users\…` | tylko fikcyjne (`me`, `owner`, przykłady w docs) |
| `%USERPROFILE%` / `APPDATA` / piaskownica | opisy procedur i skryptów — bez ścieżki konta |
| Zrzuty PNG / `.asar` / kopia `openbot-0.71` w repo | **0** nowych binarek w zakresie; brak `.asar` |
| PolyForm-NC / ekstraktor 0.71 | w repo tylko **odniesienia poza repo** (`Shared\cosgral-docs\…`); próbka długich napisów z `texts.json` ekstraktora → **0 trafień 1:1** w `src/` i `packages/` |

## False positive (OK, nie sekrety)

1. Hinty UI / locale: „Starts with `xoxb-`…” — instrukcja kształtu tokenu, bez wartości.
2. Testy Slack/Telegram: sztuczne tokeny budowane w kodzie (`"1".repeat(30)` itd.).
3. E-maile `*@example.test`, `probe@example.invalid`, `noreply@example.com` (VAPID subject).
4. Komentarze o „PRIVATE KEY” / asercje `not.toContain("PRIVATE KEY")` (VAPID zaszyfrowany lokalnie).
5. CSS `--openbot-logo-*` z bazy 0.1.11 (Apache) — nie zasób 0.71.

## Nie sprawdzone

- Pełne porównanie bajt-po-bajcie całej paczki `openbot-0.71\` (PolyForm) vs każde źródło — tylko grepy + próbka napisów UI.
- Treść zrzutów poza repo (`Shared\cosgral-docs\zrzuty-*`) — celowo nie w commicie.
- Tip integracji nowszy niż `cd7c8dc3e` (np. późniejsze scalenia KK) — poza tym zleceniem.

## SHA

Raport na gałęzi `team/kapi/w12-privacy` (baza `cd7c8dc3e`); SHA commita w channel_result.
