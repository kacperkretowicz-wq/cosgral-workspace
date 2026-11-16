# KK Fullstack: W5-FIX1, regresja `sandbox:e2e` po W5-UI1a (bramka „Continue” w onboardingu)

Data: 16.11.2026. Gałąź `team/kk/w5-fix-onboarding` (od `codex/cosgral-desktop` @ `83f6fc747`, potem scalona moja gałąź `team/kk/w5-t2a`, żeby uruchomić kroki C01–C13 i O1 na poprawce).

## Wynik w jednej linii

**Naprawione: „Continue” w onboardingu jest znów aktywne, gdy dostawca ma CLI. `sandbox:e2e` na poprawce: 27/27 ok, 0 FAIL, 0 findings (przebieg 2 i 3); krok O1 i kroki C01–C13 nadal zielone (O1 1/1, C01–C13 13/13).** Jeden niestabilny krok z W4-UI4 padł w pierwszym przebiegu i przeszedł w następnych (opis niżej).

## Przyczyna

W5-UI1a zablokowało „Continue with Codex” w onboardingu, gdy sygnał `cliReady` (z karty zarządzanego CLI) nie mówił, że CLI jest. Karta zarządzanego CLI nie widzi CLI, z którym program został uruchomiony zmienną `OPENBOT_CODEX_PATH` (atrapa w `sandbox:e2e`; w odbiorze W5-T2a karta mówiła wtedy „Brak”, źródło „none”), więc dla takiego dostawcy „Continue” zostawało wyłączone. Zgłoszenie lidera mówiło, że to samo może dotyczyć Codex w `PATH`; tego nie odtwarzałem. W e2e dostawca był „dostępny” (program działał na atrapie), więc krok 1 „first-run screens” nie mógł przejść dalej.

## Zmiana w kodzie programu (jedyna, za zgodą lidera)

| Plik | Zmiana |
|---|---|
| `src/renderer/src/components/InitialSetup.tsx` | `providerHasCli()`: „Continue” jest aktywne, gdy karta zarządzanego CLI mówi, że CLI jest (`cliReady`), **albo** status dostawcy programu (`AgentStatus.providers`, czyli ProviderRegistry) mówi „available” dla wybranego dostawcy. Blokuje tylko dostawcę, który naprawdę go nie ma; wtedy zostaje „Pobierz i przejdź dalej” i „Logowanie wkrótce” (bez martwego przycisku logowania) |
| `src/renderer/src/components/ManagedCliSection.tsx` | `safeCliError` wycina techniczny prefiks `Error invoking remote method '…': Error:` (usterka 1 z raportu W5-T2a), jedna linia |

## Testy

| Test | Wynik |
|---|---|
| `InitialSetup.onboarding.test.tsx` (nowe: „Continue active when the provider already has a CLI the managed-CLI card cannot see”; „blocks Continue only when the provider really has no CLI, offers the download, no sign-in button”; istniejący „downloads a missing CLI” dostał status „not-installed”) | **5/5**. Nowy test „CLI jest” jest **czerwony ze starym warunkiem** (sprawdzone chwilowym cofnięciem) i zielony z poprawką |
| `ManagedCliSection.test.tsx` (nowy: prefiks IPC wycięty, powód zostaje) | **9/9** |
| `bun run lint` | zielony, 37 s |
| `bun run check:ui` | zielony, dług 0/0 |
| `bun run typecheck` (contracts, node, renderer, storybook, api, mobile-app) | zielony, 73 s |
| `bun run build` | zielony, 16 s |

## `sandbox:e2e` w osobnych piaskownicach

| Przebieg | Wynik |
|---|---|
| 1 (na poprawce, przed dodaniem zrzutu błędu) | 26 ok, **1 FAIL**, 0 findings: „navigation: mark a background agent read from its row menu” (`locator.click` timeout 30 s) |
| 2 (po dodaniu zrzutu błędu do skryptu) | **27/27 ok**, 0 FAIL, 0 findings, ok. 3 min |
| 3 (końcowy stan gałęzi, po scaleniu) | **27/27 ok**, 0 FAIL, 0 findings, 146 s |

Krok 1 „first-run screens” przechodzi we wszystkich trzech przebiegach, czyli regresja z onboardingu zniknęła.

**Niestabilny krok z W4-UI4.** „Mark a background agent read from its row menu” padł raz (przebieg 1: kliknięcie „Mark as read” w menu wiersza „Unread helper” nie znalazło pozycji w 30 s) i przeszedł w następnych. Nie wiązałem tego z bramką onboardingu: menu i krok pochodzą z W4-UI4, a onboarding jest wcześniej i przeszedł. Nie ustaliłem dokładnej przyczyny (przebieg 1 nie zapisał zrzutu błędu). Możliwa przyczyna to wyścig między pojawieniem się wiersza, nieprzeczytanymi wiadomościami i otwarciem menu kontekstowego (UI Designer w W4-UI5 poprawiał osobną usterkę fokusu w tym menu). Żeby następnym razem było widać, co było na ekranie, dodałem do `scripts/sandbox-e2e.ts` zapis zrzutu i drzewa dostępności przy każdym nieudanym kroku (do folderu piaskownicy, nie do repozytorium).

## Odbiór CLI po poprawce

Po scaleniu mojej gałęzi W5-T2a: **kroki C01–C13: 13/13 ok**, **krok O1 (onboarding bez CLI): 1/1 ok**, 0 błędów konsoli. O1 nadal sprawdza, że przy dostawcy bez CLI „Continue” jest zablokowane, a „Pobierz i przejdź dalej” działa. Kroki C01–C13 zmieniłem tylko w tym, że gałąź zawiera te z W5-T2a.

## Czego nie sprawdziłem

- **Przyczyny niestabilnego kroku „Mark as read”**: zrzutu z pierwszego przebiegu nie ma; widziałem jedno padnięcie i dwa zaliczenia, nie zmierzyłem częstości.
- **CLI w `PATH` w prawdziwym profilu** (bez zmiennej `OPENBOT_CODEX_PATH`): poprawka opiera się na statusie dostawcy programu i na teście jednostkowym z `available`, a w e2e jest to atrapa. Nie widziałem onboardingu na komputerze, gdzie `codex` jest tylko w `PATH`.
- **Claude** w onboardingu (te same warunki, ale testy i kroki dotyczą Codex).
- **Pełnego `bun run check` i pełnego `bun run test`** (zostawione liderowi). Uruchomiłem lint, `check:ui`, typecheck, build, e2e i dwa pliki testów.
- **Stanu „Checking”**: gdy status dostawcy dopiero się ustala (`checking`), „Continue” zostaje zablokowane do czasu odpowiedzi; to było tak i wcześniej i nie zmieniałem tego.

## Pliki

`src/renderer/src/components/InitialSetup.tsx` (+ test), `src/renderer/src/components/ManagedCliSection.tsx` (+ test), `scripts/sandbox-e2e.ts` (zrzut błędu), `COSGRAL-CHANGES.md`, ten raport. Logi i zrzuty: poza repo, `Shared\cosgral-sandbox\w5-fix1-e2e*` i `acceptance\fix1-*`.
