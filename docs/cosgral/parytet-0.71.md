# Parytet z OpenBotem 0.71 (funkcje)

Stan: 18.11.2026, integracja `codex/cosgral-desktop` @ `e1a2fdc76` (z `w12-flows` i pierwszą częścią `w12-screens`) oraz gałąź `team/kk/w12-screens` (Import i Transfer, Głos, Mobile Connect, zdalny pulpit; stan na 543bc7f88; do scalenia). Poprzednia wersja tabeli: `b1e28ab8f` + `w12-flows`, 68,8%. Liczy się to, co jest w integracji i w tej gałęzi; ekrany UI Designera na jego gałęzi zmienią tabelę po scaleniu. „Ekran w kodzie” nie znaczy „w oknie sprawdzone”: do tego potrzebne są zrzuty i przebiegi Testera (ostatnie: e2e 30 ok / 0 FAIL i W5 29/29 na `79567cdf9`).

**Wynik w jednej linii: 54 z 72 funkcji = 75% (jest = 1, częściowo = ½). Z tego skontraktowane 87,5%, ale w prawdziwym oknie sprawdzone tylko 45,1%. Ostrożnie (jest liczy się za 1 tylko z dowodem w oknie, jak reguła 0.68): 56,9%.**

| Miara | Wynik | Jak liczona |
|---|---|---|
| Parytet (kod) | **75%** (54 z 72) | 44 jest, 20 częściowo, 8 brak |
| Skontraktowane | **87,5%** | wiersz ma kontrakt w `packages/contracts` (tak = 1, część = ½) |
| Silnik | 86,1% | kod w `src/backend` albo `src/main` (tak = 1, część = ½) |
| Ekran w kodzie | 81,3% | komponent w `src/renderer` czyta to API (tak = 1, część = ½) |
| W oknie sprawdzone | **45,1%** | 19 wierszy w pełni (tak), 27 częściowo; reszta nie sprawdzona w prawdziwym programie |
| Ostrożny parytet | 56,9% | jest bez dowodu w oknie liczy się ½, częściowo ½, brak 0 |

Poza zakresem (nie wchodzą do mianownika): 6 pozycji, lista na końcu. Gdyby je policzyć jako brak, parytet kodowy = 54 z 78 = 69,2%.

## Czym to różni się od parytet-0.68.md

1. Tam „jest” wymagało dowodu w prawdziwym oknie (27 jest + 17 częściowo z 44 = 80,7%). Tu „jest” znaczy: kontrakt + silnik + test + ekran w kodzie, a dowód w oknie to osobna kolumna i osobny procent. Dlatego porównuj z „ostrożnym” wynikiem, nie z głównym.
2. Wiersze są pogrupowane według 0.71 (nie według fal), więc liczby 44 i 72 to inne zbiory funkcji.
3. Dowody „w oknie” biorę tylko z raportów, które je zawierają: odbiór W3-T3/W4/W5 (programy w piaskownicy, atrapa Codex, W5 29/29, e2e), zrzuty T-H z 17.11 (13 PNG, poza repo). Zrzut ekranu liczę jako „część” (ekran się rysuje), nie jako „tak”.

## Legenda

- **K** kontrakt (`packages/contracts/src/ipc-*.ts`), **S** silnik, **T** test automatyczny, **E** ekran w kodzie podpięty do `window.openbot.*`, **O** sprawdzone w prawdziwym oknie.
- Wartości: tak / część / nie. „jest” tylko gdy K, S i E = tak; „brak” tylko gdy nie ma silnika ani ekranu.

## Podsumowanie według obszaru

| Obszar | Wierszy | Jest | Częściowo | Brak | Parytet |
|---|---|---|---|---|---|
| A. Ustawienia aplikacji i powłoka | 11 | 6 | 4 | 1 | 73% |
| B. Czat, Needs you, wątki | 12 | 8 | 3 | 1 | 79% |
| C. Kanały | 4 | 3 | 1 | 0 | 88% |
| D. Agenci | 10 | 9 | 1 | 0 | 95% |
| E. Narzędzia i dane (MCP, Vault, tabele, pliki, przeglądarka) | 9 | 6 | 2 | 1 | 78% |
| F. Marketplace | 3 | 1 | 2 | 0 | 67% |
| G. Dostawcy i użycie | 6 | 5 | 0 | 1 | 83% |
| H. Automatyzacje (rutyny, przepływy) | 6 | 3 | 2 | 1 | 67% |
| I. Komunikatory | 4 | 2 | 0 | 2 | 50% |
| J. Serwer, zespół, zdalny pulpit, telefon | 7 | 1 | 5 | 1 | 50% |

