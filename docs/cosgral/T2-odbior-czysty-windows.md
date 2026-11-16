# T2 — odbiór na czystym Windows (bramka G2)

**Następny krok (właściciel):** załóż / użyj **nowego konta Windows** bez Codex/Claude w PATH, zbuduj albo skopiuj program, uruchom, przejdź ścieżkę poniżej i wypełnij tabelę G02–G12.

**Baza dokumentu:** integracja `codex/cosgral-desktop` (tip lokalny przy pisaniu: `f10e0ce89`, zawiera `a3f60e25a`).  
**Źródła:** `spec-w5.md` §2B, `PLAN-W5.md`, raporty `kk-w5-t2a.md`, `ui-w5-ui1a.md`, `ui-w5-ui1b.md`, `backend-w5-be2.md`, etykiety w `src/renderer/src/components/{ManagedCliSection,ProviderAccounts,AgentAccountPicker,InitialSetup}.tsx`.

---

## 1. Przygotowanie (~20–40 min)

1. **Konto Windows** — nowe albo rzadko używane, **bez** zainstalowanego Codex/Claude (sprawdź PATH). Przejdź też raz jako użytkownik **bez uprawnień administratora** (kryterium C05 / G02).
2. **Program** — jedna z dróg:
   - instalator: na maszynie deweloperskiej `bun run dist:win`, potem plik NSIS z `dist/` na czyste konto; **albo**
   - folder niespakowany: skopiuj build + `start-cosgral.cmd` (nie `start-cosgral-sandbox.cmd`, chyba że celowo testujesz piaskownicę).
3. **Internet** — potrzebny do oficjalnego pobrania CLI i logowania ChatGPT/Claude.
4. **Kontrola** — KK czyta stany w programie (lista CLI, konta); logujesz **Ty**. Najwyżej 4–5 krótkich tur na konto („odpowiedz słowem OK”).

### Czego NIE robić

- Nie loguj się kontami produkcyjnymi / firmowymi, jeśli nie chcesz ryzykować limitu lub blokady.
- **Nie wklejaj haseł, kodów, kluczy API ani `whsec_` do czatu** ani do repo.
- Nie uruchamiaj pobranego CLI „ręcznie” poza programem „żeby sprawdzić”.
- Nie testuj puli kont, dopóki nie masz własnego zdania o warunkach planów ChatGPT/Claude (G12) — jeden wiersz w kanale wystarczy.

---

## 2. Ścieżka klikania (główny przebieg)

### Krok A — pierwsze uruchomienie (~2 min)

| | |
|---|---|
| **Oczekiwany obraz** | Okno startu / wybór dostawcy (onboarding). Przy braku CLI: przycisk przejścia dalej zablokowany; widać sekcję **„Połącz dostawcę”** / **„Narzędzia CLI”**; **brak** martwego przycisku „Zaloguj” na tym ekranie (UI1a). |
| **Kliknij** | Wybierz Codex (albo Claude w osobnym przebiegu). |
| **Gdy inaczej** | Jeśli „Continue with …” działa mimo braku CLI → zapisz zrzut i tekst; to regresja bramki onboarding (naprawa: `kk-w5-fix-onboarding`). |
| **Gdzie błąd** | Tekst na karcie setupu; konsola deweloperska tylko jeśli KK prosi. |

### Krok B — brak CLI → karta zgody pobrania (~1 min)

| | |
|---|---|
| **Oczekiwany obraz** | Przycisk **„Pobierz”** (Providers) albo **„Pobierz i przejdź dalej”** (onboarding). Po kliknięciu: faza **„Czeka na zgodę”** / „Czeka na zgodę w Needs you”. |
| **Karta zgody** | Tytuł w stylu **„Download Codex CLI …”** (rozmiar, źródło, SHA-256, bez admina). Przyciski istniejącego typu confirm: **Confirm** / **Cancel** (nie Send/Keep draft) — wg `kk-w5-t2a`. W onboardingu bez agenta: **okno systemowe** z **Download** / **Not now**. |
| **Kliknij** | **Confirm** (albo **Download** w oknie systemowym). **Cancel** / **Not now** = nic na dysku, stan wraca do „idle” / „Brak”. |
| **Gdy inaczej** | Karta w rozmowie **pierwszego** agenta z listy zamiast przy Dostawcach → znana usterka (`confirmForPerson` → `bots[0]`); nadal możesz potwierdzić, zanotuj. |
| **Gdzie błąd** | Needs you / Decision; tekst na stronie Dostawcy. |

