# KK Fullstack: W4-T4, domknięcie G1 (kontrast w Storybooku)

Data: 15.11.2026. Gałąź `team/kk/w4-g1c` (od `team/kk/w4-g1b`, która zawiera obrazy Windows i poprawkę PageRail).

## Wynik w jednej linii

**G1 zielone: pełne `bun run check` jednym poleceniem, exit 0, 709 s, kod @ `8bbaf2175`.** Wszystkie 11 etapów zielone, w tym `test:storybook` 209/209 i `test:visual` 4/4.

## Co zmieniłem w kodzie

| Plik | Zmiana | Rodzaj |
|---|---|---|
| `src/renderer/src/styles.css` | jedna wartość: `--openbot-danger` `#e47d75` → `#e88f88` | **kod programu** (za zgodą lidera) |
| `src/renderer/stories/theme-frame.tsx` | ramka jasnego podglądu: aliasy tokenów, kolory, nakładki, reguła przycisku zatwierdzenia | tylko podgląd/stories |
| `src/renderer/stories/SelectionActions.stories.tsx` | pomiar szerokości paska po zakończeniu animacji | tylko test |
| `docs/cosgral/PLAN-W4.md`, `COSGRAL-CHANGES.md`, ten raport | stan G1 | dokumentacja |

Nic innego w kodzie programu nie zostało zmienione.

## 1. Token `--openbot-danger` (ciemny motyw)

Liczyłem kontrast tekstu tokenu na każdym ciemnym tle, na którym może leżeć: canvas `#070707`, sidebar `#111111`, control `#1b1b1b`, tabela (nagłówek `#242424`, treść `#1a1a1a`), surface `#262626`, raised `#2f2f2f`; każde też z nakładką `danger-soft` (13%) i z nakładką hover (6%), oraz `bg-control-hover` `#313131`. Użycia w CSS przejrzałem po regułach (43 reguły z `color` albo `fill`, w `app-shell`, `auth`, `conversation`, `cosgral`, `cosgral-pages`, `dock`, `primitives`); okna, menu i popovery leżą na surface, dialog usuwania agenta na control, strony na canvas.

| Wartość | Najgorszy przypadek (tekst) | Surface + `danger-soft` (przypadek z axe) |
|---|---|---|
| `#e47d75` (było) | 3,92:1 (raised + soft) | 4,41:1 |
| `#e8827a` (propozycja z W4-T3) | 4,14:1 (raised + soft) | 4,66:1 |
| **`#e88f88` (wybrane)** | **4,56:1** | 5,0:1 |

Dlaczego nie `#e8827a`: na `raised` + `danger-soft` daje 4,14:1, a tak (menu na surface z podświetleniem hover i plakietki na `raised`) tekst może leżeć. `#e88f88` to najmniejsze rozjaśnienie, przy którym najgorszy realny przypadek ≥ 4,5:1.

Użycia jako tło lub ramka (kropki stanu, pulsująca kropka oczu, ramki): to elementy graficzne, kontrast względem canvas 8,36:1 (wymóg 3:1). Pochodne tokeny (`--openbot-file-red`, `--openbot-coral`, `--danger`) idą za tokenem.

**Skutek uboczny (nie naprawiany, poza zgodą):** przycisk „Delete” w oknie usuwania agenta i folderu (`.bot-delete-confirm`) ma jasny tekst `#f2f2f2` na wypełnieniu `--openbot-danger`. Było 2,50:1 (już poniżej 4,5:1), jest 2,15:1. Propozycja na osobne zadanie: ciemny tekst `--openbot-text-on-light` (7,65:1 na nowym kolorze).

**Nie policzyłem:** `bg-control-active` + `danger-soft` (stan wciśnięty przycisku ze stłumionym tłem): 4,10:1 przy nowej wartości; nie znalazłem komponentu, który tak układa tło, ale nie zbadałem każdego stanu.

## 2. Jasny podgląd (8 historii)

Przyczyna była inna niż „złe kolory”. Arkusz aplikacji definiuje aliasy typu `--openbot-active: var(--openbot-bg-surface)` na `:root`. Zmienna CSS jest rozwiązywana tam, gdzie jest zadeklarowana, więc ramka podglądu nadpisywała tokeny bazowe, ale aliasy zostawały ciemne: wiersz agenta miał tło `#262626` i tekst `#14141c` (1,21:1). Naprawa w `theme-frame.tsx` (tylko podgląd):

1. Ramka deklaruje aliasy ponownie (`LIGHT_ALIASES`, 36 zmiennych), więc idą za jasnymi wartościami.
2. Kolory jasnego podglądu przyciemnione do ≥ 4,5:1 na tłach jasnych i na nakładkach soft: warning `#9a6b12` → `#6e4a0d`, danger `#b3261e` → `#aa241d`, success `#1d7a3f` → `#1a6e39`, unread `#74b9ff` → `#1f5fbf`.
3. Jasne wartości dla tokenów tabel i nakładek (`--openbot-bg-overlay`, `--openbot-command-overlay`, `--openbot-bg-glass`, `--openbot-data-table-*`), które były ciemne w jasnym podglądzie.
4. Reguła tylko w podglądzie: etykieta przycisku zatwierdzenia jest biała (`.approval-button-primary`). Przycisk wypełnia się kolorem success z ciemnym tekstem; na ciemnozielonym (wymagany dla tekstu plakietek) nie da się mieć obu 4,5:1 jednym tokenem.