## Tabela funkcji

### A. Ustawienia aplikacji i powłoka

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Język PL/EN i napisy | **częściowo** | tak | tak | tak | tak | część | Wybór języka działa bez restartu; panel Narzędzia CLI jest już przez słownik (scalone po W5 29/29 w oknie, krok CLI zielony); w oknie po polsku nie sprawdzono całego programu. | kk-w3-acceptance, ui-w7-ui2, tester-w12-w5 |
| 2 | Wygląd i ustawienia ogólne (motyw, czcionki, kolory czatu, skrót wysyłania, kolejność nieprzeczytanych, kroki agenta) | **częściowo** | część | część | część | część | część | Jest motyw ciemny/jasny/systemowy (zrzuty T-H) i język; brak rozmiaru UI, czcionek, koloru logo i czatu, skrótu wysyłania, autostartu. | ui-w7-ui1, tester-w12-zrzuty2 (poza repo: zrzuty) |
| 3 | Powiadomienia (macierz zdarzeń, dźwięk, test) | **jest** | tak | tak | tak | tak | część | Macierz 6 zdarzeń zapisuje się w oknie; toast systemowy nie sprawdzony. | kk-w3-acceptance |
| 4 | Głos: modele dyktowania, czytanie na głos, głosy Windows | **jest** | tak | tak | tak | tak | część | whisper.cpp (3 modele, pobranie za zgodą), głosy Windows; dział „Voice” w oknie ustawień czyta `voice.getOverview`: uprawnienie mikrofonu z przyciskiem do ustawień systemu i lista „niedostępne w tej wersji” z powodem. Nie oglądany w oknie; nagrywanie nie sprawdzone. | ipc-voice, voice-overview.test, kk-w12-vault-voice |
| 5 | Głos: model Parakeet, neuronowe czytanie, tryb na żywo | **brak** | część | nie | nie | nie | nie | W kontrakcie tylko lista „niedostępne w tej wersji” z powodem. | kk-w12-vault-voice |
| 6 | Dok agentów (przypięcie, kolejność, rozmiar, mini-czat) | **jest** | tak | tak | tak | tak | tak | Podstawy w oknie (W3-T3); ustawienia położenia i ekranów jak w 0.71 nie sprawdzone. | kk-w3-acceptance, ipc-dock |
| 7 | Dynamic Island (stan, nazwa agenta, klik otwiera kartę) | **jest** | tak | tak | tak | tak | tak | Sprawdzone w oknie (W3-T3); haptyka i wybór ekranów poza zakresem. | kk-w3-acceptance, ipc-dock |
| 8 | Computer Use na Windows (stan, zgoda, Stop) | **częściowo** | tak | tak | tak | część | część | Sterownik i zgody są; ekran ustawień uprawnień jak w 0.71 i sterowanie prawdziwym pulpitem w oknie nie sprawdzone. | ipc-computer-use, computer-driver-windows, kk-w3-acceptance |
| 9 | Mobile Connect: telefony, parowanie QR/TLS, trasa (ten komputer / sieć lokalna) | **jest** | tak | tak | tak | tak | część | Parowanie na pętli zwrotnej w oknie (W3-T3), bez prawdziwego telefonu; pod kartami strony panel czyta `mobileConnect.getOverview`: trasy (w użyciu, chmura niedostępna z powodem), telefony z PIN-em, blokadą i powiadomieniami, lista niedostępnych. Panel nie oglądany w oknie. | ipc-mobile-connect, mobile-connect.test, kk-w12-vault-voice |
| 10 | Aktualizacje: tor Stable/Preview, auto pobieranie/instalacja, restart gdy bezczynny | **jest** | tak | tak | tak | tak | nie | Panel „Updates” w oknie ustawień czyta `updatePreferences` i `update`: wersja i stan, tor, sprawdzanie, pobieranie, instalacja, „Restart when idle” z oczekiwaniem i anulowaniem, lista niedostępnych z powodem (zastąpił atrapę z wpisaną na sztywno wersją). Nie oglądany w oknie. | ipc-instance-transfer, kk-w12-screens |
| 11 | Onboarding (język, dostawca, pierwszy agent, Computer Use) | **częściowo** | tak | tak | tak | tak | tak | Przepływ w oknie jest, ale inny niż w 0.71 (bez wyboru hosta lokalny/zdalny, bez darmowych modeli). | kk-w3-acceptance |

