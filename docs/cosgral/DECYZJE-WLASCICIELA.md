# Decyzje właściciela

**Stan: 16.11.2026, integracja `codex/cosgral-desktop` @ `d4f20c515`.** Dokument zbiera w jednym miejscu wszystko, co czeka na właściciela. Pisał KAPI (W4-H3), tylko ze źródeł w repo i z dokumentu `luki-070`. Czego nie ma w źródłach, jest oznaczone „brak w źródłach”.

## Odpowiedzi właściciela (16.11.2026, zapisane w `PLAN-W5.md` pkt 1–5)

**Z 15 wierszy: 4 rozstrzygnięte wprost, 6 zaakceptowanych jako rekomendacja lidera, 2 czekają na osobną zgodę, 3 nadal otwarte.** Reszta dokumentu opisuje stan sprzed tych odpowiedzi; ta sekcja ma pierwszeństwo.

| Wiersze | Stan | Co odpowiedział właściciel |
|---|---|---|
| 1 | **TAK** | Bramka G1 potwierdzona; W5 ruszył. |
| 2 | **TAK** | CLI pobierane automatycznie, ale konfigurowalnie jak w OpenBocie: przełącznik „aktualizuj automatycznie”, przypięcie wersji, ręczne „Sprawdź / Zaktualizuj / Usuń”, własna ścieżka CLI. |
| 3 | **TAK** | Pula kont konfigurowalna jak w OpenBocie (wiele kont na dostawcę, konto per agent, kolejność, włączanie i wyłączanie, limit kont domyślnie 3 i zmienny). Tylko konta właściciela. |
| 5 | **TAK** (część) | Klucze API w `safeStorage` włączone w W5-BE3. Kto płaci i jaki limit: nadal brak w źródłach. |
| 4, 8, 9, 12, 13, 14 | zaakceptowane | „Na wszystko, idziemy dalej”: zgoda na rekomendacje lidera z tego dokumentu (`PLAN-W5.md` pkt 2). To odczyt lidera; własnych słów właściciela przy tych wierszach brak. |
| 6, 7 | **czeka na osobną zgodę** | Repo publiczne czy prywatne, domyślna gałąź i przepisanie historii z force-push: wyjątek z `PLAN-W5.md` pkt 2, lider niczego nie robi bez wyraźnej zgody. |
| 10 | otwarte | Rekomendacja przyjęta (próba tylko na czystym koncie), ale potrzebne konto lub maszyna od właściciela i termin. |
| 11, 15 | otwarte | Lider nie ma stanowiska (brak w źródłach), więc „na wszystko” niczego tu nie rozstrzyga. |
| 16–18 | później | Bez zmian. |

**Dla raportu 8:30 zostają do odpowiedzi właściciela:** wiersze 6 i 7 (repo, historia), 10 (konto lub maszyna do próby instalatora), 11 (aktualizacje), 15 (ochrona gałęzi i CI), kto płaci za klucze API (część wiersza 5).

## Nowe od 16.11 rano (z wyników W5, aktualizacja 07:50)

**Do raportu 8:30: 5 punktów, z czego po korekcie 17.11 otwarte są 4 (N3 zamknięte, N4 zawężone). Żaden nie blokuje dalszej pracy; domyślne zachowanie jest w kolumnie „Bez decyzji”.** Źródła: raporty na integracji (`kk-w5-k1.md`, `kk-w5-k2.md`, `backend-w5-be3.md`, `backend-w5-be4.md`, `backend-w5-be7.md`, `backend-w6-be5.md`, `T2-odbior-czysty-windows.md`). Raporty K2 i BE4 przeczytałem 17.11; przegląd bezpieczeństwa (`tester-w5-security-review.md`) tylko w nagłówku. Korekta oparta na integracji `80941fd49`; N1, N2 i N5 sprawdziłem tylko w raportach W5 (G2b, G3b, T4, K2): nic w nich ich nie zmienia (G2b nie założył czystego konta Windows). Raportów W6 i W8 poza ACP nie czytałem.

