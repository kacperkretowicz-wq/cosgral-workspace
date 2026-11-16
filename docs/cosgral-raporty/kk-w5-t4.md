# KK Fullstack: W5-T4, odbiór w prawdziwym oknie (konta z puli, klucze API, punkty końcowe, modele zapasowe)

Data: 16.11.2026. Gałąź `team/kk/w5-t4` (od `codex/cosgral-desktop` @ `17d7f1c26`, z scalonymi K1, K2, BE3–BE6, UI3–UI5). Prawdziwy Electron w piaskownicy, atrapy: CLI Codex z limitem i logowaniem, serwer modeli na 127.0.0.1 (lista modeli + Chat Completions SSE), serwer sprawdzania klucza. Bez prawdziwych kont, usług i logowań.

## Wynik w jednej linii

**`sandbox:e2e`: 30 ok, 0 FAIL, 0 findings (na końcowym buildzie; wcześniej też 30/0/0). Nowe kroki W5 (`COSGRAL_MODE=w5`): 24/24 ok na czystej piaskownicy, 0 błędów konsoli. Odbiór znalazł 1 usterkę blokującą w moim K1 (karta „kontynuować na innym koncie?" znikała z okna) i ją naprawiłem.**

## Usterki znalezione w oknie

| Nr | Waga | Co | Odtworzenie | Stan |
|---|---|---|---|---|
| 1 | **wysoka (blokująca)** | Limit po pierwszej akcji: karta „Limit reached on X. Continue on Y?" w K1 znikała z okna, więc nie dało się jej zatwierdzić (backend trzymał ją jako otwartą, okno nie). Powód: backend wysyłał kartę przed `turn-completed`, a okno przy końcu tury kasuje otwarte karty agenta. | krok P07: agent przypisany do konta z limitem po poleceniu; w „Needs you" nie było wiersza (tylko kropka przy agencie). Test jednostkowy K1 tego nie łapał (patrzył na stan backendu). | **Naprawione** w `agent-service.ts` (karta po `turn-completed`, `#afterTurn`), test jednostkowy sprawdza kolejność, P07 zielone w oknie. Zmiana kodu programu, jedyna. |
| 2 | niska | Surowy prefiks `Error invoking remote method '…': Error:` w komunikatach błędów z okna API: odmowa dodania konta ponad limit (P05) i odmowa zapisu listy zapasowych (F01). Strony kont i punktów końcowych go wycinają; `ProvidersPage` (lista zapasowych: `fail = e.message`) nie. | `window.openbot.subscriptions.addAccount` ponad limit; `providers.setFallbackModels` z 9 modelami. | Opisane, nie naprawiane (UI4 blokuje 9. pozycję przyciskiem, ale inne błędy listy pokażą prefiks). |
| 3 | niska (UX) | Gdy agent wraca na swoje konto po limicie i od razu trafia na limit, okno dostaje dwa zdarzenia: „Back on the first account" (`returned`) i zaraz „Switched … usage-limit". To poprawne zachowanie (tura rzeczywiście zaczęła się na pierwszym koncie), ale karty idą po sobie. | P06 po P04. | Opisane. |
| 4 | niska | Jedno z pierwszych uruchomień nowych kroków wisiało ~10 min w P04 (renderer zajęty), 3 kolejne uruchomienia tych samych kroków przeszły. Zbiegło się z innym ciężkim poleceniem na komputerze i z procesem Electrona po poprzednim przerwanym przebiegu. | nie odtworzone | Nie wyjaśnione. Dodałem do skryptu 90-sekundowy limit na każde wywołanie okna i zapis stosu strony (`Debugger.pause`), żeby następnym razem było widać, gdzie stoi. |

## Kryteria `spec-w5.md` (jest / częściowo / brak) z dowodem

Krok = wiersz w `scripts/sandbox-acceptance.ts` (uruchomienie czyste: piaskownica `kk-w5-t4-run4`, poza repozytorium).

| Kryterium | Stan | Dowód |
|---|---|---|
| P01 dwa konta obok siebie z własnym stanem | **jest** | P01: dwa konta dodane i zalogowane na stronie, dwa osobne foldery nazwane ich id; (zawartość folderów nie czytana) |
| P02 jedno konto domyślne na dostawcę | **jest** | P02: domyślne przesunięte Work → systemowe, zawsze 1 „Domyślne" na stronie |
| P03 agent z kontem startuje CLI z folderem konta | **jest** | P03: `WHO` = `home acc-… argvHasHome=false`; agent bez przypisania = `home system`; migawka zna aktywne konto obu |
| P04 pula: kolejność i wyłączone | **jest** | P04: Home wyłączone → przejęło konto systemowe; włączone → Home pierwsze |
| P05 limit kont w puli (3, zmienny) | **jest** | P05: domyślnie 3, strona „Osiągnięto maksymalną liczbę kont", czwarte odrzucone z komunikatem, po podniesieniu do 4 dodane |
| P06 limit przed akcją → następne konto, znacznik w UI | **jest** | P06: `account-limit-reached` „switched" + `account-switched` „usage-limit", karty „Limit reached" i „Switched to account Home" w rozmowie |
| P07 limit po akcji → karta w Needs you, bez cichego przejścia | **jest (po naprawie usterki 1)** | P07: wynik „asks", 2,5 s bez przełączenia, Needs you wymienia agenta, karta „Limit reached on … Continue on …?", Confirm → odpowiada następne konto |
| P08 brak wolnego konta: stan z godziną resetu, bez wiszenia; powrót po resecie | **jest** | P08: wyniki switched, switched, exhausted; karta „Every account in the pool is exhausted" z godziną; wiersz bez „Thinking"; po resecie limity zeszły same, agent na Work (`returned`) |
| P09 kolejność warstw: najpierw konta, potem model zapasowy | **jest** | P09: `limit:switched > limit:switched > limit:exhausted > model`; odpowiedź z punktu końcowego jako modelu zapasowego; po resecie agent wrócił na Work i własny model |
| P10 jeden proces CLI na konto w użyciu | **częściowo** | P10: 3 konta po 1 procesie; konto nigdy nieużyte nie wystartowało procesu. **Nie sprawdzone w oknie:** zatrzymanie bezczynnego procesu po 5 min (tylko test jednostkowy routera) |
| P11 brak udostępniania i eksportu; ostrzeżenie o puli | **częściowo** | P11: 20 wywołań `subscriptions`, żadne nie dotyczy eksportu ani udostępniania; ostrzeżenie „Use only your own accounts…" na stronie; lista kont bez e-maila i tokenu. **Nie sprawdzone:** odmowa dla serwera zdalnego i telefonu (tylko przegląd bezpieczeństwa Testera i test jednostkowy) |
| K01 klucz tylko wejściem | **jest** | K01: pole hasła, po zapisie „Saved key: ••••abcd" i puste pole, brak klucza w odpowiedzi i drzewie dostępności |
| K02 0 trafień w bazie, logach, zdarzeniach | **jest** | K02, B02: 4 sztuczne klucze (też base64): 0 trafień w całej piaskownicy (baza, logi, dumpy) |
| K03 klucz tylko w środowisku procesu | **jest** | K03: proces CLI po zapisie: `key set=yes tail=abcd argvHasKey=false`; `process.env` programu bez `OPENAI_API_KEY` |
| K04 usunięcie kasuje, następny start bez zmiennej, błędy maskują | **jest** | K04: „Remove key" → „No key saved", 0 trafień; nowy proces `key set=no`; odrzucony klucz nie pokazany na stronie |
| (BE3) „check" tylko po kliknięciu, adres stały | **jest** | K04: 0 zapytań przed kliknięciem; po kliknięciu 1 zapytanie, adres tylko `https://api.openai.com/v1/models` (w głównym procesie przekierowany na atrapę), „accepted"; klucz od „bad-" → „rejected" |
| E01 lista modeli, stan, ostrzeżenie, tylko http/https | **jest** | E01: zapis = 0 zapytań; „Check connection" = 1 GET `/v1/models` bez klucza, „Reachable", 2 modele; 192.168.1.77 → „another computer … not encrypted"; `ftp://` i http do publicznego hosta odrzucone |
| E02 agent rozmawia przez punkt, „tylko rozmowa" | **jest** | E03: odpowiedź przez POST `/v1/chat/completions` (stream, Bearer, model `llama3:8b`), model „… (Local LLM, chat only)", agent poinformowany, że nie ma narzędzi |
| E03 klucz punktu jak K01–K04 | **jest** | E02: brak klucza → „Key refused" (asks for a key); zły → „did not accept"; dobry → „Reachable", tylko „Key ••••abcd"; 0 trafień klucza w profilu |
| E04 wykrywanie lokalne tylko 11434 i 1234, pusto bez błędu | **jest** | E04: nic nie nasłuchuje → „Nothing found…" bez błędu; atrapa na 11434 → „Found: Ollama." z 2 modelami po jednym GET bez klucza; 1234 cisza |
| E05 gotowe ustawienia ACP | **brak** | nie zrobione (K2: spec mówi „brak w źródłach") |
| E06 usunięcie punktu: modele znikają, czytelny błąd | **jest** | E06: modele zniknęły z wyboru, 0 trafień klucza, „The endpoint of this model was removed…", wiersz bez „Thinking" |
| F01 do 8 modeli, dziewiąty odrzucony | **jest** | F01: 8 zapisane w kolejności, dziewiąty i powtórka odrzucone z komunikatem, zapisana lista bez zmian (przez IPC; ekran listy sprawdzają testy komponentu UI4, nie to uruchomienie) |
| F02 przejście przed pierwszą akcją przy limicie i błędzie sieci | **częściowo** | limit: P06, P09. **Błąd sieci (zapasowy model przy braku serwera):** niesprawdzone w oknie |
| F03 powrót na pierwotny model po resecie | **częściowo** | P09: po resecie wrócił na Work i własny model. `FallbackPolicy.returnAfterReset` jako ustawienie nie istnieje (BE4 je pominął) |
| F04 przełączenie w obrębie jednego dostawcy | **brak** | niesprawdzone; BE4: limit dostawcy blokuje wszystkie jego modele, więc to nie jest obejście limitu |
| lista ogólna `*`, „inherited", reset | **jest** | F02: agent bez własnej listy: `own: null`, `effective + unavailable = 8`; własna z 2 wygrywa; reset wraca do ogólnej (trzy wpisy `acp:` bez agenta liczone jako unavailable) |
| B02 skan sekretów | **jest dla tego uruchomienia** | B02 (zob. K02) |
| B03 `check` / `check:ui` / `sandbox:e2e` zielone | **częściowo** | `sandbox:e2e` 30/0/0, lint, `typecheck:node` i `typecheck:renderer` zielone; pełnego `bun run check` nie uruchamiałem (to Twoje) |

## Liczby

| Co | Wynik |
|---|---|
| `bun run build` na scalonym kodzie | zielony |
| `sandbox:e2e` (końcowy build, `kk-w5-t4-e2e2`) | **30 ok, 0 FAIL, 0 findings** (pierwszy przebieg na tym samym kodzie przed poprawką: 30/0/0) |
| Nowe kroki W5 (`COSGRAL_MODE=w5`, czysta piaskownica `kk-w5-t4-run4`) | **24 ok, 0 FAIL, 0 błędów konsoli** |
| Wcześniejsze przebiegi nowych kroków | run2: 22 ok, 2 FAIL (P06: źle liczone zdarzenie; P07: usterka 1); run3: 22 ok, 2 FAIL (asercja P07 liczyła `returned` jako ciche przełączenie, P08 jako skutek uboczny). Poprawki w skrypcie, nie w programie (poza usterką 1) |
| Testy jednostkowe po poprawce K1 | `agent-service-accounts` 12/12 (+ asercja kolejności karty), `agent-service-fallback-accounts` 8/8 |
| `bun run lint` (773 pliki), `typecheck:node`, `typecheck:renderer` | zielone |

## Co dodałem do skryptów

- `scripts/acceptance-codex.cjs`: atrapa CLI logowana (`login`, `login status`, `logout` ze znacznikiem tylko w folderze konta, który czyta tylko atrapa), polecenia `WHO`, `ENVKEY`, `ACC <znacznik>` (limit zależny od konta z pliku limitów, opcjonalnie po poleceniu), log startów procesów.
- `scripts/sandbox-acceptance.ts`: tryb `COSGRAL_MODE=w5` (kroki W0, P01–P11, E01–E06, K01–K04, F01–F02, B02), serwer modeli i serwer sprawdzania klucza na loopbacku, przekierowanie stałego adresu dostawcy w głównym procesie (`fetch`) na atrapę, limit czasu i zapis stosu zawieszonej strony. Powtórki pojedynczych kroków: `COSGRAL_ONLY=P07 … --keep`.
- Zrzuty i drzewa dostępności są poza repozytorium (`Shared\cosgral-sandbox\kk-w5-t4-*`), bo zawierają nazwę konta.

## Czego nie sprawdziłem

1. Prawdziwe konta i CLI (atrapa CLI), prawdziwy Ollama/LM Studio (atrapa na porcie 11434), prawdziwe `safeStorage` (Electron w piaskownicy używa prawdziwego szyfrowania systemu, ale na koncie piaskownicy), prawdziwe sprawdzenie klucza u OpenAI/Anthropic (adres jest przekierowany na atrapę).
2. Bezczynny proces konta zatrzymany po 5 min; odmowa metod `apiKeys`, `subscriptions`, `endpoints` dla serwera zdalnego i telefonu (C13); błąd sieci jako powód modelu zapasowego (F02); F04.
3. Ekranu listy modeli zapasowych (UI4) i storybooków punktów końcowych w oknie (sprawdzają je ich testy).
4. Pełny `bun run check` (Storybook, wizualne, API, build instalatora).
5. Usterka 4 (jednorazowe zawieszenie) nie odtworzona.

## Commity (gałąź `team/kk/w5-t4`)

Kroki W5 i atrapa, poprawki po przebiegach, naprawa karty K1 z testem, raport. Trailer `Co-authored-by: OpenBot`, bez push i bez `--force`.
