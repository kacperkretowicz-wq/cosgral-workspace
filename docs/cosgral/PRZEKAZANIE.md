# Przekazanie projektu: co jest, czego nie ma, co dalej (19.11.2026)

**Dla agenta, który zaczyna od zera. Przeczytaj ten plik, potem rób punkty z sekcji „Zacznij tutaj”.**
Pisał lider (Okiestrator). Fakty z commitów, logów i raportów; czego nie sprawdziłem, jest oznaczone.

## 1. Wynik w jednej linii

Integracja `codex/cosgral-desktop` @ **`08822f550`** jest na GitHubie (0 commitów przed `origin`). Pełny `bun run check` zielony na tym commicie. Kod ma ok. **82%** funkcji OpenBota 0.71, ale w prawdziwym oknie sprawdzone jest ok. **53%**. Zespół jest zatrzymany na polecenie właściciela, rutyny wstrzymane.

## 2. Czym jest projekt (założenia)

1. COSGRAL Workspace = własny program na Windows (potem telefon), tylko dla właściciela: wszystkie funkcje OpenBota, wygląd podobny, działa lepiej. Każda funkcja dla człowieka, agenta i API.
2. Baza: OpenBot 0.1.11 (Apache-2.0, `a6fe240`). Kod piszemy sami. **Kod i zasoby z paczki 0.71 NIGDY nie trafiają do repo** (licencja PolyForm Noncommercial, repo jest publiczne).
3. Program uruchamiamy tylko w piaskownicy (osobne USERPROFILE/APPDATA/LOCALAPPDATA). Danych zainstalowanego OpenBota właściciela nie ruszamy.
4. Bez push na gałąź domyślną, bez `--force`. Przepisanie historii i zmiana widoczności repo tylko za wyraźną zgodą właściciela.
5. Prawdziwe konta i logowania tylko przez właściciela. Do właściciela piszemy tylko przy blokerze.

## 3. Gdzie są pliki

| Co | Ścieżka |
|---|---|
| Integracja (tylko lider scala) | `<Shared>\cosgral-desktop` (gałąź `codex/cosgral-desktop`) |
| Worktree ról | `Shared\cosgral-wt\desktop-{backend,ui,kk,kapi,tester}` (gałęzie `team/<rola>/<temat>`) |
| GitHub | `https://github.com/kacperkretowicz-wq/cosgral-workspace` |
| Narzędzia | `Shared\tools\bun`, `Shared\tools\node`, `Shared\tools\git\cmd`, `Shared\tools\playwright` |
| Logi, GO, piaskownice | `Shared\cosgral-sandbox` (logi checków: `check-*.log`) |
| Materiały 0.71 (POZA repo) | `Shared\cosgral-docs` (zrzuty, ekstraktor, `openbot-0.71-*.md`, zrzuty Testera `zrzuty-cosgral-17-11-*`) |
| Plan i decyzje | `docs/cosgral/PLAN.md`, `PLAN-W4.md`, `PLAN-W5.md`, `DECYZJE-WLASCICIELA.md`, `pytania-do-wlasciciela.md` |
| Parytet 0.71 (procenty, luki) | `docs/cosgral/parytet-0.71.md`, `luki-silnika-071.md` |
| **Kolejka zadań (stąd bierzesz pracę)** | `docs/cosgral/KOLEJKA-ZADAN.md` |
| Jak uruchomić program | `docs/cosgral/URUCHOMIENIE-DLA-WLASCICIELA.md`, `PRZEWODNIK.md` |
| Raporty agentów | `docs/cosgral-raporty/` (np. `backend-w12-ae.md`, `kapi-w12-au.md`, `tester-w12-tl.md`, `kk-w12-an.md`) |
| Podgląd w przeglądarce (zbudowany, nie wgrany) | `cosgral-desktop\out\web-preview` |
| Instalator `.exe` (stary, 18.11) | zmierzony w `Shared\cosgral-docs\dist-win-measurements`, raport `kapi-w12-l.md` |

## 4. Liczby (źródła: `parytet-0.71.md`, logi checków)

