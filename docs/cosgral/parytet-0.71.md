# Parytet z OpenBotem 0.71 (funkcje)

Stan: 17.11.2026, integracja `codex/cosgral-desktop` @ `65eb4de06` (branch KK-I). Tylko to, co jest w tej integracji; Backend (Biblioteka/Użycie/Harmonogram) i UI na swoich gałęziach nie są liczone.

**Wynik w jednej linii: 47 z 72 funkcji = 65,3% (jest = 1, częściowo = ½). Z tego skontraktowane 83,3%, ale w prawdziwym oknie sprawdzone tylko 44,4%. Ostrożnie (jest liczy się za 1 tylko z dowodem w oknie, jak reguła 0.68): 55,6%.**

| Miara | Wynik | Jak liczona |
|---|---|---|
| Parytet (kod) | **65,3%** (47 z 72) | 32 jest, 30 częściowo, 10 brak |
| Skontraktowane | **83,3%** | wiersz ma kontrakt w `packages/contracts` (tak = 1, część = ½) |
| Silnik | 82,6% | kod w `src/backend` albo `src/main` (tak = 1, część = ½) |
| Ekran w kodzie | 66% | komponent w `src/renderer` czyta to API (tak = 1, część = ½) |
| W oknie sprawdzone | **44,4%** | 19 wierszy w pełni (tak), 26 częściowo; reszta nie sprawdzona w prawdziwym programie |
| Ostrożny parytet | 55,6% | jest bez dowodu w oknie liczy się ½, częściowo ½, brak 0 |

Poza zakresem (nie wchodzą do mianownika): 6 pozycji, lista na końcu. Gdyby je policzyć jako brak, parytet kodowy = 47 z 78 = 60,3%.

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
| A. Ustawienia aplikacji i powłoka | 11 | 4 | 6 | 1 | 64% |
| B. Czat, Needs you, wątki | 12 | 8 | 3 | 1 | 79% |
| C. Kanały | 4 | 3 | 1 | 0 | 88% |
| D. Agenci | 10 | 7 | 3 | 0 | 85% |
| E. Narzędzia i dane (MCP, Vault, tabele, pliki, przeglądarka) | 9 | 4 | 4 | 1 | 67% |
| F. Marketplace | 3 | 1 | 2 | 0 | 67% |
| G. Dostawcy i użycie | 6 | 3 | 2 | 1 | 67% |
| H. Automatyzacje (rutyny, przepływy) | 6 | 2 | 1 | 3 | 42% |
| I. Komunikatory | 4 | 0 | 2 | 2 | 25% |
| J. Serwer, zespół, zdalny pulpit, telefon | 7 | 0 | 6 | 1 | 43% |

## Tabela funkcji

### A. Ustawienia aplikacji i powłoka

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Język PL/EN i napisy | **częściowo** | tak | tak | tak | tak | część | Wybór języka działa bez restartu; panel Narzędzia CLI i część napisów po angielsku (tłumaczenie CLI czeka na W5 Testera). | kk-w3-acceptance, ui-w7-ui2, i18n.test |
| 2 | Wygląd i ustawienia ogólne (motyw, czcionki, kolory czatu, skrót wysyłania, kolejność nieprzeczytanych, kroki agenta) | **częściowo** | część | część | część | część | część | Jest motyw ciemny/jasny/systemowy (zrzuty T-H) i język; brak rozmiaru UI, czcionek, koloru logo i czatu, skrótu wysyłania, autostartu. | ui-w7-ui1, tester-w12-zrzuty2 (poza repo: zrzuty) |
| 3 | Powiadomienia (macierz zdarzeń, dźwięk, test) | **jest** | tak | tak | tak | tak | część | Macierz 6 zdarzeń zapisuje się w oknie; toast systemowy nie sprawdzony. | kk-w3-acceptance |
| 4 | Głos: modele dyktowania, czytanie na głos, głosy Windows | **częściowo** | tak | tak | tak | część | część | whisper.cpp (3 modele, pobranie za zgodą), głosy Windows; ekran używa starszego API (bez przeglądu i mikrofonu); nagrywanie nie sprawdzone. | ipc-voice, voice-overview.test, kk-w12-vault-voice |
| 5 | Głos: model Parakeet, neuronowe czytanie, tryb na żywo | **brak** | część | nie | nie | nie | nie | W kontrakcie tylko lista „niedostępne w tej wersji” z powodem. | kk-w12-vault-voice |
| 6 | Dok agentów (przypięcie, kolejność, rozmiar, mini-czat) | **jest** | tak | tak | tak | tak | tak | Podstawy w oknie (W3-T3); ustawienia położenia i ekranów jak w 0.71 nie sprawdzone. | kk-w3-acceptance, ipc-dock |
| 7 | Dynamic Island (stan, nazwa agenta, klik otwiera kartę) | **jest** | tak | tak | tak | tak | tak | Sprawdzone w oknie (W3-T3); haptyka i wybór ekranów poza zakresem. | kk-w3-acceptance, ipc-dock |
| 8 | Computer Use na Windows (stan, zgoda, Stop) | **częściowo** | tak | tak | tak | część | część | Sterownik i zgody są; ekran ustawień uprawnień jak w 0.71 i sterowanie prawdziwym pulpitem w oknie nie sprawdzone. | ipc-computer-use, computer-driver-windows, kk-w3-acceptance |
| 9 | Mobile Connect: telefony, parowanie QR/TLS, trasa (ten komputer / sieć lokalna) | **jest** | tak | tak | tak | tak | część | Parowanie na pętli zwrotnej w oknie (W3-T3), bez prawdziwego telefonu; strona nie używa jeszcze `mobileConnect.getOverview`. | ipc-mobile-connect, mobile-connect.test, kk-w12-vault-voice |
| 10 | Aktualizacje: tor Stable/Preview, auto pobieranie/instalacja, restart gdy bezczynny | **częściowo** | tak | tak | tak | nie | nie | Silnik i kontrakt gotowe, ekranu w oknie nie ma. | ipc-instance-transfer, update-service.test |
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
| 23 | Panel boczny czatu (przeglądarka, pliki, ustawienia agenta, głos) | **częściowo** | tak | tak | tak | część | część | Przeglądarka i ustawienia agenta w oknie; panel subagenta i głosu nie. | kk-w3-acceptance |