### Krok C — pobranie (~2–10 min, sieć)

| | |
|---|---|
| **Oczekiwany obraz** | Faza **„Pobieranie”** + pasek postępu; potem **„Gotowe”**, źródło **„Pobrane”**, wersja widoczna. Auto-aktualizacja: przełącznik **„Aktualizuj automatycznie”**. |
| **Kliknij** | Czekaj; przy błędzie SHA/sieć: **„Ponów”**. |
| **Gdy inaczej** | Błąd SHA → nic nie zapisane, stara wersja zostaje (`kk-w5-t2a` C03). Mieszanie PL/EN na ekranie — znane, do W7. |
| **Gdzie błąd** | Komunikat na karcie CLI (czasem z surowym prefiksem IPC — usterka UI przy złej ścieżce własnej). |

### Krok D — logowanie Codex w programie (~3–8 min)

| | |
|---|---|
| **Oczekiwany obraz** | Szyna stron → **Providers** / Usage → **„Konta i pula”** → Codex. **„Dodaj konto”** (etykieta), potem **„Zaloguj”**. Fazy: waiting-for-browser / kod urządzenia / sukces. Stan **zalogowane** (`loggedIn`), konto **zamaskowane**. |
| **Kliknij** | **Zaloguj** → dokończ w przeglądarce systemowej otwartej przez CLI; wklej kod tylko w polu hasłowym w programie, jeśli poprosi. Nie używaj terminala, chyba że program sam zaproponuje obejście po **karcie zgody**. |
| **Gdy inaczej** | Zostaje „waiting-for-browser” długo → odczekaj / **Ponów logowanie**; BE2 naprawiał wiszące `close` procesu na atrapie — na prawdziwym CLI **do potwierdzenia**. |
| **Gdzie błąd** | Pole `login.message` / faza `error` na koncie; Needs you przy terminalu. |

### Krok E — pierwszy agent i wiadomość (~3 min)

| | |
|---|---|
| **Oczekiwany obraz** | Agent z modelem Codex; w ustawieniach agenta wybór **„Konto:”** z opcją **„Domyślne”** (`AgentAccountPicker`). |
| **Kliknij** | Wyślij krótką wiadomość („odpowiedz słowem OK”). |
| **Gdy inaczej** | „Complete agent CLI setup…” / brak odpowiedzi → CLI nie gotowe albo agent nie na pobranym CLI (**do potwierdzenia** na czystym Windows; T2a nie dowiódł tur na prawdziwym pobranym pliku). |
| **Gdzie błąd** | Rozmowa, stan wiersza agenta, Providers → użycie. |

### Krok F — drugie konto w puli + kolejność (~5–10 min)

| | |
|---|---|
| **Oczekiwany obraz** | Drugie **„Dodaj konto”** + logowanie. Przełącznik puli z ostrzeżeniem `ACCOUNT_POOL_WARNING`. **„Kolejność puli”**, **„↑ W górę”** / w dół. Limit kont (domyślnie 3). |
| **Kliknij** | Włącz w puli (potwierdź ostrzeżenie) → ustaw kolejność → w ustawieniach agenta przypisz konto (nie tylko Domyślne). |
| **Gdy inaczej** | Limit dodawania / pełna pula — komunikat UI1b. Przejście **przy limicie dostawcy** między kontami: silnik **W5-K1 w toku** (KK) — nie oczekuj pełnego G07 dziś. |
| **Gdzie błąd** | Sekcja Konta i pula; konsola tylko na prośbę KK. |

### Krok G — wylogowanie (~2 min)

| | |
|---|---|
| **Oczekiwany obraz** | Przycisk **„Wyloguj”** (nie ma go na koncie systemowym). Po wylogowaniu: stan wylogowane; kolejna tura wymaga ponownego logowania („Sign in required” / odpowiednik — **do potwierdzenia** dokładnego tekstu). |
| **Kliknij** | **Wyloguj** na koncie testowym. Konto systemowe zostaw — nie da się go wylogować/usunąć (BE2). |
| **Gdy inaczej** | Awaria / zawieszenie → stop, zrzut, nie kasuj profilu. |
| **Gdzie błąd** | Karta konta, rozmowa agenta. |