| Nr | Decyzja (1 zdanie) | Rekomendacja | Bez decyzji | Co blokuje | Źródło |
|---|---|---|---|---|---|
| N1 | Czy konto Windows albo maszyna do odbioru G2 na czystym Windows (G02–G12) jest gotowa i kiedy; runbook jest, potrzebne konto bez Codex i Claude w `PATH` oraz Twoje logowanie. | Tester: nowe konto Windows, ok. 20–40 min przygotowania; termin: brak w źródłach. | Bramka G2 nie zostanie zaliczona; reszta W5 idzie na atrapach. | **Bramka G2** i wiersz 10 (test instalatora na czystym koncie). | `T2-odbior-czysty-windows.md` (§1, §3, §5) |
| N2 | Czy plain `http` do hosta spoza sieci lokalnej ma zostać odrzucany dla własnych punktów końcowych (Ollama, LM Studio, serwery zgodne z OpenAI)? | KK (W5-K2): zostawić odrzucanie, bo klucz i rozmowa poszłyby jawnie przez internet; poluzowanie to jedna reguła w `checkEndpointUrl`. | Odrzucane; własny punkt zdalny działa tylko przez https. | Nic (tylko W5-K2). | wynik W5-K2 w kanale (wykracza poza polecenie) |
| N3 | **ZAMKNIĘTE (korekta 17.11):** listy modeli zapasowych „per dostawca” są zrobione zgodnie z Twoją decyzją z 16.11: trzy warstwy (agent, dostawca, ogólna), do 8 modeli każda, po kontach z puli. Czeka tylko odbiór ekranu list w prawdziwym oknie. | Nic do rozstrzygnięcia. | Działa tak, jak opisano. | Nic (odbiór w oknie). | `backend-w5-be7.md`, `ui-w5-ui6.md`, `tester-parytet-w5b.md` |
| N4 | **ZAWĘŻONE (korekta 17.11):** gotowe ustawienia ACP są dla Gemini CLI i Antigravity (W6), z logowaniem w oknie. Dla OpenCode, Copilot i Cursor nadal nie ma gotowych ustawień: skąd wziąć ich polecenia i argumenty? | Brak w źródłach (specyfikacja sama mówi, że poleceń nie ma; nic nie wymyślono). | Te trzy można dodać tylko ręcznie jako własnego agenta ACP; presetów nie będzie. | Kryterium E05 w `spec-w5.md` (częściowo). | `backend-w6-be5.md` (§4), `ui-w6-ui4.md`, `spec-w5.md` |
| N5 | Czy akceptujesz, że zmiana konta przy limicie to nowy wątek dostawcy z przekazaniem historii (kontekst może być streszczony), a zapisany klucz API jest używany zawsze aż do usunięcia (także gdy dostawca go odrzucił), od następnego startu procesu? | Brak w źródłach (opisane jako zachowanie przyjęte przez zespół, nie jako pytanie do właściciela). | Działa tak, jak opisano. | Nic; do wiadomości przy odbiorze G2. | `kk-w5-k1.md` (uwaga 3); wynik W5-UI3 w kanale („decyzja Backendu”) |

**Stan innych wierszy po W5 (bez zmian):** 1, 2, 3, 4, 5, 8, 9, 12, 13, 14: rozstrzygnięte lub zaakceptowane (patrz tabela wyżej). **Nadal czekają na Twoją wyraźną zgodę wiersze 6 i 7** (widoczność repo, domyślna gałąź, przepisanie historii z force-push) oraz otwarte 11 (aktualizacje bez wydań) i 15 (ochrona gałęzi i CI). Wiersz 10 zawęża się do N1.

**Czego nie sprawdziłem w tej aktualizacji:** treści raportów K2, BE4 i przeglądu bezpieczeństwa (tylko wyniki w kanale), tego, czy G2 ma ustalony termin, ani czy lider chce któryś z punktów N2–N5 w ogóle zgłaszać właścicielowi (to propozycja; N3–N5 to raczej wiadomości niż decyzje).

## Na górze (stan sprzed odpowiedzi)

**15 decyzji do podjęcia teraz + 3 na później.** Czas na odpowiedź: ok. 10 min.

**3 najbardziej blokujące:**
1. **Wiersz 1: potwierdzenie bramki G1.** Bez tego W5 nie startuje, a za nim W6–W10.
2. **Wiersz 2: zgoda na pobieranie CLI przez program i przypinanie wersji.** To pierwsze zadanie kodu W5 (W5-BE1), a cały łańcuch W5 zależy od niego.
3. **Wiersz 3: pula kont (kilka subskrypcji na dostawcę).** Blokuje W5-K1, a za nim K2, BE4 i UI1. Jedyna decyzja z ryzykiem utraty konta.