### B. Czat, Needs you, wątki

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 12 | Rozmowa (wiadomości, załączniki, historia po restarcie) | **jest** | tak | tak | tak | tak | tak | Z atrapą Codex i z prawdziwym Claude/Codex (W4-T1). | kk-w3-acceptance, kk-w4-verify |
| 13 | Karty Needs you (pytanie, zatwierdzenie, szkic, przejęcie przeglądarki) i przyklejona Decyzja | **jest** | tak | tak | tak | tak | tak | Wszystkie cztery karty w oknie. | kk-w3-acceptance |
| 14 | Kolejka wiadomości (FIFO, edycja, Steer, wznowienie po awarii) | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 15 | Wyszukiwanie w rozmowie i globalne (Ctrl+F, Ctrl+K) | **jest** | tak | tak | tak | tak | tak | W oknie, także zrzut T-H. | kk-w3-acceptance |
| 16 | Pole wiadomości: menu +, skille, `/`, `@`, wysiłek modelu, pytanie poboczne | **częściowo** | tak | tak | tak | część | część | Menu + i wysiłek w nagłówku sprawdzone statycznie; `@` i `/` nie złapane na zrzucie. | tester-w12-odbior2, ipc-composer |
| 17 | Akcje na wiadomościach (kopiuj, przypnij, ponów, wróć do punktu) | **jest** | tak | tak | tak | tak | nie | Silnik i ekran w kodzie, bez odbioru okna (W6). | ipc-message-actions, odbior-w6 |
| 18 | Wątki: nowy, lista, archiwum, nazwa, usuń, gałąź | **jest** | tak | tak | tak | tak | nie | Bez odbioru okna W6. | ipc-threads, odbior-w6 |
| 19 | Zakładki wątków (zamknij inne, obok czatu) | **jest** | tak | tak | tak | tak | część | Chat z wątkami na zrzucie T-H; akcje zakładek nie sprawdzone. | ipc-thread-tabs |
| 20 | Wstrzymania wątku (limit użycia, restart agenta, serwer zajęty, limit wątków) | **częściowo** | część | część | część | część | nie | Jest wstrzymanie budżetem; reszta powodów brak. | ipc-budgets, ipc-threads |
| 21 | Cofnij usunięcie wątku, etykieta „zaczął agent” | **brak** | nie | nie | nie | nie | nie | Brak. | - |
| 22 | Kontekst (wskaźnik, kompaktowanie) i plan (karty planu) | **jest** | tak | tak | tak | tak | nie | Bez odbioru okna. | ipc-context, ipc-plan |
| 23 | Panel boczny czatu (przeglądarka, pliki, ustawienia agenta, głos) | **częściowo** | tak | tak | tak | część | część | Przeglądarka i ustawienia agenta w oknie; panel podagentów jest w kodzie, panel głosu w czacie nie. | kk-w3-acceptance |

### C. Kanały

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 24 | Kanały: tworzenie, lider, członkowie, edycja | **jest** | tak | tak | tak | tak | tak | Odbiór W4-T2 38/38. | kk-w4-g1 |
| 25 | Zadania w kanale (Chat|Zadania, Stop/Wznów/Przydziel, archiwum, otwórz jako czat, kroki) | **jest** | tak | tak | tak | tak | tak | W oknie (W4-T2). Od UI-M: szukanie, „Otwórz jako czat”, rozwijane kroki podzadań (bez zrzutu); Backend dał widok zbiorczy zadań (kontrakt i silnik), ekran jeszcze go nie czyta. | kk-w4-g1, ui-w12-ui2, backend-w12-actions |
| 26 | Odpowiedź na wiadomość kanału | **jest** | tak | tak | tak | tak | tak | Krok e2e. | ipc-workspace-channels, ui-w4-ui1 |
| 27 | Ustawienia kanału (izolowana pamięć, kompakt, kasowanie historii, przeglądarka w kanale, rutyny kanału) | **częściowo** | część | część | część | część | część | Jest pamięć kanału i lider; reszta jak w 0.71 brak. | ipc-memory, ipc-isolation |