| Miara | Wynik |
|---|---|
| Parytet w kodzie | 81,8% (63 z 77 funkcji: 53 jest, 20 częściowo, 4 brak) |
| Ostrożnie (z dowodem w oknie) | 61,0% |
| Sprawdzone w oknie programu | 52,6% |
| Wygląd vs 0.71 (7 ekranów P0/P1) | 4 zgodne / 3 częściowo / 0 brak |
| Pełny check na `08822f550` | lint, 6 typechecków, **3389 testów**, Storybook **366**, wizualne 7, API 29, build: zielone |
| e2e i kroki W5 w Electronie | 0 FAIL, W5 33/33 (T-AL, na `978195fbd`; **nie** powtórzone na `08822f550`) |

## 5. Czego NIE zrobiono

1. **Podgląd w przeglądarce nie został odświeżony.** Wersja jest zbudowana (`out/web-preview`, 1,84 MB), ale `openbot.replace_site` dwa razy zwróciło „fetch failed”. Strona: site id `719c8813-2101-48c4-9b82-cd2fd968d983`, adres w `PLAN.md`. Ponów podmianę (tytuł „COSGRAL Workspace: podgląd interfejsu”, `spaFallback: true`).
2. **Nowy instalator `.exe`** (`bun run dist:win`, ~10 min, wymaga pliku `GO-kapi-dist.txt`). Ostatni jest z 18.11, bez podpisu (SmartScreen ostrzeże).
3. **e2e i W5 w Electronie na `08822f550`** (potrzebny `GO-tester-e2e.txt`).
4. **Czyste Windows (bramka G2):** próba instalatora na czystym koncie. Czeka na konto lub maszynę od właściciela.
5. **Kolejka zadań nie ruszona od stopu:** UI 6 pozycji (Komunikaty/Telegram+Slack, ustawienia agenta 059–074, nagłówek zadania, Teach/Voice + `@` i `/`, „Więcej” i skróty, Marketplace), KK 5 (ustawienia kanału, onboarding, Computer Use, ustawienia serwera), Backend 5 (m.in. 12b: kanały IPC i okno wyboru folderu dla plików maszyny; edycja rutyn kanału), KAPI 4 (m.in. wersje przepływów, mapa skrótów), Tester 4 (odbiór Marketplace/Harmonogram/Biblioteka z danymi, odbiór PL).
6. **Rzeczy sprawdzone tylko kodem, nie w oknie:** Marketplace, Harmonogram, Biblioteka z danymi, edytor przepływów, przełącznik „Unread first”, kanały w PWA, Teach/Voice (przyciski wyłączone), cały program po polsku, serwer zdalny i zespół, telefon (nie testowany na prawdziwym telefonie).
7. Skan prywatności objął tylko aktualne drzewo (`git grep`), bez historii i bez plików binarnych.

## 6. Zacznij tutaj (kolejność)

1. `git fetch`; upewnij się, że jesteś na `origin/codex/cosgral-desktop` @ `08822f550` albo nowszym. Scal integrację do swojej gałęzi `team/<rola>/<temat>` (nie pushuj na `codex/cosgral-desktop`; scala tylko lider).
2. **Lider:** poproś właściciela o „start”, potem włącz rutyny (sekcja 8) i daj Testerowi `GO-tester-e2e.txt`, żeby powtórzył e2e/W5 na bieżącym tipie.
3. Odśwież podgląd (punkt 5.1).
4. Każdy agent: weź pierwszą nieoznaczoną pozycję ze swojej sekcji `KOLEJKA-ZADAN.md`, dopisz `[w toku: ROLA, godzina]`, po oddaniu zmień na `[zrobione: SHA]`. Pusta kolejka nie znaczy „cisza”: bierz pierwszą lukę „częściowo/brak” ze swojego obszaru z `parytet-0.71.md`.
5. Największy zysk na godzinę: ekrany do gotowych silników (Komunikatory, pliki z komputera, ustawienia agenta, nagłówek zadań) i odbiór w oknie tego, co ma tylko kod.

## 7. Jak pracować (polecenia i pułapki)