**Jak odpowiedzieć:** napisz numer i „TAK” / „NIE” / własną wersję, np. „1 TAK, 6 prywatne, 8 TAK”. Wiersze bez odpowiedzi zostają w stanie z kolumny „Bez decyzji”.

## Decyzje do podjęcia teraz

Posortowane od najbardziej blokujących (najpierw to, co zatrzymuje najwięcej pracy, potem to, co zatrzymuje publikację i porządki).

| Nr | Decyzja (1 zdanie) | Rekomendacja lidera | Bez decyzji | Co blokuje | Źródło |
|---|---|---|---|---|---|
| 1 | Potwierdzić, że bramka G1 jest zaliczona (dowody w sekcji „Dowody G1”). | Potwierdzić: lider uznaje G1 za zielone. | W5 nie startuje; zespół robi tylko drobne poprawki W4. | **W5–W10** (całość). | `luki-070` (polecenie startowe: „Nie zaczynaj W5, dopóki nie potwierdzę bramki G1”); `PLAN-W4.md` decyzja 5 i tabela G1. |
| 2 | Zgoda, żeby program sam pobierał oficjalne CLI (Codex, Claude) i przypinał ich wersje; aktualizacja po kliknięciu czy automatycznie? | Przypinać wersję i pytać kartą przed pobraniem (R2, R3 w specyfikacji); „po kliknięciu” czy „automatycznie”: brak w źródłach. | Zostaje dzisiejsze wykrywanie CLI w `PATH` i podpowiedź „run `codex login`”; program niczego nie pobiera. | **W5-BE1**, a przez zależności BE2, K1, BE3, K2, BE4, UI1. | `spec-w5-subskrypcje.md` §6 pkt 5, §3, §5 (R2, R3). |
| 3 | Czy wolno łączyć kilka kont subskrypcyjnych w pulę (ile) i czy wspólnicy mają osobne konta, czy jedno wspólne? | Pula tylko z kont właściciela, bez dzielenia konta między osoby, po sprawdzeniu warunków planów (R1); limit np. 3 konta (R6). | Zostaje jedno konto na dostawcę; przejścia przy limicie na inne konto nie będzie. | **W5-K1**, a za nim K2, BE4, UI1; ryzyko utraty konta, jeśli warunki planów zabraniają automatyzacji lub współdzielenia (R1). | `spec-w5-subskrypcje.md` §6 pkt 2, §5 (R1, R6). |
| 4 | Czy do testów W5 są osobne konta subskrypcyjne i kto je loguje? | Jeden wspólnik, stałe okno raz na falę; loguje człowiek w osobnym profilu Windows, agenci tylko czytają stan. | Testy z prawdziwymi kontami nie ruszą; zostają atrapy CLI. | **W5-T2** (odbiór), bramka **G2** („obaj wspólnicy podpinają subskrypcje”). | `spec-w5-subskrypcje.md` §6 pkt 4, §7; `luki-070` decyzja 4 i bramka G2. |
| 5 | Czy używamy płatnych kluczy API obok subskrypcji, kto płaci i jaki limit w panelu dostawcy? | Klucze testowe z miesięcznym limitem i nigdy w repo; kto płaci i jaki limit: brak w źródłach. | Klucze API (W5-BE3) bez ustalonych zasad kosztów. | **W5-BE3**. | `spec-w5-subskrypcje.md` §6 pkt 3; `luki-070` („Dodatkowe rekomendacje” 9, wiadomość do zespołu pkt 5). |
| 6 | Repo publiczne czy prywatne i która gałąź ma być domyślna na GitHubie (dziś `codex/cosgral-workspace`, wg lidera stary fork Paperclip)? | Dokument źródłowy: prywatne, bo w repo są raporty, plan i ścieżki; domyślna gałąź `codex/cosgral-desktop`. | Repo zostaje publiczne (sprawdziłem: dostępne bez logowania), domyślna gałąź zostaje starą linią z 12.11; lider niczego tam nie zmienia ani nie pushuje bez zgody. | Publiczną ekspozycję raportów i planu; wiersze 7, 11 i 15. Termin wg dokumentu: **„teraz”**. | `luki-070` decyzja 7; `PLAN.md` „Decyzje lidera do W3” pkt 9. |
| 7 | Czy przepisać historię gita (force-push), żeby usunąć ścieżkę z nazwą profilu Windows (`<profil>`) z 2 starych commitów? | Tylko za zgodą właściciela (zasada lidera); inne zalecenie: brak w źródłach. | Ścieżka zostaje w historii wypchniętych gałęzi; wierzchołek `d4f20c515` i pliki są czyste (skan). | Czystość historii publicznego repo. Po przepisaniu zmieniają się SHA kolejnych commitów we wszystkich gałęziach `team/*`, a ochrona gałęzi z wiersza 15 blokuje nadpisywanie historii. | `kapi-w4-h1.md` (krok 1, „Historia”); `luki-070` („Dodatkowe rekomendacje” 3). |
| 8 | Czy „wszystkie funkcje” OpenBota 0.70 znaczy wszystko, czy bez komunikatorów, katalogu 200+ aplikacji, serwera na Linuksie, klienta webowego i SSO? | Bez tych pięciu (druga opcja dokumentu: są drogie, a dla dwóch osób dadzą mało). | Zespół działa na założeniu lidera (bez tych pięciu); tabela 0.70 nie dostaje wierszy 45+. | **W4-L1** (wiersze 45+ tabeli 0.70) i zakres **W10**. Termin wg dokumentu „przed W4-L1” już minął. | `luki-070` decyzja 1; `PLAN-W4.md` decyzja lidera 1 („do potwierdzenia przed W10”); `spec-w5-subskrypcje.md` §8. |
| 9 | Czy po odinstalowaniu dane mają zostać (decyzja lidera), skoro dokument w W4-H2 wymaga „nic nie zostaje w profilu”? | Zostają; do usuwania służy osobna akcja „Delete my data” w Ustawieniach (już jest). | Zostaje jak dziś: `deleteAppDataOnUninstall: false`; po odinstalowaniu są `%APPDATA%\COSGRAL Workspace` i folder agentów w katalogu domowym. | Zamknięcie **W4-H2** (kryterium z dokumentu niespełnione) i ryzyko R8; zmiana na „nic nie zostaje” to zmiana sekcji `nsis:` i przebudowa instalatora. | `spec-w5-subskrypcje.md` §6 pkt 1, §5 (R8); `backend-w4-be4.md` 2a; `backend-w4-be5.md`; `luki-070` (W4-H2). |
| 10 | Dać konto lokalne Windows albo maszynę wirtualną do próby instalatora i ustalić termin (podpisywanie kodu osobno). | Próba tylko na czystym koncie lub maszynie, nigdy na profilu właściciela; podpisywanie: brak w źródłach. | Instalator `COSGRAL Workspace-0.2.0-x64.exe` (102,9 MB, niepodpisany) nie jest sprawdzony w działaniu: ani instalacja, ani aktualizacja, ani odinstalowanie. | **W4-H2** i wydawanie instalatora. Potrzebne: konto z uprawnieniami administratora albo maszyna (Windows Sandbox wymaga ≥4 GB RAM, a wolnego jest ok. 1,3 GB). Niepodpisany plik da ostrzeżenie SmartScreen. | `kapi-w4-h1.md` (krok 4: plan 8 kroków, ok. 45 min); `electron-builder.yml` (komentarz „unsigned until release signing is configured”); `PLAN-W4.md` (W4-H2). |
| 11 | Jak ma działać aktualizacja programu: wydania na GitHubie (dziś `app-update.yml` wskazuje repo bez wydań) czy inny kanał? | Brak w źródłach; dokument zaleca cotygodniową wersję instalatora z numerem i notatką po polsku. | Wbudowana aktualizacja nie ma skąd pobierać, a jej ścieżka nie jest sprawdzona; do próby trzeba zbudować 0.2.1 z lokalnym serwerem na loopbacku. | Test aktualizacji w **W4-H2**; zależy od wiersza 6 (przy prywatnym repo wbudowana aktualizacja z GitHuba pewnie będzie wymagała osobnej konfiguracji; to uwaga spoza źródeł projektu, do sprawdzenia). | `kapi-w4-h1.md` (krok 4, uwaga 2); `luki-070` („Dodatkowe rekomendacje” 6). |
| 12 | Gdyby program pokazał przy Claude „Sign in required”: wykonać po swojej stronie `claude auth login` w terminalu i kliknąć „Try again” (agenci nigdy nie logują). | Tak; w teście W4-T1 Claude był zalogowany, a po W4-BE3 „Sign in required” pojawia się tylko, gdy samo CLI odpowie `loggedIn: false`. | Claude zostaje niedostępny w programie; przy bardzo wolnym komputerze możliwy stan „Unavailable” (to nie prośba o logowanie). | Tury z Claude (powtórki W4-T2, W5-BE2). Wymagane tylko warunkowo. | `kk-w4-verify.md` (Uwagi, „Czego nie sprawdziłem”); `backend-w4-be3.md`. |
| 13 | Czy instalować Ollamę (i LM Studio) na komputerze testowym do tanich testów dymnych (dziś Ollamy nie ma)? | Opcjonalnie: specyfikacja traktuje Ollamę tylko jako opcjonalny test dymny, reszta idzie na atrapie serwera. | Endpointy lokalne (W5-K2) testowane tylko na atrapie serwera Chat Completions. | Nic krytycznego. Uwaga: wolnego RAM jest ok. 1,3 GB. | `spec-w5-subskrypcje.md` §6 pkt 6, §7; `backend-w4-core.md` (Ollama); `PLAN-W4.md` decyzja 4. |
| 14 | Potwierdzić, że Chromium dla testów Storybook i wizualnych (Playwright, ok. 100–150 MB) zostaje w `Shared\tools\playwright`, poza profilem użytkownika. | Tak: lider zgodził się w W4-T3; pobrane w 32 s, bez administratora i bez zmian w rejestrze. | Zostaje jak jest. | Etapy `test:storybook` i `test:visual` w `bun run check`; bez zmiennej `PLAYWRIGHT_BROWSERS_PATH` wskazującej ten folder znów padną. | `kk-w4-g1b.md` (pkt 1); `kk-w4-g1.md`. |
| 15 | Czy włączyć na GitHubie ochronę gałęzi `codex/cosgral-desktop`, CI na Windows i Linuksie oraz zgłoszenia i pull requesty jako sposób pracy? | Dokument źródłowy: tak (rekomendacje 1–3); stanowisko lidera: brak w źródłach. | Lider scala dalej ręcznie po lokalnym `bun run check`; brak automatycznej kontroli na GitHubie. | Nic pilnego; ochrona „bez nadpisywania historii” utrudni wiersz 7. | `luki-070` („Dodatkowe rekomendacje” 1–3). |