### D. Agenci

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 28 | Tworzenie agenta (kreator, awatar 17 kolorów, sugestie, szablony) | **jest** | tak | tak | tak | tak | tak | W oknie (zrzut T-H); od UI-J 12 kształtów maskotek × 17 kolorów (nowych dwóch kształtów nie oglądano w oknie). | kk-w3-acceptance, ui-w12-ui2 |
| 29 | Karty ustawień agenta (jedna lista kart: pliki, foldery, użycie, publikacja, zaawansowane, powiadomienia) | **jest** | tak | tak | tak | tak | część | Ekran złapany na zrzucie T-H, działania kart w oknie nie sprawdzone. | backend-w12-cards2, ipc-agent-card-details |
| 30 | Pamięć agenta i kanału (zawsze / w razie potrzeby, szukanie) | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 31 | Skille (biblioteka, wersje, naprawa, per agent) | **jest** | tak | tak | tak | tak | tak | W oknie (W4-T5). | kk-w4-rows |
| 32 | Szablony agenta (zapis jako szablon na tym komputerze) | **jest** | tak | tak | tak | tak | nie | Silnik BE-G, bez okna. | backend-w12-cards2 |
| 33 | Import agenta z paczki i transfer instancji (zip, podgląd, nowi agenci, rutyny wstrzymane) | **jest** | tak | tak | tak | tak | nie | Działy „Import” i „Transfer” ustawień serwera: trzy karty importu, trzy kroki transferu, eksport wybranych agentów, wybór pliku z podglądem (nic się nie zmienia do potwierdzenia, zajęte imię = kopia z numerem), wynik z ostrzeżeniami, lista „czego nie przenosimy”. Nie oglądane w oknie. | kk-w12-g2, kk-w12-screens |
| 34 | Subagenci i pytanie poboczne | **jest** | tak | tak | tak | tak | nie | Wykonawca pytania pobocznego podpięty; panel podagentów w panelu wątków (stan, podgląd, odpowiedź, Stop, wskazanie karty w Needs you). Nie oglądany w oknie. | backend-w12-side-question |
| 35 | Foldery agentów w pasku bocznym | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 36 | Pasek boczny, szyna stron i szyna serwerów | **częściowo** | tak | tak | tak | tak | część | Brak „Więcej”/przypinania stron, serwera zdalnego nie dało się sprawdzić. | kk-w3-acceptance, ui-w4-ui4 |
| 37 | Uprawnienia, reguły „zawsze zezwalaj”, budżety | **jest** | tak | tak | tak | tak | część | „Zawsze zezwalaj” w oknie; budżety i poziom dostępu bez odbioru okna. | ipc-access, ipc-budgets, ipc-approval-rules |

