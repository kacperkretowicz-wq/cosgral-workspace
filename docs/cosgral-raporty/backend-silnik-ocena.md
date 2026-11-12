# Backend: ocena silnika (12.11.2026)

Zadanie: prośba właściciela „jeśli silnik taki jak OpenBot jest lepszy i bardziej pasuje, weźcie go pod uwagę; wybierzcie najlepsze opcje”.
Gałąź `team/backend/b1-local-core` od `23ca29fa9`, worktree `Shared\cosgral-wt\desktop-backend`.

## Werdykt

**Silnik = OpenBot 0.1.11 (Apache-2.0), rozwijany przez nas.** Paperclip zostaje wstrzymany jako źródło wzorców (MIT). Goose, AnythingLLM i Jan odpadają: inny kształt produktu i inny wygląd. Uzasadnienie, porównanie, plan „lepszy niż OpenBot” i ryzyka: [`docs/cosgral/silnik.md`](../cosgral/silnik.md).

## Co zrobiłem

1. Przeczytałem kod bazy 0.1.11: moduły `src/backend`, `src/main`, `apps/auth-api`, `packages/contracts`, zależności i licencje. Kodu nowszego niż `a6fe240` nie otwierałem.
2. Porównałem rozmiar z Paperclip (`git ls-files` i liczba linii) oraz wyniki z F1.
3. Na własnym worktree zmierzyłem bazę na Windows: install, typecheck, testy backendu, build i start okna w piaskownicy.
4. Sprawdziłem w sieci licencje Goose, AnythingLLM i Jan (źródła w `silnik.md`).

## Dowody

| Co | Wynik | Gdzie |
|---|---|---|
| `bun install` | EXIT 0, 560 s | `Shared\cosgral-data\desktop-backend\logs\bun-install.log` |
| `typecheck:node` / `typecheck:renderer` | EXIT 0, 31 s / 43 s | `…\logs\typecheck-*.log` |
| `test:backend` | 29/96, 63 z 70 komunikatów to `EBUSY` (otwarta baza SQLite przy sprzątaniu) | `…\logs\test-backend.log` |
| `build` | EXIT 0, 28 s | `…\logs\build.log` |
| start w piaskownicy | okno po 3,2 s, zamknięcie 0,7 s, dane tylko w piaskownicy, brak portów TCP | `…\logs\sandbox-run2.*.log` |
| treść okna | ciemny motyw, ekran łączenia z usługą kont, który nie mija; odczyt rozmów kończy się błędem 401 | zrzut przez DevTools poza repo: `…\evidence\sandbox-content.png` (jest na nim logo OpenBota, więc nie trafia do repo) |

## Znaleziska dla zespołu

1. **Blokada nr 1 dla B1:** bez zewnętrznej usługi kont do programu nie da się wejść, a nawet odczyt stanu rozmów kończy się błędem 401.
2. **Procedura piaskownicy z planu wymaga poprawki.** Electron bierze `appData` z `%USERPROFILE%\AppData\Roaming`, więc w udawanym profilu muszą istnieć `AppData\Roaming` i `AppData\Local`. Bez nich start pada z `Failed to get 'appData' path`. Gotowy układ jest w `silnik.md`, sekcja 5.
3. **Testy na Windows to głównie uprząż testów.** 67 z 70 komunikatów ma przyczyny typowe dla Windows (otwarta baza przy sprzątaniu, symlink, prawa POSIX, atrapa CLI pod macOS); naprawa jest prosta.
4. **Luka do 0.68 dotyczy szerokości funkcji, a nie architektury:** baza ma 8 narzędzi agenta, 0.68 ma 138. Ten sam model (wbudowany serwer MCP + SQLite + kontrakty IPC) przyjmie resztę.

## Nie sprawdzałem

- Plików LICENSE w repozytoriach Goose, AnythingLLM i Jan (opieram się na wynikach wyszukiwania).
- Trybu `authenticated` i adapterów Paperclip w działaniu (opis z kodu).
- Instalatora `dist:win` bazy 0.1.11 i odpowiedzi agentów Claude/Codex: to B1.

## Zapisane poza repo

`Shared\cosgral-data\desktop-backend\`: logi, piaskownica (`sandbox\home`), zrzuty (`evidence\`) i skrypt do zrzutu przez DevTools (`cdp-shot.mjs`). W worktree są tylko pliki git-ignorowane: `node_modules\` i `out\`.

Czas: ok. 1 h 15 min.