---

## 3. Tabela kryteriów właściciela (G02–G12)

Wypełnij przy teście. **G01** (jedno pobranie SHA w piaskownicy) = Backend/KK, nie ta sesja właściciela.

| Nr | Co sprawdzić | ok / nie ok | uwagi |
|---|---|---|---|
| G02 | Czysty Windows bez Codex/Claude: jedno kliknięcie pobiera oficjalne CLI; agent odpowiada „OK” | | |
| G03 | Logowanie Codex (ChatGPT) w oknie, bez terminala; signed-in; tura „OK” | | |
| G04 | Logowanie Claude w oknie, bez terminala; signed-in; tura „OK” | | |
| G05 | Wylogowanie obu; signed-out; agent prosi o sign-in bez awarii | | |
| G06 | Dwa konta Claude: agent A konto 1, agent B konto 2; obie tury „OK” | | |
| G07 | Przejście przy limicie na prawdziwych kontach (bramka G2); sposób: atrapa limitu + ewentualnie naturalny limit | | |
| G08 | Klucz API testowy wpisany w programie; tura „OK”; skan bez jawnego klucza w logach/bazie | | |
| G09 | Aktualizacja + przypięcie na prawdziwym nowszym wydaniu CLI | | |
| G10 | Ollama / LM Studio jeśli zainstalowane; brak = pominięte, nie czerwone | | |
| G11 | Obaj wspólnicy podpinają subskrypcje sami, bez instrukcji (obserwacja) | | |
| G12 | Warunki planów ChatGPT i Claude przeczytane przed pulą; jedno zdanie w kanale | | |

---

## 4. Czego program / etap jeszcze NIE gwarantuje

Uczciwa lista (stan na pisanie runbooka; W5-K1/BE3 mogą dojść po dacie dokumentu):

1. **Przełączanie konta przy limicie przed pierwszą akcją tury** — zadanie W5-K1 (przejęte przez KK), nie domknięte w momencie zlecenia runbooka.
2. **Prawdziwe pobranie CLI na czystym Windows** — T2a było na atrapie loopback; oficjalne hosty = G02/G09.
3. **Agent na świeżo pobranym CLI bez restartu** — T2a: niesprawdzone (pobrany plik testowy ≠ Codex).
4. **Claude CLI w odbiorze okna** — T2a tylko karta Codex.
5. **Karta zgody CLI zawsze przy miejscu kliknięcia** — bywa u pierwszego agenta na liście.
6. **Czyste komunikaty błędów ścieżki** — bywa prefiks IPC.
7. **Jednolity język UI** — mieszanka PL/EN; pełna lokalizacja = W7.
8. **Klucze API w UI** — W5-BE3 / W5-UI3 w toku; G08 może wymagać czekania na scalenie.
9. **Ollama / LM Studio** — W5-K2; G10 opcjonalne.
10. **8 modeli zapasowych** — W5-BE4.
11. **Publiczny webhook / konektory Vault / rutyny kanału** — poza W5.

---

## 5. Do potwierdzenia (nie da się domknąć samym kodem/raportami)

- Dokładny tekst angielski po wylogowaniu w rozmowie („Sign in required” vs wariant lokalny).
- Czy na czystym Windows onboarding używa karty Needs you, czy tylko okna systemowego (zależnie od tego, czy już jest agent).
- Czy prawdziwy `codex login` / `claude auth login` otwiera przeglądarkę tak jak atrapy BE2.
- Czas trwania faz „Sprawdzanie SHA-256” / „Instalowanie” — w T2a zbyt krótkie, by je zobaczyć.
- Pełny przebieg G07 na żywych limitach (celowe wyczerpanie: brak w źródłach).
- Czy instalator NSIS z `dist:win` na tym tipie jest aktualny wobec niespakowanego `start-cosgral.cmd`.

---

## 6. Czego ten dokument nie sprawdził

- Nie uruchamiano Electrona ani czystego Windows przy pisaniu.
- Nie czytano logowań ani sekretów.
- Nie aktualizowano parytetu ani nie robiono commitów poza tym plikiem.
- Stany zadań w `PLAN-W5.md` w repo mogą być o kilka godzin wstecz względem kanału — przy odbiorze sprawdź najnowsze raporty `docs/cosgral-raporty/`.