1. PATH: `Shared\tools\bun`, `Shared\tools\node`, `Shared\tools\git\cmd`. Polecenia bezpośrednio, bez `.ps1` i bez `-ExecutionPolicy Bypass`.
2. **Testy Storybooka i wizualne wymagają** `PLAYWRIGHT_BROWSERS_PATH=<Shared>\tools\playwright`. Bez tego padają z „Executable doesn't exist” (to się dziś zdarzyło).
3. Storybook przy pierwszym uruchomieniu po zmianach może zgłosić „Failed to fetch dynamically imported module” dla 1–2 plików. To zimny cache Vite, nie kod: uruchom ponownie.
4. Jedno ciężkie polecenie naraz w całej drużynie (pełny check ok. 45 min: testy jednostkowe ok. 32 min, reszta ok. 13 min; Storybook, e2e, `dist:win`). Ciężkie tylko za plikiem `Shared\cosgral-sandbox\GO-<rola>-*.txt` tworzonym przez lidera. Lekkie: testy jednego pliku, Biome, typechecki.
5. Przed oddaniem: `bun x biome check` na swoich plikach, `bun run typecheck:renderer` (UI), testy jednego pliku. Format po scaleniu psuł się już raz (`scripts/sandbox-e2e.ts`).
6. **Po scaleniu cudzych gałęzi zawsze puść pełny check.** Dziś po scaleniu wyszło: atrapa telefonu bez `message`, 4 testy rozjechane z nowymi napisami (próbka zadań, etykiety powiadomień, zdanie o folderze), klucz i18n z prostym zamiast krzywego apostrofu (`Couldn’t send`; dla angielskiego `t()` zwraca sam klucz, więc zmiana wartości nic nie daje).
7. Commity z trailerem `Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>`. Repo publiczne: bez ścieżek z nazwą profilu Windows, bez e-maili, bez zrzutów z nazwą konta.
8. Raport z każdego zadania: `docs/cosgral-raporty/<rola>-<id>.md` + `channel_result` (SHA, testy, luki, czego nie sprawdziłeś).
9. Push lidera: fast-forward `git push origin codex/cosgral-desktop` (bez `--force`) po zielonym checku i skanie prywatności.

## 8. Rutyny (wstrzymane 19.11 ok. 09:15)

Wstrzymane (`active:false`), wznawia tylko lider po „start” właściciela:

| Rutyna | id |
|---|---|
| UI | `df85b4bf-693a-4858-a8df-4871f192b2cc` |
| KK | `83b8d1fd-f3ea-4074-a4b6-1e169cdad18e` |
| Backend | `a78cd23a-c578-455e-92e2-3eec5fb8bede` |
| Tester | `bc4b1c97-825c-43a1-9dcd-c273273eeeec` |
| KAPI | `6aaeded9-e948-4b13-a351-7783626a0ca4` |
| Strażnik lidera (45 min) | `4293df91-ad8c-46dc-9357-b3babc678f91` |

Aktywne (raporty dla właściciela): 14:00, 18:00, 22:00 (18.11, jednorazowa, można usunąć), 8:00 (wpis „18.11”, dotyczy tylko tej daty).
Wznowienie: `openbot.channel_update_routine {routineId, active:true}` (tylko w zadaniu zleconym przez osobę).

## 9. Decyzje, które czekają na właściciela

1. Repo publiczne czy prywatne, domyślna gałąź, przepisanie historii (wiersze 6–7 w `DECYZJE-WLASCICIELA.md`). Bez zgody niczego nie ruszamy.
2. Konto Windows lub maszyna do próby instalatora na czysto (G2) i termin.
3. Kto płaci za klucze API i jaki limit.
4. Czy robić: Discord, instalację skilla z linku GitHub, węzły LLM i Asset w przepływach. Rada zespołu: na razie nie.

## 10. Znane ryzyka

1. `apps/auth-api/.env.production` jest w repo od importu bazy (zaszyfrowany, upstream go śledzi). Zostawiony celowo; jego usunięcie nie usuwa go z historii.
2. Link do autora bazy w `src/main/index.ts:420`, `scripts/cosgral-rebrand-visible.mjs`, `skills-lock.json`: do ewentualnego przepisania.
3. Jedno ostrzeżenie Biome w `cosgral.css` (kolejność selektorów, `.provider-key-name`), niegroźne.
4. Kod bez dowodu w oknie liczy się w parytecie „kod”, ale nie w „w oknie”. Nie podawaj procentów bez źródła.