### Uwagi do wierszy

- **Wiersze 2, 3, 4, 5, 9, 13** to 6 decyzji z §6 specyfikacji W5 (punkty 5, 2, 4, 3, 1, 6), po jednym wierszu.
- **Wiersz 9, co usuwa „Delete my data”:** dane programu (baza, rozmowy, ustawienia, sekrety Vault i MCP, profil przeglądarki agentów, logi) **oraz folder agentów** (obszary robocze i pliki wspólne). Wymaga wpisania słowa `DELETE`. Nie rusza logowań Codex i Claude CLI ani `%APPDATA%\OpenBot`. Wcześniejszy plan zakładał osobne pole dla folderu z pracą agentów; wersja z W4-BE5 usuwa oba naraz. Czy tak ma zostać: brak w źródłach (jedno zdanie do potwierdzenia razem z wierszem 9).
- **Wiersz 6:** sprawdziłem tylko tyle, że `git ls-remote` bez poświadczeń odpowiada, domyślna gałąź to `codex/cosgral-workspace` (ostatni commit 12.11, osobna linia historii, nie przodek integracji), a na zdalnym nie ma żadnych tagów.
- **Wiersz 7:** ścieżkę wprowadziły 2 commity: `b14a05c47` (W2-T3) i `e08542c85` (W2-T4), oba z 13.11. Usunięta z kodu w W4-H1 (`72a00bf0d`).

