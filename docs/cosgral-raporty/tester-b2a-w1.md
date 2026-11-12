# Raport Tester B2a — W1

**Gałąź:** `team/tester/b2-parity`  
**Worktree:** `Shared\cosgral-wt\desktop-tester`  
**Data:** 12.11.2026

## Werdykt

Sekcja W1 listy parytetu jest zapisana w `docs/cosgral/parytet-0.68.md` (19 wierszy + 3 akapity współpracy dla UI). Liczby względem bazy 0.1.11: **1 jest / 11 częściowo / 7 brak**. Żadnego testu odbioru nie uruchomiono.

## Co zrobione

1. Zachowany i zacommitowany szkic 6 wierszy, potem `git merge codex/cosgral-desktop` (bez rebase) → `f42d104d6`.
2. Źródła: mapa 0.67.1, README 0.68, changelog v0.68.0, statyczna lista `app.asar` (8250 wpisów), kod worktree.
3. Commit po obszarze: nawigacja → czat/karty → kanały/panel/kolejka/wyszukiwanie + liczby.
4. Dla UI: osobne akapity Needs you, przyklejona Decyzja, Chat | Zadania.

## Liczby W1

| Stan | Liczba |
|---|---|
| jest | 1 |
| częściowo | 11 |
| brak | 7 |

## 10 najważniejszych braków W1

Jak w `parytet-0.68.md`: szyna stron, foldery, Needs you w pasku, limit, błąd, podgląd szkicu, przejęcie przeglądarki, kanały z liderem, Chat | Zadania, sticky Decyzja.

## Dowody / poza repo

- Statyczna lista ASAR i skrypty REA: `Shared\cosgral-data\desktop-tester\rea-0.68` (do usunięcia po analizie; nie w git).
- REA CLI: wynik dopisany w `parytet-0.68.md` sekcja Metoda (timeout → fallback statyczny, albo exit status).

## Czego nie sprawdzono

- Runtime OpenBot 0.68 (klikanie w aplikacji).
- Pełny wynik REA, jeśli nie wrócił w 600 s.
- Testy odbioru z tabeli.
- Obszary poza W1 (B2b).