### E. Narzędzia i dane (MCP, Vault, tabele, pliki, przeglądarka)

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 38 | MCP: lista, dodawanie (stdio/HTTP), narzędzia, dostęp per agent | **jest** | tak | tak | tak | tak | tak | W oknie (serwer stdio). | kk-w3-acceptance |
| 39 | MCP: logowanie OAuth w przeglądarce | **jest** | tak | tak | tak | tak | nie | Sekcja „Sign in to MCP servers” pod listą serwerów MCP: stan (wylogowany, czeka na przeglądarkę, kończenie, zalogowany, błąd), Zaloguj / Anuluj / Wyloguj, stałe zdania błędów. Nie oglądana w oknie; prawdziwego logowania nie sprawdzano. | kk-w12-oauth, kk-w12-screens |
| 40 | Vault lokalny (login, karta, kontakt, klucz, TOTP; agent bierze bez ujawnienia) | **jest** | tak | tak | tak | tak | część | Login z wypełnieniem w oknie (hasła nie ma w wyniku, czacie ani plikach); karta, kontakt, klucz, TOTP tylko silnik i testy. | kk-w4-rows, ipc-vault |
| 41 | Vault: pokaż/skopiuj sekret osobie, import CSV | **brak** | nie | nie | nie | nie | nie | Świadomie: wartości są tylko do zapisu. | ipc-vault |
| 42 | Vault: konektory 1Password, Bitwarden, Proton Pass | **jest** | tak | tak | tak | tak | nie | Panel konektorów (stan, wybór metody, pola tylko do zapisu, lista dozwolonych logowań bez haseł, rozłączanie) jest w integracji (UI-M). W oknie nie oglądany; prawdziwe menedżery wymagają kont właściciela. | kk-w11-vault, ui-w12-ui2 |
| 43 | Vault-request w Needs you (agent prosi o login) | **jest** | tak | tak | tak | tak | część | Wypełnienie logowania w oknie; karta wyboru/dodania nie osobno. | ipc-vault, kk-w4-rows |
| 44 | Tabele wspólne agentów | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 45 | Biblioteka plików: dodaj, otwórz, pobierz, załącz; strona z filtrami, zaznaczanie wielu, sprzątanie; pliki maszyny | **częściowo** | tak | tak | tak | tak | część | Nowy widok plików (zakładki pochodzenia, szukanie, filtry, sortowanie, zaznaczanie do 200, sprzątanie z podglądem) jest w integracji. W oknie: zrzut T-M z pustą listą (bez danych testowych); dowód dodawania/otwierania z W4-T5 dotyczył starego panelu. Brak: przeglądania folderów komputera („pliki maszyny”) i miniatur. | backend-w12-library, tester-w12-tm, kk-w4-rows |
| 46 | Przeglądarka agenta (karty, przejęcie, profile); nauka, podgląd na żywo, PiP | **częściowo** | tak | tak | tak | tak | część | Karty i przejęcie w oknie; nauka, podgląd na żywo, PiP brak. | kk-w3-acceptance, ipc-browser |

### F. Marketplace

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 47 | Marketplace: katalog lokalny agentów i skilli (szczegóły, instalacja, sugestie) | **jest** | tak | tak | tak | tak | tak | Instalacja skilla w oknie (W3-T3); katalog ma 14 skilli i 9 agentów z własnymi tekstami (nie 251). | kk-w3-acceptance, ipc-marketplace, kk-w12-flows |
| 48 | Marketplace: układ jak 0.71 (Featured, kategorie, Verified/Public, link GitHub) | **częściowo** | tak | tak | część | część | część | Kontrakt i atrapa (`ipc-marketplace-screen`); strona ich jeszcze nie używa; zrzut T-H pokazuje starą stronę. | kk-w12-workflows-marketplace |
| 49 | Marketplace Apps: wtyczki jako serwery MCP, własne wtyczki | **częściowo** | tak | tak | tak | tak | nie | Dane katalogu (251) są poza repo, logowanie „link” zależy od OAuth MCP (bez ekranu). | kk-w11-marketplace |

### G. Dostawcy i użycie

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 50 | Codex i Claude: logowanie, CLI zarządzane, pula kont, limity, zapasowe modele | **jest** | tak | tak | tak | tak | tak | W5 29/29 w oknie, instalator. | kk-w5-g2, kk-w5-g3 |
| 51 | Własne endpointy (Ollama / styl LM) | **jest** | tak | tak | tak | tak | tak | W5 na atrapie. | kk-w5-g3 |
| 52 | ACP (Antigravity, Gemini preset, własny agent) z logowaniem | **jest** | tak | tak | tak | tak | nie | Tura z prawdziwym agentem nieodebrana w oknie. | ipc-acp-presets, ipc-acp-login |
| 53 | Katalog 18 dostawców (opisy, klucze maskowane, presety ACP oznaczone „niezweryfikowane”) | **jest** | tak | tak | tak | tak | nie | Strona Dostawcy ma sekcję „Katalog dostawców” (UI-P): 18 kart ze stanem wsparcia, pula kluczy tylko do zapisu (maska, włącz/wyłącz, limit). Nie oglądany w oknie; polecenia ACP nadal niezweryfikowane, brak sterowników natywnych. | backend-w12-providers, backend-w12-accounts, ui-w12-ui2 |
| 54 | Sterowniki innych dostawców (Grok, Cursor, OpenRouter, DeepSeek, Kimi, Copilot…) | **brak** | część | nie | nie | nie | nie | Tylko opisy w katalogu; polecenia ACP niezweryfikowane. | backend-w12-providers |
| 55 | Użycie: liczniki i pierścienie limitów, wykresy 7–365 dni, podział wg modelu i rodzaju tokenów | **jest** | tak | tak | tak | tak | część | Ekran Użycie: zakładki okresów, kafle, wykres dzienny, obciążenie komputera, tabela agentów i modeli, podział tokenów z pokryciem, limity dostawców. W oknie: zrzut T-M (pusta strona bez danych). Nie ma podziału na umiejętność. | backend-w12-library, backend-w12-accounts, tester-w12-tm |