Bez `a11y: { test: "todo" }` i bez zmiany `test: "error"`: wszystkie 8 historii przechodzą pełną regułą.

## 3. Test niestabilny z bazy: `SelectionActions · Custom Instruction`

W pierwszym pełnym `bun run check` po zmianach pojawił się jeden nowy błąd: „expected 3,86 to be less than 1” (szerokość paska). Powtórzony osobno: 3 z 3 razy czerwony (3,86; 3,86; 2,74), choć wcześniej ten plik przechodził w 5 pełnych przebiegach. Ten sam błąd przy starym tokenie, więc nie wynika z W4-T4. Przyczyna: pasek animuje szerokość 240 ms po starcie, a test mierzył „szerokość początkową” od razu; na wolniejszym komputerze łapie animację w połowie (różne wartości = różne fazy). Naprawa: test czeka, aż szerokość przestanie się zmieniać (do 3 s), zanim ją zmierzy. 6/6 w 3 przebiegach. Plik pochodzi z importu bazy, nie był wcześniej zmieniany.

## 4. Wynik

Pełne `bun run check` (jedno polecenie, nic równolegle): **exit 0, 709 s**. Wcześniejszy przebieg po tokenie i ramce (przed poprawką SelectionActions) padł na tym jednym teście po 564 s.

| Etap | Wynik | Czas |
|---|---|---|
| `check:ui` | zielony | 1 s (W4-T2) |
| `lint` | zielony | 30 s (W4-T2) |
| `typecheck` | zielony | 63 s (W4-T2) |
| `test` | zielony: 212 plików, 1343 testy | 359 s (ten przebieg) |
| `test:storybook` | zielony: 50 plików, 209 testów | 97 s (ten przebieg) |
| `test:visual` | zielony: 4 testy | 8,5 s (ten przebieg) |
| `test:api` | zielony: 6 plików, 29 testów | 2 s (ten przebieg) |
| `test:browser` | zielony | 11 s (W4-T2) |
| `api:build` | zielony | 29 s (W4-T2) |
| `build-storybook` | zielony | 91 s (W4-T2) |
| `build` | zielony | 15 s (W4-T2) |

`bun run check` nie wypisuje czasów etapów; wartości oznaczone „W4-T2” pochodzą z osobnych przebiegów w tamtym zadaniu, „ten przebieg” z podsumowań testów w logu pełnego `check`. Całość: 709 s.

## Obrazy wzorcowe

**Żaden obraz nie został zmieniony.** `test:visual` przechodzi 4/4 na obrazach Windows z W4-T3 bez aktualizacji: zmiana koloru danger (przyciski usuwania w panelu kolejki) mieści się w tolerancji testu (`allowedMismatchedPixelRatio` 0,2%). Nie mierzyłem, ile pikseli się przesunęło.

## Czego nie sprawdziłem

- `sandbox:e2e` i skryptu odbioru (38 kroków) po tych zmianach: zmiana koloru nie dotyka logiki, ale w prawdziwym oknie jej nie obejrzałem. Nie oglądałem też wyglądu jaśniejszego koloru danger w całym programie (tylko w historiach Storybook i na obrazach z `test:visual`).
- Przycisku „Delete” w oknie usuwania (kontrast spadł do 2,15:1, patrz wyżej).
- Stanu wciśniętego (`bg-control-active` + `danger-soft`) dla tekstu danger.
- Obrazów macOS i innych komputerów z Windows (obrazy Windows z jednej maszyny).
- Czy test paska zaznaczenia był niestabilny też przed W4-T4 na tym komputerze: wcześniejsze 5 przebiegów przeszło; przyczynę (animacja) ustaliłem z kodu i z różnych wartości błędu, bez osobnego pomiaru.
- Pełnego `check` po commitach tylko z dokumentacją (zmieniają wyłącznie pliki Markdown).
- Potwierdzenia bramki G1 przez właściciela (decyzja 5 w `PLAN-W4.md`).

## Pliki i dowody

Kod: `src/renderer/src/styles.css`, `src/renderer/stories/theme-frame.tsx`, `src/renderer/stories/SelectionActions.stories.tsx`. Dokumenty: `docs/cosgral/PLAN-W4.md`, `COSGRAL-CHANGES.md`, `kk-w4-g1b.md` (dopisek), ten raport. Logi pełnych przebiegów `check` są poza repo, w folderze współdzielonym piaskownicy (`acceptance\g1b`).
