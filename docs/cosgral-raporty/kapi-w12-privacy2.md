# KAPI-H — skan prywatności (zakres po cd7c8dc3e)

**Zakres:** `cd7c8dc3e..aac9b989c` (`codex/cosgral-desktop`).  
**Metoda:** tylko odczyt `git diff` / `git grep`; bez testów.  
**Werdykt:** **NIECZYSTE** — 3 linie ze ścieżką prawdziwego profilu Windows.

## Trafienia (plik:linia)

| Plik:linia | Rodzaj | Notka (bez danych właściciela) |
|---|---|---|
| `docs/cosgral-raporty/backend-w12-check-prep.md:7` | ścieżka `C:\Users\<profil>\…` | komenda `cd` do worktree Shared |
| `docs/cosgral-raporty/backend-w12-check-prep.md:8` | ścieżka `C:\Users\<profil>\…` | `PATH` z `Shared\tools\…` |
| `docs/cosgral-raporty/backend-w12-check-prep.md:10` | ścieżka `C:\Users\<profil>\…` | `--out` do `Shared\cosgral-sandbox\…` |

**Naprawa (nie w tym zleceniu):** zamienić na placeholdery typu `C:\Users\<profil>\OpenBot\Shared\…` albo ścieżki względne / `%USERPROFILE%`.

## Czyste w zakresie

| Wzorzec | Wynik |
|---|---|
| E-maile prywatne / imię właściciela w diffie | **0** |
| Tokeny `sk-…` / `ghp_…` / `AIza…` / `Bearer` / `PRIVATE KEY` | tylko wzorce w poprzednim raporcie prywatności — **0** wartości |
| Prefiksy Slack `xoxb-` / `xapp-` | tylko opis w raporcie prywatności |
| `AppData\Roaming\OpenBot` | ostrzeżenie w docs (co **nie** czytać) |
| `openbot-0.71` / PolyForm | tylko odniesienia „poza repo” w docs |
| Nowe `.png` / `.zip` / `.asar` / `.vitest-attachments` / `__screenshots__/*actual*` w commitach zakresu | **0** (w worktree lokalnie leżą nieśledzone śmieci checku — **nie commitować**) |
| `C:\Users\demo\…` w `kk-w12-web-preview.md` | fikcyjne — OK |

## Nie sprawdzone

- Tip nowszy niż `aac9b989c` (przy kolejnych commitach powtórzyć skan).
- Pełne porównanie bajtów paczki `openbot-0.71` (PolyForm) vs źródła.
- Treść zrzutów poza repo.

## SHA

Raport na `team/kapi/w12-privacy2` (baza `aac9b989c`); SHA commita w channel_result.
