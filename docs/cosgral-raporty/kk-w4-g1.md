# KK Fullstack: W4-T2, odbiór po W4-UI1/UI2 i bramka G1

Data: 15.11.2026. Integracja `codex/cosgral-desktop` @ `70bd42747`, gałąź robocza `team/kk/w4-g1`. Sprzęt: Windows 10, ok. 2 GB wolnego RAM, jeden ciężki proces naraz.

## Wynik w jednej linii

- Odbiór w prawdziwym Electronie: **38/38 kroków, 0 błędów konsoli** (243 s). 37 dawnych kroków przeszło bez żadnej zmiany selektorów po przebudowie kontrolek w W4-UI2; dodany krok wiersza 14.
- Parytet: **26 jest + 18 częściowo = 35 z 44 = 79,5%** (było 34,5 = 78,4%). Zmienił się tylko wiersz 14: częściowo → jest.
- G1: 9 z 11 etapów zielonych. **Czerwone: `test:storybook` i `test:visual`, bo na tym komputerze nie ma przeglądarek Playwright** (nie ma regresji produktu).

## Krok 1: odbiór (`scripts/sandbox-acceptance.ts`)

Uruchomienie: `COSGRAL_SANDBOX_ROOT=<folder poza repo> node scripts/sandbox-acceptance.ts --keep`, osobny profil (własne `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`), atrapa Codex `scripts/acceptance-codex.cjs`.

Zmiany tylko w skryptach (kod programu bez zmian):

- `scripts/sandbox-acceptance.ts`: nowy krok **14** (okno „Nowy kanał”): utworzenie kanału z liderem i dwoma agentami, edycja, wiadomość człowieka, sprawdzenie delegowania do obu członków, odpowiedź powiązana z wiadomością, na stronie Tasks: Pause → Resume → Stop zadania wstrzymanego w trakcie pracy. Skrypt wspiera `COSGRAL_ONLY=<wiersze>` (ponowny przebieg wybranych kroków na zachowanych danych) i zapisuje wynik po każdym kroku.
- `scripts/acceptance-codex.cjs`: atrapa rozumie teraz tury kanału (kontekst JSON): lider przydziela zadania członkom i składa wynik, członek odpowiada, tytuł `HOLD` zostawia zadanie w toku (do testu Stop/Resume).

Wynik per wiersz parytetu (ok = krok przeszedł w prawdziwym oknie):

| Wiersz parytetu | Krok | Wynik | Zmiana stanu w parytecie |
|---|---|---|---|
| 40 onboarding | 40 | ok | bez zmiany |
| 9 czat | 9 | ok | bez zmiany |
| 5 stan agenta | 5 | ok | bez zmiany |
| 17 kolejka | 17 | ok | bez zmiany |
| 10 karta pytania | 10 | ok | bez zmiany |
| 6 Needs you | 6 | ok | bez zmiany |
| 11 karta zatwierdzenia | 11 | ok | bez zmiany |
| 12 karta szkicu | 12 | ok | bez zmiany |
| 8 stan błędu | 8 | ok | bez zmiany |
| 7 stan limitu | 7 | ok | bez zmiany |
| 18 szukanie w rozmowie | 18 | ok | bez zmiany |
| 19 szukanie globalne | 19 | ok | bez zmiany |
| 3 pasek boczny | 3 | ok | bez zmiany |
| 4 foldery | 4 | ok | bez zmiany |
| 21 ustawienia agenta | 21 | ok | bez zmiany |
| 23 pamięć | 23 | ok | bez zmiany |
| 22 szablony | 22 | ok | bez zmiany |
| **14 kanały: lider i członkowie** | **14** | **ok** | **częściowo → jest** |
| 41 Marketplace | 41 | ok | bez zmiany |
| 29 tabele | 29 | ok | bez zmiany |
| 30 pliki | 30 | ok | bez zmiany |
| 26 Vault | 26 | ok | bez zmiany |
| 25 MCP | 25 | ok | bez zmiany |
| 27 rutyny | 27 | ok | bez zmiany |
| 28 workflowy | 28 | ok | bez zmiany |
| 13 przejęcie przeglądarki | 13 | ok | bez zmiany |
| 35 dostawcy | 35 | ok | bez zmiany |
| 16 panel boczny | 16 | ok | bez zmiany |
| 33 zdalny pulpit | 33 | ok | bez zmiany |
| 37 dok | 37 | ok | bez zmiany |
| 38 wyspa | 38 | ok | bez zmiany |
| 39 ustawienia | 39 | ok | bez zmiany |
| 42–44 telefon | 42-44 | ok | bez zmiany |
| restart (R1–R5) | R1–R5 | ok | bez zmiany |