### H. Automatyzacje (rutyny, przepływy)

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 56 | Rutyny agenta (harmonogram, webhook, historia, uruchom teraz) | **jest** | tak | tak | tak | tak | część | W oknie: tworzenie, następny start, Run now, minutowa sama; daily/cron/webhook nie. | kk-w3-acceptance, ipc-routines |
| 57 | Harmonogram: zaplanowane i wykonane przebiegi rutyn, feed ostatnich uruchomień | **jest** | tak | tak | tak | tak | część | Ekran Harmonogram: najbliższe dni po dniach (status, godzina), rutyny z zewnątrz i wstrzymane, feed. W oknie: zrzut T-M (pusta strona bez danych). Brak siatki miesięcznego kalendarza i notatek przy przebiegu. | backend-w12-library, tester-w12-tm |
| 58 | Rutyny kanału | **brak** | nie | nie | nie | nie | nie | Brak. | - |
| 59 | Przepływy: graf, wyzwalacz, agent, zgoda, wyjście, uruchomienia | **jest** | tak | tak | tak | tak | część | Wyzwalacz + agent w oknie; krok zgody nie. | kk-w3-acceptance, workflow-manager.test |
| 60 | Edytor przepływów jak 0.71 (paleta węzłów z Prompt i Condition, karta triggera, cofnij/ponów, plakietki błędów) | **częściowo** | tak | tak | tak | część | nie | Kontrakt, atrapa i silnik mają Prompt i Condition oraz funkcje edytora; stary edytor dostał tylko most (przyciski „Add prompt/condition”), nowego edytora nie ma. | kk-w12-flows, kk-w12-workflows-marketplace |
| 61 | Przepływy: wersje i przywracanie; katalog GitHub, kredyty mediów | **częściowo** | tak | tak | tak | nie | nie | Wersje (lista, podgląd, przywracanie, różnice) mają kontrakt, silnik i testy (KK-L); ekranu nie ma. Katalog GitHub i kredyty mediów: brak. | kk-w12-flows |

### I. Komunikatory

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 62 | Telegram (long polling, tylko dozwoleni, tylko rozmowy prywatne) | **jest** | tak | tak | tak | tak | nie | Panel „Messengers” na stronie Library: stan, token tylko do zapisu (pole czyszczone), lista dopuszczonych i nieznanych rozmów (bez treści), dopuszczanie z agentem, kroki konfiguracji. Nie oglądany w oknie; prawdziwego bota nie sprawdzano. | kk-w10-kk2, kk-w12-screens |
| 63 | Slack (Socket Mode, tylko DM) | **jest** | tak | tak | tak | tak | nie | Ten sam panel: dwa tokeny (bota i aplikacji), tylko wiadomości prywatne (numer D…). Nie oglądany w oknie; prawdziwego Slacka nie sprawdzano. | kk-w12-komunikatory, kk-w12-screens |
| 64 | Discord | **brak** | nie | nie | nie | nie | nie | Wstrzymany decyzją lidera. | - |
| 65 | Łącznik GitHub (repozytoria, kod urządzenia) | **brak** | nie | nie | nie | nie | nie | Brak. | - |