### C. Kanały

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 24 | Kanały: tworzenie, lider, członkowie, edycja | **jest** | tak | tak | tak | tak | tak | Odbiór W4-T2 38/38. | kk-w4-g1 |
| 25 | Zadania w kanale (Chat|Zadania, Stop/Wznów/Przydziel, archiwum) | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w4-g1 |
| 26 | Odpowiedź na wiadomość kanału | **jest** | tak | tak | tak | tak | tak | Krok e2e. | ipc-workspace-channels, ui-w4-ui1 |
| 27 | Ustawienia kanału (izolowana pamięć, kompakt, kasowanie historii, przeglądarka w kanale, rutyny kanału) | **częściowo** | część | część | część | część | część | Jest pamięć kanału i lider; reszta jak w 0.71 brak. | ipc-memory, ipc-isolation |

### D. Agenci

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 28 | Tworzenie agenta (kreator, awatar 17 kolorów, sugestie, szablony) | **jest** | tak | tak | tak | tak | tak | W oknie; maskotek 10 kształtów zamiast 12, wygląd w poprawkach UI. | kk-w3-acceptance, ui-w12-ui2 |
| 29 | Karty ustawień agenta (jedna lista kart: pliki, foldery, użycie, publikacja, zaawansowane, powiadomienia) | **jest** | tak | tak | tak | tak | część | Ekran złapany na zrzucie T-H, działania kart w oknie nie sprawdzone. | backend-w12-cards2, ipc-agent-card-details |
| 30 | Pamięć agenta i kanału (zawsze / w razie potrzeby, szukanie) | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 31 | Skille (biblioteka, wersje, naprawa, per agent) | **jest** | tak | tak | tak | tak | tak | W oknie (W4-T5). | kk-w4-rows |
| 32 | Szablony agenta (zapis jako szablon na tym komputerze) | **jest** | tak | tak | tak | tak | nie | Silnik BE-G, bez okna. | backend-w12-cards2 |
| 33 | Import agenta z paczki i transfer instancji (zip, podgląd, nowi agenci, rutyny wstrzymane) | **częściowo** | tak | tak | tak | nie | nie | Silnik i testy (zip-slip, limity, brak sekretów); ekranu w oknie nie ma. | kk-w12-g2, transfer-service.test |
| 34 | Subagenci i pytanie poboczne | **częściowo** | tak | tak | tak | część | nie | Wykonawca pytania pobocznego podpięty; panel subagenta brak. | backend-w12-side-question |
| 35 | Foldery agentów w pasku bocznym | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 36 | Pasek boczny, szyna stron i szyna serwerów | **częściowo** | tak | tak | tak | tak | część | Brak „Więcej”/przypinania stron, serwera zdalnego nie dało się sprawdzić. | kk-w3-acceptance, ui-w4-ui4 |
| 37 | Uprawnienia, reguły „zawsze zezwalaj”, budżety | **jest** | tak | tak | tak | tak | część | „Zawsze zezwalaj” w oknie; budżety i poziom dostępu bez odbioru okna. | ipc-access, ipc-budgets, ipc-approval-rules |