Wiersz 14, co dokładnie sprawdzono w oknie: (a) przycisk „Nowy kanał” → okno, wybór lidera i dwóch agentów, utworzenie; (b) edycja tytułu; (c) wiadomość człowieka w kanale → lider przydzielił zadania obu członkom i oba skończyły „Done”, czyli członkowie dostali wiadomość; (d) odpowiedź na wiadomość ma w silniku `replyToMessageId`; (e) na stronie Tasks zadanie zatrzymane w trakcie pracy: Pause, Resume, Stop działają i zmieniają stan wiersza.

Parytet (`docs/cosgral/parytet-0.68.md`): wiersz 14 → jest; 26 jest, 18 częściowo, 0 brak = 35 z 44 = **79,5%**. Dolna granica (wiersze 1, 32, 36 „nie do sprawdzenia tu” liczone jako 0): 33,5 z 44 = 76,1%.

## Krok 2 i 3: bramka G1 (etapy `bun run check`, po jednym)

Każdy etap osobno przez `bun run <etap>`, `VITEST_MAX_WORKERS=2`, `CI=1`, logi poza repo. Etapy w kolejności z `package.json`.

| Etap | Wynik | Czas | Uwagi |
|---|---|---|---|
| `check:ui` | zielony | 1 s | dług natywnych kontrolek = 0 |
| `lint` (Biome) | zielony | 30 s | |
| `typecheck` (node + renderer) | zielony | 63 s | |
| `test` (pełny, vitest) | zielony | 435 s | 207 plików, 1326 testów, w jednym przebiegu (RAM wystarczył) |
| `test:storybook` | **czerwony** | 53 s | `browserType.launch: Executable doesn't exist` (patrz niżej); żaden test się nie uruchomił |
| `test:visual` | **czerwony** | 5 s | ten sam brak przeglądarki; żaden test się nie uruchomił |
| `test:api` | zielony | 4 s | 6 plików, 29 testów |
| `test:browser` | zielony | 11 s | smoke test BrowserHost w Electronie (karty, ciasteczka, pobieranie, trwałość kart). Ostrzeżenie `ERR_EMPTY_RESPONSE` dotyczy celowego adresu `/abort` |
| `api:build` | zielony | 29 s | |
| `build-storybook` | zielony | 91 s | |
| `build` | zielony | 15 s | |

Razem: 9 zielonych, 2 czerwone, bez poprawek w programie ani w testach (nic do poprawienia).

### Co dokładnie brakuje (czerwone etapy)

Testy `test:storybook` i `test:visual` uruchamiają Chromium przez Playwright (`@vitest/browser-playwright` 4.1.10, `playwright ^1.62.1`). Na tym komputerze nie ma folderu `AppData\Local\ms-playwright`, więc brakuje pliku `chromium_headless_shell-1234\chrome-headless-shell-win64\chrome-headless-shell.exe` (wersja przeglądarki, której oczekuje zainstalowany Playwright). To nie jest błąd kodu ani testu: vitest kończy się już przy starcie przeglądarki („Tests: no tests”, 50 plików storybook i pliki wizualne nie ruszyły).

Co trzeba zrobić: pobrać przeglądarkę poleceniem `bunx playwright install chromium` (ok. 100–150 MB, wymaga internetu, zapis w profilu użytkownika). **Nie zrobiłem tego**: polecenie z zadania mówi opisać brak, a pobieranie przeglądarek do profilu to zmiana poza repo. Decyzja leży po stronie lidera. Po instalacji do zrobienia: `test:storybook`, `test:visual`, a przy zmianie wyglądu po W4-UI2 możliwe są różnice w obrazach wzorcowych (snapshoty), wtedy aktualizować je świadomie po obejrzeniu.

## Czego nie sprawdziłem

- Wizualnych testów i testów Storybook (brak Chromium Playwright), czyli nie wiem, czy zmiany wyglądu z W4-UI2 przesunęły obrazy wzorcowe i czy historie Storybook działają w przeglądarce. `build-storybook` buduje się, ale to nie to samo co uruchomienie.
- Wiersza 14 z prawdziwym modelem i dwoma członkami (wyłącznie atrapa Codex; W4-T1 sprawdził tylko lidera-członka na Claude).
- Przejęcia zadania przez innego członka (Reassign) w oknie.
- Wiersze 1, 32, 36 (sieć i konto): bez zmiany, nadal „nie do sprawdzenia tu”.
- Systemy inne niż Windows 10; jednorazowy przebieg każdego etapu (bez powtórzeń pod kątem niestabilnych testów).
- Pełnego `bun run check` jednym poleceniem: etapy puszczone osobno przez własny skrypt (ten sam zestaw i kolejność), bo wynik per etap był celem. `check` zatrzymałby się na pierwszym czerwonym (`test:storybook`).

## Pliki

`scripts/sandbox-acceptance.ts`, `scripts/acceptance-codex.cjs`, `docs/cosgral/parytet-0.68.md`, `COSGRAL-CHANGES.md`, ten raport. Dowody (logi etapów, wynik odbioru) są poza repo, w folderze współdzielonym piaskownicy.