### J. Serwer, zespół, zdalny pulpit, telefon

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 66 | Ustawienia serwera (14 sekcji) | **częściowo** | tak | tak | tak | tak | część | 12 sekcji z danymi, Członkowie i Strony „niedostępne”; ekran na zrzucie T-H. | ipc-server-settings, backend-w12-settings |
| 67 | Zespół: członkowie, zaproszenia, obecność, DM, hostowanie | **częściowo** | tak | tak | tak | tak | nie | Okno dołączania jest; reszty nie dało się sprawdzić (sieć, konto). | kk-w3-acceptance, ipc-team-host |
| 68 | Zdalny pulpit Windows (host, klient, zgoda, tryby, „pytaj przy każdej sesji”) | **jest** | tak | tak | tak | tak | część | Silnik z testem na hoście i kliencie; strona ma panel „Who may come in”: plakietka (gotowe/wyłączone/niedostępne), sesje i karty czekające, przełącznik „Ask on this computer every time” (`setAskEverySession`), „Unattended access: niedostępne” z powodem. Panel nie oglądany w oknie; obraz i sterowanie w oknie nie sprawdzane; bez trybu bez nadzoru z założenia. | ipc-remote-desktop, kk-w12-vault-voice |
| 69 | Telefon: czat i odpowiedzi na decyzje (PWA) | **częściowo** | tak | tak | tak | tak | część | W oknie z atrapą; przełącznik powiadomień i test są w panelu telefonów (nie oglądane w oknie); brak prawdziwego telefonu. | kk-w3-acceptance, mobile-app |
| 70 | Telefon: tworzenie i edycja agentów | **częściowo** | tak | tak | tak | tak | część | Tworzenie widać na komputerze; edycja i awatar nie. | kk-w3-acceptance |
| 71 | Telefon: kanały w PWA | **brak** | nie | nie | nie | nie | nie | Brak. | - |
| 72 | Skróty klawiszowe (Ctrl+K, Ctrl+F, Alt+↑, zakładki) | **częściowo** | część | część | część | część | część | Wybrane skróty działają; pełnej mapy 0.71 nie ma. | kk-w3-acceptance |

## Poza zakresem (nie liczone)

| Funkcja 0.71 | Dlaczego |
|---|---|
| Rozliczenia (Stripe), plany serwerów, licencje | Program tylko dla właściciela; decyzja właściciela 12.11. |
| Serwery hostowane w chmurze (tworzenie, wznawianie, zamówienia) | Nie cel; serwer Linux właściciel robi sam. |
| Konto chmurowe: e-mail, sesje, logowanie firmowe/SCIM | Nie cel. |
| WhatsApp (QR, grupy, dozwoleni nadawcy) | Decyzja lidera: nie (nieoficjalne API, ryzyko). |
| Mobile: stały link i trasa przez chmurę | Poza zakresem (stały link wpuszcza każdego, kto go znajdzie; chmura = dane poza komputerem). Zapisane w kontrakcie jako „niedostępne”. |
| Skille wbudowane OpenBota (3) i wygląd graficzny 0.71 | Własne zasoby; wygląd to bramka UI Testera, nie parytet funkcji. |

## Zmiany od wersji @ `b1e28ab8f` + w12-flows (68,8%)

| Miara | Było | Jest | Dlaczego |
|---|---|---|---|
| Parytet kodowy | 68,8% | **75%** | dziewięć wierszy (Aktualizacje, Import/Transfer, OAuth MCP, Telegram, Slack, katalog 18 dostawców, głos z mikrofonem, zdalny pulpit z przełącznikiem „pytaj”, podagenci): częściowo → jest; Mobile Connect już był „jest”, dostał panel jednym zapytaniem |
| Skontraktowane | 87,5% | **87,5%** | bez zmian |
| Silnik | 86,1% | 86,1% | bez zmian |
| Ekran w kodzie | 70,8% | 81,3% | panele KK (Aktualizacje, OAuth MCP, Komunikatory, Głos, Mobile Connect jednym zapytaniem, zdalny pulpit, podagenci), dział Import/Transfer i katalog dostawców UI |
| W oknie sprawdzone | 45,1% | 45,1% | bez zmian: nowe ekrany nie były oglądane w oknie |
| Ostrożny parytet | 56,9% | 56,9% | „jest” bez dowodu w oknie liczy się za ½, jak wcześniej „częściowo” |

## Decyzje: luki bez silnika

Godziny to moja ocena (kontrakt + silnik + testy na atrapach), nie pomiar. „Lekkie” = testy jednostkowe z fałszywym serwerem; „ciężkie” = potrzebne okno programu, prawdziwe CLI albo konto. Szczegóły i uzasadnienia: `luki-silnika-071.md`.