### E. Narzędzia i dane (MCP, Vault, tabele, pliki, przeglądarka)

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 38 | MCP: lista, dodawanie (stdio/HTTP), narzędzia, dostęp per agent | **jest** | tak | tak | tak | tak | tak | W oknie (serwer stdio). | kk-w3-acceptance |
| 39 | MCP: logowanie OAuth w przeglądarce | **częściowo** | tak | tak | tak | nie | nie | Silnik z PKCE i pętlą zwrotną, 5 kanałów; ekranu logowania w oknie nie ma. | kk-w12-oauth, mcp-oauth |
| 40 | Vault lokalny (login, karta, kontakt, klucz, TOTP; agent bierze bez ujawnienia) | **jest** | tak | tak | tak | tak | część | Login z wypełnieniem w oknie (hasła nie ma w wyniku, czacie ani plikach); karta, kontakt, klucz, TOTP tylko silnik i testy. | kk-w4-rows, ipc-vault |
| 41 | Vault: pokaż/skopiuj sekret osobie, import CSV | **brak** | nie | nie | nie | nie | nie | Świadomie: wartości są tylko do zapisu. | ipc-vault |
| 42 | Vault: konektory 1Password, Bitwarden, Proton Pass | **częściowo** | tak | tak | tak | nie | nie | Silnik z listą logowań, bez ekranu. | kk-w11-vault, ipc-vault-connectors |
| 43 | Vault-request w Needs you (agent prosi o login) | **jest** | tak | tak | tak | tak | część | Wypełnienie logowania w oknie; karta wyboru/dodania nie osobno. | ipc-vault, kk-w4-rows |
| 44 | Tabele wspólne agentów | **jest** | tak | tak | tak | tak | tak | W oknie. | kk-w3-acceptance |
| 45 | Biblioteka plików (dodaj, otwórz, pobierz, załącz); siatka, zaznaczanie, sprzątanie, pliki maszyny | **częściowo** | część | część | część | część | część | Podstawy w oknie; siatka/zaznaczanie/sprzątanie: Backend w toku, nie w integracji. | kk-w4-rows, ipc-library |
| 46 | Przeglądarka agenta (karty, przejęcie, profile); nauka, podgląd na żywo, PiP | **częściowo** | tak | tak | tak | tak | część | Karty i przejęcie w oknie; nauka, podgląd na żywo, PiP brak. | kk-w3-acceptance, ipc-browser |

### F. Marketplace

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 47 | Marketplace: katalog lokalny agentów i skilli (szczegóły, instalacja, sugestie) | **jest** | tak | tak | tak | tak | tak | Instalacja skilla w oknie; 8 skilli i 5 agentów, nie 251. | kk-w3-acceptance, ipc-marketplace |
| 48 | Marketplace: układ jak 0.71 (Featured, kategorie, Verified/Public, link GitHub) | **częściowo** | tak | tak | część | część | część | Kontrakt i atrapa (`ipc-marketplace-screen`); strona ich jeszcze nie używa; zrzut T-H pokazuje starą stronę. | kk-w12-workflows-marketplace |
| 49 | Marketplace Apps: wtyczki jako serwery MCP, własne wtyczki | **częściowo** | tak | tak | tak | tak | nie | Dane katalogu (251) są poza repo, logowanie „link” zależy od OAuth MCP (bez ekranu). | kk-w11-marketplace |

### G. Dostawcy i użycie

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 50 | Codex i Claude: logowanie, CLI zarządzane, pula kont, limity, zapasowe modele | **jest** | tak | tak | tak | tak | tak | W5 29/29 w oknie, instalator. | kk-w5-g2, kk-w5-g3 |
| 51 | Własne endpointy (Ollama / styl LM) | **jest** | tak | tak | tak | tak | tak | W5 na atrapie. | kk-w5-g3 |
| 52 | ACP (Antigravity, Gemini preset, własny agent) z logowaniem | **jest** | tak | tak | tak | tak | nie | Tura z prawdziwym agentem nieodebrana w oknie. | ipc-acp-presets, ipc-acp-login |
| 53 | Katalog 18 dostawców (opisy, klucze maskowane, presety ACP oznaczone „niezweryfikowane”) | **częściowo** | tak | tak | tak | nie | nie | Kontrakt i silnik; ekran Dostawcy nie czyta jeszcze katalogu. | backend-w12-providers |
| 54 | Sterowniki innych dostawców (Grok, Cursor, OpenRouter, DeepSeek, Kimi, Copilot…) | **brak** | część | nie | nie | nie | nie | Tylko opisy w katalogu; polecenia ACP niezweryfikowane. | backend-w12-providers |
| 55 | Użycie: liczniki i pierścienie limitów, wykresy 7–90 dni | **częściowo** | część | część | część | część | część | Liczniki i ekran Użycie są, wykresy i pierścienie: Backend w toku. | ipc-providers, ipc-budgets |