## Dowody G1 (do wiersza 1)

| Kryterium z dokumentu źródłowego | Wynik | Źródło |
|---|---|---|
| `bun run check` zielony | Jedno polecenie, exit 0, 709 s, 11 etapów, 1343 testy; kod @ `8bbaf2175` | `kk-w4-g1c.md`; `PLAN-W4.md` (tabela G1) |
| `sandbox:e2e` (w dokumencie: 19/19 na Windows) | 24/24, 0 znalezisk (u lidera po scaleniu W4-T4) | wg lidera (kanał); `kk-w4-verify.md` (22/22 wcześniej) |
| Raport W4-T2 bez błędów blokujących | Prawdziwy Codex 4 z 4 tur; prawdziwy Claude 4 z 4 tur; Ollamy na komputerze nie ma | `backend-w4-core.md`; `kk-w4-verify.md` |
| Dodatkowo: odbiór w prawdziwym oknie | 38/38 kroków (na wcześniejszym SHA, po W4-T4 nie powtarzany); parytet 35 z 44 = 79,5% | `kk-w4-g1.md` |

Poza bramką G1 zostaje instalator na czystym koncie (wiersz 10).

## Na później (nie blokuje W4 ani W5)

| Nr | Decyzja | Rekomendacja | Co blokuje | Źródło |
|---|---|---|---|---|
| 16 | Telefon: PWA z Tailscale czy natywna aplikacja? | Najpierw PWA z Tailscale; natywna dopiero, gdy powiadomienia na iPhonie zawiodą. | W9 (termin wg dokumentu: przed W9). | `luki-070` decyzja 5. |
| 17 | Chmura: zero cudzej chmury (sieć lokalna, Tailscale) czy własny przekaźnik na serwerze? | Zero cudzej chmury (wyróżnik wobec OpenBota). | W9 (termin: przed W9). | `luki-070` decyzja 6. |
| 18 | Akceptacja wyglądu (kierunek OpenBot + Grok Bot, nie Paperclip). | Brak w źródłach. | Bramka G4 (po W7): „właściciele akceptują wygląd”. | `luki-070` (bramka G4, „Kierunek wyglądu”); `PLAN-W4.md` (W7). |