| Luka | Stan | Koszt | Lekkie/ciężkie | Decyzja | Wpływ na parytet |
|---|---|---|---|---|---|
| Marketplace: więcej treści (dziś 8 skilli + 5 agentów) | instalacja działa; dziś 14 skilli + 9 agentów | ok. 7 h (6 skilli + 4 agenty) | lekkie | ZROBIONE (73e452605) | 0 (poprawia wartość, nie wiersz) |
| Marketplace: instalacja skilla z linku GitHub | brak | ok. 8 h | lekkie, kod z internetu | NIE ROBIĆ teraz (tylko jeśli właściciel chce, z kartą zgody) | 0 |
| Workflows: Condition + Prompt | silnik, kontrakt i atrapa są; edytor tylko z mostem | ok. 7 h (5 + 2) | lekkie | ZROBIONE (gałąź w12-flows) | 0 (edytor dostaje te węzły) |
| Workflows: wersje przepływu i przywracanie | silnik, kontrakt i atrapa są; ekranu brak | ok. 5 h | lekkie | ZROBIONE (2540926db) | +0,7 pp (brak → częściowo) |
| Workflows: LLM, Asset, adnotacje na płótnie | brak | ok. 13 h (5 + 5 + 3) | lekkie | NIE ROBIĆ teraz | 0 |
| Workflows: Image/Video, katalog GitHub, kredyty mediów | brak | 12 h+ każde | ciężkie | NIE ROBIĆ | 0 |
| Discord (tylko DM) | wstrzymany | ok. 9 h | lekkie (prawdziwy test: token bota) | NIE ROBIĆ teraz (najpierw ekran komunikatorów) | +0,7 pp silnik; +1,4 pp z ekranem |
| Rutyny kanału | brak | ok. 6 h | lekkie | NIE ROBIĆ teraz (rutyny agenta wystarczają) | +0,7 pp |
| Sterowniki innych dostawców (Grok, Cursor, OpenRouter…) | brak, Backend robi pulę kluczy dla katalogu | ok. 8 h | ciężkie (potrzebne CLI, polecenia niezweryfikowane) | NIE ROBIĆ bez zgody właściciela na pobranie CLI | +0,7 pp |
| Cofnięcie usunięcia wątku | brak | ok. 3 h | lekkie | ROBI BACKEND (BE-J, w kolejce) | +0,7 pp |
| Wstrzymania wątku (restart agenta, serwer zajęty, limit wątków) | częściowo | ok. 5 h | lekkie | ROBIĆ, jeśli wątki idą do odbioru okna | +0,7 pp |

**Zostaje „robić”: ok. 5 h** (wstrzymania wątku; cofnięcie usunięcia wątku robi Backend; treści Marketplace, Condition + Prompt i wersje przepływów są już zrobione). Silnik bez ekranu liczy się za ½ wiersza; ekrany do gotowych silników, które jeszcze zostały: układ Marketplace Agents/Skills i edytor Workflows z paletą i kartą triggera (UI Designer). Komunikatory, aktualizacje, OAuth MCP, Import/Transfer, głos (mikrofon), Mobile Connect, zdalny pulpit, katalog dostawców, Vault konektory, Biblioteka, Użycie i Harmonogram już mają ekran.

## Czego nie sprawdziłem

1. Nie uruchamiałem Electrona, Storybooka, testów ani e2e w tym zadaniu: stan wierszy to czytanie kodu integracji, kontraktów, raportów i testów (nazwy), nie ponowne przebiegi.
2. Dowody „w oknie” są z raportów z 13–17.11 (poprzednie wersje integracji); zmiany UI po nich (UI-I, UI-J) nie były oglądane w oknie.
3. Kolumny K/S/E oceniłem z listy plików i użycia `window.openbot.*` w rendererze (grep), nie przez uruchomienie ekranu; „część” oznacza, że znalazłem tylko fragment.
4. Biblioteka, Użycie i Harmonogram: zrzut T-M pokazuje, że ekrany się rysują, ale bez danych testowych (puste listy); to „część”, nie „tak”. Panel Vault konektorów i Zadania z UI-M nie miały zrzutu.
5. Po zmianach UI-I/UI-J pełny sandbox:e2e miał 27 ok / 3 FAIL, a po poprawkach Testera (T-M) 30 ok / 0 FAIL na `79567cdf9`; zmiany UI po tym SHA (UI-M, UI-N, UI-O) nie miały jeszcze nowego przebiegu.
6. Wszystkie opisy są własnymi słowami; w repo nie ma treści ani grafik OpenBota, a pliki analizy 0.71 zostają poza repo.
