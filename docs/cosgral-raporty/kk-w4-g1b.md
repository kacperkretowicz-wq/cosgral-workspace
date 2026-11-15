# KK Fullstack: W4-T3, domknięcie bramki G1 (test:storybook i test:visual)

Data: 15.11.2026. Integracja `codex/cosgral-desktop` @ `ebe31c8c1`, gałąź robocza `team/kk/w4-g1b`.

> **Aktualizacja:** G1 domknięte w W4-T4, pełne `bun run check` zielone. Szczegóły: `kk-w4-g1c.md`. Ten raport opisuje stan sprzed poprawek.

## Wynik w jednej linii

**G1 nadal czerwone: pełne `bun run check` pada na `test:storybook`: 12 z 209 testów w przebiegu, po poprawce jednego nieaktualnego testu zostaje 11, wszystkie to kontrast kolorów.** `test:visual` jest teraz zielone (4/4, stabilne). Żadnej regresji nie wprowadziło W4: te same błędy są na końcu W3 (`ea54e157d`), a na oryginalnym imporcie bazy (`a04be4c22`) wszystkie 159 testów przechodzi.

## Co zrobiłem

1. Pobrałem Chromium do Playwright poza profilem użytkownika: `PLAYWRIGHT_BROWSERS_PATH=<Shared>\tools\playwright`, `bun x playwright install chromium` (32 s, bez `--with-deps`, bez administratora, bez rejestru). `bunx` nie ma w PATH, użyłem `bun x`.
2. `test:storybook` i `test:visual` osobno, potem pełne `bun run check`.

## Wyniki

| Etap | Wynik | Czas | Testy |
|---|---|---|---|
| `test:storybook` (pierwszy przebieg) | czerwony | 149 s | 197 zielonych, **12 czerwonych** z 209 (50 plików, 5 z błędami) |
| `test:visual` (pierwszy przebieg) | czerwony | 17 s | 4 czerwone: brak obrazów wzorcowych dla Windows |
| `test:visual` po wygenerowaniu obrazów | **zielony** | 9–10 s | 4/4, 3 przebiegi z rzędu (generowanie + 2 powtórzenia), bez migotania |
| `test:storybook` po poprawce PageRail (tylko ten plik) | zielony | 61 s | 5/5 |
| **`bun run check` jednym poleceniem** | **czerwony** | 673 s | `check:ui`, `lint`, `typecheck`, `test` (212 plików, 1343 testy) zielone, stop na `test:storybook`: 12 czerwonych (to przebieg sprzed poprawki PageRail) |

`bun run check` zatrzymuje się na pierwszym czerwonym etapie, więc `test:api`, `test:browser`, `api:build`, `build-storybook` i `build` nie były w nim uruchomione. Osobno były zielone w W4-T2 na `70bd42747` (`kk-w4-g1.md`), a po scaleniu W4-BE5 nie powtarzałem ich osobno.

## test:visual: obrazy wzorcowe

W repo były tylko obrazy dla macOS (`*-chromium-darwin.png`, z importu bazy). Dla Windows nie było żadnego, więc nie było z czym porównywać i test nie mógł przejść. Nie „zaktualizowałem” więc istniejących obrazów: **dodałem 7 nowych plików `*-chromium-win32.png`** (osobny commit `e99830f09`, łatwo odrzucić), po obejrzeniu każdego.

Ocena „zamierzone czy regresja”: wyrenderowałem te same ekrany na trzech commitach i policzyłem różnice pikseli (próg: suma różnic kanałów RGB > 24, zrzuty różnic poza repo).

| Obraz | po UI2 vs przed UI2 | przed UI2 vs przed W4 | Ocena |
|---|---|---|---|
| application | 0 px | inny rozmiar (676 → 711 px wysokości) | wyższy o wiersz „New channel” z W4-UI1: zamierzone |
| join-server-dialog | 0 px | inny rozmiar (676 → 711 px) | ta sama przyczyna: zamierzone |
| foundations | 0 px | 0 px | bez zmian |
| host-panel | 0 px | 0 px | bez zmian |
| provider-model-picker | 0 px | 0 px | bez zmian |
| queue-panel-reference | 8 px | 0 px | 8 pikseli z W4-UI2 (0,001%), poniżej progu 0,2% testu |
| queue-panel-drag-state | 8 px | 0 px | jak wyżej |

Wniosek: W4-UI2 jest wizualnie neutralne na tych ekranach, a jedyna zmiana układu to zamierzony wiersz z W4-UI1.

Do wiadomości (nie zmiana W4): w panelu bocznym „Browse channels” i „New channel” wyglądają jak goły, wyśrodkowany tekst, bez wyglądu przycisku. Tak było już przed W4 („Browse channels” na końcu W3), więc to nie regresja, ale warto, żeby UI to obejrzał.

Obrazy macOS zostały bez zmian (nie mam macOS-a, nie sprawdziłem ich).

## test:storybook: 12 błędów, wszystkie sprzed W4