## Już rozstrzygnięte (tylko do wiadomości)

- **Budujemy dalej COSGRAL, bez licencji OpenBota** (decyzja właściciela z 12.11, `PLAN-W4.md` decyzja 2). Dokument źródłowy zaznacza, że licencja zespołowa jest darmowa do 1.12.2026; jeśli właściciel chciałby wrócić do opcji z licencją, termin mija za 15 dni.
- **Dostawcy:** Codex i Claude natywnie, endpointy OpenAI-compatible i Ollama, reszta przez ACP (`PLAN-W4.md` decyzja lidera 3; w dokumencie źródłowym decyzja 3 „przed W5”). Właściciel może to zmienić.

## Czego nie sprawdziłem

- **Czy pełne `bun run check` jest zielone po scaleniu W4-UI3** (`d4f20c515`). Wynik KK (exit 0) dotyczy `8bbaf2175`; u lidera biegnie w chwili pisania, wyniku nie widziałem. Nie uruchamiałem żadnych testów, typecheck ani biome (limit sprzętu, dokument to tylko Markdown).
- **Że to są ustalenia z właścicielem.** Kolumna „Rekomendacja lidera” to zapisy w repo i w dokumencie źródłowym oraz zlecenia lidera, nie rozmowa z właścicielem. Tam, gdzie lider nie zostawił zapisu, stoi „brak w źródłach”.
- **Całego `luki-070.txt`.** Przeczytałem spis sekcji oraz fragmenty: plan W4 i bramkę G1, W4-H2, zasady i polecenie startowe, „Dodatkowe rekomendacje” i wiadomość do zespołu, „Decyzje dla właścicieli” (z „Rekomendacji dla zespołu” tylko początek). Nie czytałem tabel W5–W10 z tego dokumentu (mogą zawierać dalsze decyzje) ani wersji PDF; korzystałem z tekstu.
- **Liczby commitów ze ścieżką w całej historii.** Wiersz 7 opiera się na liczbie 2 od lidera i na sprawdzeniu historii tylko dwóch plików testów; nie przeszukałem wszystkich gałęzi i plików (rozległe `git log -S` przy zajętym komputerze).
- **Zawartości domyślnej gałęzi** `codex/cosgral-workspace`: wiem, że to osobna linia z 12.11 z innym drzewem plików; że to dokładnie fork Paperclip, biorę od lidera. Nie sprawdzałem też ustawień repo na GitHubie (widoczność, ochrona gałęzi) ani wydań przez API (`ls-remote` pokazuje tylko tagi).
- **Warunków planów ChatGPT i Claude (R1)**, ceny podpisu kodu, kosztu kluczy API i konta lub maszyny do testów: brak w źródłach.
- **Wiersza 11 (prywatne repo a aktualizacje z GitHuba):** to wiedza ogólna o narzędziu, nie zapis z projektu.