### H. Automatyzacje (rutyny, przepływy)

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 56 | Rutyny agenta (harmonogram, webhook, historia, uruchom teraz) | **jest** | tak | tak | tak | tak | część | W oknie: tworzenie, następny start, Run now, minutowa sama; daily/cron/webhook nie. | kk-w3-acceptance, ipc-routines |
| 57 | Harmonogram: kalendarz rutyn, feed i wyniki | **brak** | nie | część | nie | nie | nie | Backend w toku (nie w integracji); silnik zna `nextRunAfter`. | kk-w12-workflows-marketplace |
| 58 | Rutyny kanału | **brak** | nie | nie | nie | nie | nie | Brak. | - |
| 59 | Przepływy: graf, wyzwalacz, agent, zgoda, wyjście, uruchomienia | **jest** | tak | tak | tak | tak | część | Wyzwalacz + agent w oknie; krok zgody nie. | kk-w3-acceptance, workflow-manager.test |
| 60 | Edytor przepływów jak 0.71 (paleta węzłów, karta triggera, cofnij/ponów, plakietki błędów) | **częściowo** | tak | tak | nie | nie | nie | Kontrakt + atrapa; edytor ich nie używa. | kk-w12-workflows-marketplace |
| 61 | Przepływy: wersje, katalog GitHub, kredyty mediów | **brak** | nie | nie | nie | nie | nie | Brak. | - |

### I. Komunikatory

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 62 | Telegram (long polling, tylko dozwoleni, tylko rozmowy prywatne) | **częściowo** | tak | tak | tak | nie | nie | Sterownik i most z atrapami; ekran połączeń w oknie nie istnieje. | kk-w10-kk2, kk-w12-komunikatory |
| 63 | Slack (Socket Mode, tylko DM) | **częściowo** | tak | tak | tak | nie | nie | Jak wyżej. | kk-w12-komunikatory, slack-driver.test |
| 64 | Discord | **brak** | nie | nie | nie | nie | nie | Wstrzymany decyzją lidera. | - |
| 65 | Łącznik GitHub (repozytoria, kod urządzenia) | **brak** | nie | nie | nie | nie | nie | Brak. | - |

### J. Serwer, zespół, zdalny pulpit, telefon

| Nr | Funkcja 0.71 (własnymi słowami) | Stan | K | S | T | E | O | Dowód i luka | Źródło |
|---|---|---|---|---|---|---|---|---|---|
| 66 | Ustawienia serwera (14 sekcji) | **częściowo** | tak | tak | tak | tak | część | 12 sekcji z danymi, Członkowie i Strony „niedostępne”; ekran na zrzucie T-H. | ipc-server-settings, backend-w12-settings |
| 67 | Zespół: członkowie, zaproszenia, obecność, DM, hostowanie | **częściowo** | tak | tak | tak | tak | nie | Okno dołączania jest; reszty nie dało się sprawdzić (sieć, konto). | kk-w3-acceptance, ipc-team-host |
| 68 | Zdalny pulpit Windows (host, klient, zgoda, tryby, „pytaj przy każdej sesji”) | **częściowo** | tak | tak | tak | część | część | Silnik z testem na hoście i kliencie; obraz i sterowanie w oknie nie sprawdzane; strona nie ma jeszcze przełącznika „pytaj”; bez trybu bez nadzoru. | ipc-remote-desktop, kk-w12-vault-voice |
| 69 | Telefon: czat i odpowiedzi na decyzje (PWA) | **częściowo** | tak | tak | tak | tak | część | W oknie z atrapą; brak powiadomień push i prawdziwego telefonu. | kk-w3-acceptance, mobile-app |
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

## Czego nie sprawdziłem

1. Nie uruchamiałem Electrona, Storybooka, testów ani e2e w tym zadaniu: stan wierszy to czytanie kodu integracji, kontraktów, raportów i testów (nazwy), nie ponowne przebiegi.
2. Dowody „w oknie” są z raportów z 13–17.11 (poprzednie wersje integracji); zmiany UI po nich (UI-I, UI-J) nie były oglądane w oknie.
3. Kolumny K/S/E oceniłem z listy plików i użycia `window.openbot.*` w rendererze (grep), nie przez uruchomienie ekranu; „część” oznacza, że znalazłem tylko fragment.
4. Liczby w pozycji „Użycie”, „Biblioteka”, „Harmonogram” zmienią się po scaleniu pracy Backendu (BE-H).
5. Wszystkie opisy są własnymi słowami; w repo nie ma treści ani grafik OpenBota, a pliki analizy 0.71 zostają poza repo.