Źródło błędów: dodatek a11y (`axe`) w Storybooku jest ustawiony na `test: "error"`, a przeglądarki nie było, więc te testy nigdy nie były uruchomione na tym komputerze. Dowód, że to nie W4:

| Commit | Wynik `test:storybook` |
|---|---|
| `a04be4c22` (oryginalny import OpenBot 0.1.11) | 159/159 zielone |
| `ea54e157d` (koniec W3, przed W4) | 12 czerwonych z 208: **te same 12 historii** |
| `ebe31c8c1` (integracja po W4) | 12 czerwonych z 209: te same 12 historii |

Podział 12 błędów:

| Grupa | Historie | Przyczyna | Co z tym |
|---|---|---|---|
| Nieaktualny test (1) | `PageRail · In the app` | Test czekał na tekst „Coming soon” po kliknięciu „Schedule”, a „Schedule” jest prawdziwą stroną od W2 | **Poprawione** (commit `68882b367`, tylko plik historii), 5/5 |
| Podgląd jasny (8) | `Eyes`: Bar, Approval screen, Approval camera, Sidebar row (light); `W1Ui2`: Agent row states, Folders tree, Durable Needs you (light); `W3Providers · Light` | Program ma tylko ciemny motyw. „Jasny” to tylko podgląd projektantów w `src/renderer/stories/theme-frame.tsx` (podmiana tokenów). Kontrast tam nie wychodzi: np. tekst `#14141c` na wciąż ciemnym `#262626` (1,21:1), ostrzeżenie `#9a6b12` na `#ececf0` (3,97:1), zatwierdzenie `#141414` na `#1d7a3f` (3,42:1) | **Nie ruszałem**: to nie jest oczywisty błąd testu, a naprawa to dobór kolorów podglądu albo oznaczenie tych historii jako wyjątków. Decyzja lidera/UI |
| Ciemny motyw, produkt (3) | `W3Phone`: Paired Dark, Plain Warning Dark; `W3Providers · Dark` | Token `--openbot-danger: #e47d75` w `src/renderer/src/styles.css` na tle `danger-soft` daje 4,42:1 zamiast 4,5:1 (przyciski „Remove”, plakietka błędu) | **Nie ruszałem** (kod programu). Propozycja: jaśniejszy `#e8827a` (4,67:1 na tym tle po obliczeniu, bez sprawdzenia na wszystkich użyciach tokenu) |

Jedna rzecz do rozstrzygnięcia: błąd w grupie ciemnej to rzeczywista (drobna) wada dostępności w produkcie, od W3 (historie W3Phone/W3Providers są z W3-UI6).

## Co jest do zrobienia, żeby G1 było zielone

1. Ciemny motyw: podnieść jasność `--openbot-danger` (3 historie), np. `#e8827a`; po zmianie sprawdzić pozostałe użycia tokenu i obraz wzorcowy (`foundations`, `queue-panel` mają przyciski danger i mogą się przesunąć o kilka pikseli).
2. Jasny podgląd (8 historii): albo poprawić tokeny w `theme-frame.tsx` (i znaleźć, skąd bierze się ciemne `#262626` w wierszu agenta), albo oznaczyć jasne historie jako `a11y: { test: "todo" }` z uzasadnieniem.
3. Potem raz `bun run check` (ok. 12 min). Dopiero wtedy zaktualizować stan G1 w `PLAN-W4.md`: tu **nie zmieniałem**, bo G1 nie jest zielone.

## Czego nie sprawdziłem

- Co dokładnie nadaje ciemne tło `#262626` pod tekstem w jasnych historiach z wierszem agenta (powód zostawiłem otwarty).
- Czy zmiana `--openbot-danger` nie psuje innych miejsc (propozycja nieprzetestowana).
- Obrazów macOS (brak macOS-a) i innych platform; nowe obrazy Windows wyrenderowane na jednym komputerze (jedna karta graficzna, jedne ustawienia czcionek): na innym komputerze z Windows mogą wymagać aktualizacji. Stabilność: 3 przebiegi na tym komputerze.
- `test:api`, `test:browser`, `api:build`, `build-storybook`, `build` w ramach jednego `bun run check` (zatrzymał się wcześniej); osobno były zielone w W4-T2 na `70bd42747`, nie powtarzałem ich po scaleniu W4-BE5.
- Przebiegu pełnego `bun run check` po poprawce PageRail (poprawka sprawdzona tylko na jej pliku).
- Testu w prawdziwym oknie (`sandbox:e2e`, odbiór): nie dotyczyło tego zadania.

## Pliki

`src/renderer/stories/PageRail.stories.tsx`, 7 plików w `tests/visual/__screenshots__/` (`*-chromium-win32.png`), `COSGRAL-CHANGES.md`, ten raport. Logi i różnice obrazów są poza repo, w folderze współdzielonym piaskownicy (`acceptance\g1b`). Chromium: `Shared\tools\playwright`.
