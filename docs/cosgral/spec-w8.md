# Spec W8: kryteria odbioru (poziomy dostępu, piaskownica Windows, profile przeglądarki, przestrzenie klientów, budżety)

**Stan: 16.11.2026, integracja `codex/cosgral-desktop` @ `6e0b7d3e4`. Autor: Tester (W8-T1), tylko dokument / grep, bez uruchamiania programu.**

Opis zachowania i kryteria odbioru. Podstawa dla Backend (W8-BE1…), KAPI (W8-K1/K2) i UI. Fala: `PLAN-W4.md` — W8 = poziomy dostępu, piaskownica Windows, profile przeglądarki, przestrzenie klientów, budżety. Bramka **G5** (`luki-070.txt`): test ucieczki z piaskownicy **i** test izolacji klientów przechodzą.

## Na górze

- **Sytuacji: 32** (sekcja 1). **Kryteriów: W8-01 … W8-38.**
- **Wymaga właściciela: W8-33 … W8-38** (UAC / prawdziwa izolacja OS, konta klientów, Meta Ads / proxy, akceptacja G5).
- **Zasada bezpieczeństwa (obowiązkowa):** domyślnie **najmniejsze uprawnienia**; każde podniesienie tylko przez **kartę zgody** w Needs you / Decyzja; **bez obejść** (agent, MCP, CLI, skrypt ani ustawienie „ciche” nie pomija karty).
- **Rozróżnienie nazw:** „piaskownica” w testach zespołu = osobny `USERPROFILE` do odbioru COSGRAL. **Piaskownica W8** = izolacja procesów CLI / ACP / MCP agenta na Windows. To **nie** jest to samo.

**Źródła:** `luki` (tabela luk + zadania W8-BE1…BE4, K1, K2); `PLAN-W4`; `DECYZJE-WLASCICIELA.md` (granice: bez czytania logowań, Delete my data, agenci nie logują się sami); `parytet` wiersz 21 (brak poziomów / folderów±); grep kontraktów COSGRAL. **„do ustalenia”** / **„propozycja T1”** / **„niezweryfikowane”**.

**Clean room:** własne słowa. Bez kopiowania tekstów 0.68/0.70. Bez kodu OpenBota nowszego niż `a6fe240`. Zachowanie dokładne OpenBot 0.70 dla piaskownicy / poziomów = **niezweryfikowane** (w lukach jest skrót: piaskownica „tylko macOS” po stronie 0.70; szczegóły mechanizmu nieopisane).

**Poza rdzeniem T1, ale w tej samej fali luk:** W8-BE4 Vault (dostęp per agent, CSV, 1Password/Bitwarden) — krótko w §1F i pytaniach; pełny kontrakt później.

---

## 0. Co już jest w kodzie COSGRAL vs czego brak (grep, bez uruchamiania)

| Obszar W8 | Jest dziś | Brak / luka |
|---|---|---|
| Poziomy dostępu (3 tryby) | Karty zgody `command` / `file-change` / `permissions` + reguły „Always allow”; `workspacePath` agenta; wyłączniki **grup narzędzi** | Brak modelu „tylko folder roboczy / pytaj najpierw / pełny”; brak listy folderów dodatkowych i wykluczonych w ustawieniach agenta (parytet 21) |
| Piaskownica procesów | Odbiór w osobnym profilu Windows (testy); **nie** izoluje prawdziwych CLI (raporty KK G2) | Brak AppContainer / Job Object / konta ograniczonego dla CLI·ACP·MCP; brak testu „ucieczki” |
| Profile przeglądarki | `ipc-browser.ts`: karty, ~13 akcji, owner bot/thread, przejęcie | Brak `BrowserProfile` (cookies, proxy) per klient; brak akcji upload/select/dialogi/czekanie (luki) |
| Przestrzenie klientów | Szyna „Local server” / join team (częściowo wiersz 1); foldery UI agentów | Brak przestrzeni klienta z osobnym Vault + MCP + profil przeglądarki + agenci + przełącznik izolujący dane A↔B |
| Budżety / koszt | Strona Usage / limity kont dostawcy; „budget” w kanałach = **licznik przydziałów**, nie pieniądze | Brak twardego stopu $ per agent/klient; brak routera „tanie modele”; brak raportu CSV kosztu |
| Vault W8-BE4 | Vault lokalny + fill_login w oknie (częściowo wiersz 26) | Brak dostępu per agent, import CSV, konektorów 1Password/Bitwarden |

---

## 1. Zachowanie do dostarczenia

### 1A. Poziomy dostępu (W8-BE1)

Trzy poziomy (nazwy robocze; copy UI po EN do W7 i18n): **working-folder** (tylko folder roboczy), **ask-first** (pytaj przed wyjściem / wrażliwą akcją), **full** (szeroki dostęp po jednorazowym / trwałym podniesieniu przez kartę).

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 1 | Tworzy / ustawia agenta; nie wybiera poziomu. | Domyślnie **working-folder** (najmniejsze uprawnienia). | Startować nowego agenta w `full` bez karty. | luki W8-BE1; zasada T1 |
| 2 | Agent w `working-folder` próbuje zapisać / skasować poza folderem roboczym. | Odmowa; czytelny błąd w UI; **brak** cichego sukcesu. | Zapisać poza folderem „bo CLI i tak może”. | luki („nie zapisze nic poza nim”) |
| 3 | Agent w `ask-first` chce wyjść poza dozwolone foldery albo podnieść uprawnienie. | Karta zgody w Needs you; tura czeka. Allow / Always / Deny jak dziś przy approvals. | Kontynuować po Deny; Always bez wskazania zakresu. | luki; istniejące `ipc-approval-rules`; zasada T1 |
| 4 | Użytkownik podnosi poziom do `full` (albo zatwierdza kartę „pełny dostęp”). | Dopiero wtedy szersze ścieżki / narzędzia; fakt podniesienia widać w ustawieniach agenta. | Ukryte `full` w profilu bez UI. | propozycja T1 |
| 5 | Dodaje foldery **dodatkowe** i **wykluczone**. | Dodatkowe = wolno w trybie working/ask zgodnie z regułami; wykluczone zawsze zabronione, także w `full` (**propozycja T1** — do potwierdzenia). | Wykluczenie tylko „kosmetyczne”. | luki W8-BE1 |
| 6 | Restart programu. | Poziom, foldery ± i reguły Always wracają z dysku. | Reset do `full` po restarcie. | propozycja T1 |

### 1B. Piaskownica Windows dla procesów (W8-BE2)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 7 | Agent uruchamia CLI / ACP / MCP. | Proces startuje w **izolacji W8** (mechanizm: **do ustalenia** — luki: „konto o ograniczonych uprawnieniach albo AppContainer z Job”). Widzi tylko dozwolone ścieżki poziomu dostępu. | Startować niesandboxowany proces „dla wygody”, gdy izolacja jest włączona. | luki W8-BE2 |
| 8 | Proces próbuje wyjść poza dozwolony folder / zapisać w profilu użytkownika poza grantem. | Blokada na poziomie OS lub wrappera; zdarzenie / log diagnostyczny bez sekretów. | Uznawać sam osobny `USERPROFILE` testowy za spełnienie W8-BE2. | luki („próba wyjścia… blokowana”); raporty G2 |
| 9 | Izolacja niedostępna na tej edycji Windows. | Stan `unavailable` z powodem; agent nie dostaje cichego „pełnego” dostępu do dysku. Domyślnie **odmowa startu** narzędzi plikowych poza working-folder **albo** tryb zdegradowany — **do ustalenia** (propozycja T1: odmowa startu CLI z narzędziami dyskowymi + karta „włącz funkcję OS / użyj maszyny z izolacją”). | Udawać, że AppContainer działa. | propozycja T1; niezweryfikowane: czy ta maszyna ma Windows Sandbox / AppContainer |
| 10 | Test ucieczki (bramka G5). | Skrypt / krok próbuje wyjść poza grant; musi paść. | Zielony G5 bez próby ucieczki. | luki G5 |
| 11 | UAC / instalacja funkcji izolacji. | Program **nie** omija UAC; jeśli trzeba włączyć funkcję Windows — instrukcja dla właściciela. | Wyłączać zabezpieczenia systemu „żeby poszło”. | DECYZJE / luki granice; zasada T1 |

### 1C. Profile przeglądarki per klient (W8-BE3)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 12 | Tworzy profil przeglądarki (nazwa, opcjonalnie proxy). | Osobny magazyn cookies / storage; przypisany do przestrzeni klienta (gdy jest) lub ręcznie do agenta. | Współdzielić cookies między profilami. | luki W8-BE3 |
| 13 | Dwa konta tej samej usługi (np. dwa Meta Ads) w dwóch profilach. | Sesje się **nie mieszają**; agent A na profilu 1 nie widzi zalogowania profilu 2. | Jeden wspólny partition Electron „dla wszystkich”. | luki (kryterium gotowości) |
| 14 | Agent używa brakujących dziś akcji (upload, select, czekanie, dialogi) — zakres BE3. | Po implementacji: akcje działają w profilu; dialogi wrażliwe → przejęcie / karta gdy trzeba człowieka. | Wykonywać upload hasła z Vault bez reguł Vault. | luki W8-BE3; Vault |
| 15 | Logowanie w przeglądarce agenta. | Jak dziś: przejęcie dla CAPTCHA/login; **agenci nie czytają plików logowania** ani nie wpisują haseł właściciela poza Vault fill. | Czytać `%USERPROFILE%\.codex` / pliki auth. | DECYZJE; kanał |

### 1D. Przestrzenie klientów (W8-K1)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 16 | Tworzy przestrzeń klienta (np. „Klient A”). | Osobny kontener: agenci, foldery robocze, **Vault**, **profil(e) przeglądarki**, **MCP**, pamięć/kanały przypisane do przestrzeni — **dokładny zestaw do ustalenia** (minimum z luk: Vault, profil, MCP, foldery, agenci). | Trzymać sekrety klienta A w globalnym Vault bez etykiety przestrzeni. | luki W8-K1 |
| 17 | Przełącza przestrzeń w szynie. | Widok i API pokazują tylko dane tej przestrzeni; skrót w szynie (obok serwerów — **do ustalenia**). | Wyciek listy agentów / sekretów B przy aktywnym A. | luki („niewidoczne w przestrzeni klienta B”) |
| 18 | Test izolacji (G5). | Operacje odczytu / list / Vault / plików z B przy A = odmowa lub pusto. | „Izolacja tylko w UI” przy wspólnym backendzie. | luki G5 |
| 19 | Usuwa przestrzeń. | Potwierdzenie; zakres kasowania (dane vs tylko odpięcie) — **do ustalenia**. | Kasować `%APPDATA%\OpenBot`. | DECYZJE Delete my data; propozycja T1 |

### 1E. Budżety i koszt (W8-K2)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 20 | Ustawia budżet (kwota / okres) per agent i/lub per przestrzeń klienta. | Licznik zużycia (tokeny / $ szacunek — **jednostka do ustalenia**) widoczny w Usage / przestrzeni. | Zmyślać koszt, gdy dostawca nie podaje. | luki W8-K2; analogia W6 kontekst |
| 21 | Zużycie dochodzi do limitu. | **Twardy stop**: nowe ture płatne nie startują; czytelny stan / karta; bez cichego dalszego spendu. | Kontynuować „jeszcze jedną turę”. | luki („twardy stop”) |
| 22 | Router subskrypcji: proste zadania → tańszy model. | Gdy włączone: wybór modelu uwzględnia budżet / politykę „cheap first” **bez** łamania list zapasowych W5 — **kolejność względem fallback do ustalenia**. | Omijać limit konta / zgodę na model. | luki W8-K2; W5 |
| 23 | Eksportuje raport CSV. | Plik z kosztem / zużyciem per agent/klient w zakresie dat; bez sekretów i bez ścieżek z nazwą profilu w repo. | Wrziucać CSV z PII do publicznego repo. | luki; zasada repo |
| 24 | Brak cen od dostawcy. | Stan „koszt niedostępny”; budżet może liczyć **tylko tokeny** albo być wyłączony — **do ustalenia**. | Udawać USD. | propozycja T1 |

### 1F. Vault w fali W8 (W8-BE4, skrót)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 25 | Ogranicza element Vault do wybranych agentów / przestrzeni. | Inny agent dostaje odmowę / prośbę vault-request, nie wartość. | Wyciek sekretu w czacie. | luki W8-BE4; Vault dziś |
| 26 | Import CSV / konektor 1Password lub Bitwarden. | Po zgodzie; sekrety tylko w magazynie szyfrowanym. | Logować sekrety. | luki W8-BE4 |
| 27 | (Granica zespołu, nie produkt) Pełna swoboda agentów OpenBot na PC roboczym. | Dotyczy **wydzielonego profilu** deweloperskiego (luki s.24); **nie** oznacza `full` domyślnie w produkcie COSGRAL dla agentów użytkownika. | Mylić swobodę team-agentów z poziomami W8 w aplikacji. | luki „Pełna swoboda…”; zasada T1 |

### 1G. Zgody i brak obejść (przekrój)

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 28 | Agent / MCP / skrypt próbuje podnieść uprawnienie bez UI. | Odmowa; jedyna ścieżka = karta zgody. | Flaga środowiskowa `COSGRAL_ALLOW_ALL=1` w releasie. | zasada T1 |
| 29 | Użytkownik odmawia karty. | Stan jak dziś przy Deny; brak retry w pętli bez nowej karty. | Busy-loop kart. | istniejące approvals |
| 30 | Płatność / wysyłka na zewnątrz / kasowanie poza grantem. | Zawsze pytanie (luki granice + OpenBot teammate rules). | Auto-pay. | luki; DECYZJE |
| 31 | Computer Use. | Osobna zgoda (już granty); nie włącza się sama przez `full` dysku — **propozycja T1**: CU wymaga własnej karty. | Jedna zgoda „na wszystko”. | ipc-computer-use; remote-desktop nota |
| 32 | Restart po Deny. | Deny nie zamienia się w Allow. | Persist Deny jako Allow. | propozycja T1 |

---

## 2. Kryteria odbioru

**Skróty:** **J** = jednostkowe; **E** = okno / acceptance; **R** = właściciel / maszyna z izolacją.

### 2A. Poziomy dostępu (W8-01 … W8-08)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W8-01 | Nowy agent = `working-folder` domyślnie (wiersz 1). | J + E | BE1, UI |
| W8-02 | Zapis poza folderem roboczym w tym trybie = odmowa (wiersz 2). | J + E | BE1 |
| W8-03 | `ask-first`: wyjście poza grant → karta; Deny zatrzymuje (wiersz 3). | E | BE1, UI |
| W8-04 | Podniesienie do `full` tylko przez UI/kartę; widać w ustawieniach (wiersz 4). | E | BE1, UI |
| W8-05 | Foldery dodatkowe działają; wykluczone blokują także przy `full` (po decyzji Q) (wiersz 5). | J + E | BE1 |
| W8-06 | Stan przeżywa restart (wiersz 6). | E | BE1 |
| W8-07 | Reguły Always allow nie obchodzą wykluczonych folderów (wiersz 5+28). | J | BE1 |
| W8-08 | Grupy narzędzi wyłączone nadal odmawiają wywołań (regresja W3). | J | BE1 |

### 2B. Piaskownica Windows (W8-09 … W8-14)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W8-09 | CLI/ACP/MCP startują w izolacji, gdy dostępna (wiersz 7). | J + E | BE2 |
| W8-10 | Próba zapisu poza grantem z procesu = blokada (wiersz 8). | J (ucieczka) | BE2 / Hydra |
| W8-11 | Brak izolacji OS → `unavailable` / odmowa zdegradowana, nie cichy full disk (wiersz 9). | J + E | BE2 |
| W8-12 | Test ucieczki G5 zielony na maszynie z izolacją (wiersz 10). | R + E | właściciel + Tester |
| W8-13 | Brak obejścia UAC przez program (wiersz 11). | R | właściciel |
| W8-14 | Prawdziwy CLI w izolacji nie czyta cudzego folderu konta poza grantem. | R | właściciel |

### 2C. Profile przeglądarki (W8-15 … W8-19)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W8-15 | Dwa profile = dwie sesje bez mieszania cookies (wiersz 12–13). | E | BE3 |
| W8-16 | Proxy per profil działa lub czytelny błąd (wiersz 12). | E | BE3 |
| W8-17 | Nowe akcje z zakresu BE3 mają test / krok (wiersz 14). | J / E | BE3, UI |
| W8-18 | Przejęcie przy logowaniu; brak czytania plików auth (wiersz 15). | E | BE3 |
| W8-19 | Kryterium luk: dwa konta Meta Ads na dwóch profilach (wymaga właściciela) (wiersz 13). | R | właściciel |

### 2D. Przestrzenie klientów (W8-20 … W8-24)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W8-20 | Tworzenie przestrzeni z izolowanym zestawem danych (wiersz 16). | E | K1 |
| W8-21 | Przełączenie szyny: dane B niewidoczne w A (wiersz 17). | E | K1, UI |
| W8-22 | Test izolacji G5 (API + UI) (wiersz 18). | J + E | K1 / Tester |
| W8-23 | Vault przestrzeni A niedostępny w B (wiersz 16–18). | E | K1 |
| W8-24 | Usunięcie przestrzeni z potwierdzeniem (wiersz 19). | E | K1, UI |

### 2E. Budżety (W8-25 … W8-29)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W8-25 | Budżet per agent i per klient zapisuje się (wiersz 20). | E | K2, UI |
| W8-26 | Po limicie twardy stop nowych tur płatnych (wiersz 21). | J + E | K2 |
| W8-27 | Router „tańszy model” nie łamie zgód / limitów kont (wiersz 22). | J | K2 |
| W8-28 | CSV bez sekretów (wiersz 23). | J | K2 |
| W8-29 | Brak cen → nie zmyślać USD (wiersz 24). | J | K2 |

### 2F. Zgody / Vault skrót (W8-30 … W8-32)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W8-30 | Brak ścieżki podniesienia uprawnień bez karty (wiersz 28). | J | BE1/BE2 |
| W8-31 | Computer Use ≠ automatycznie włączone przez `full` (wiersz 31). | E | BE / UI |
| W8-32 | Vault per agent / import — gdy BE4 w scope fali (wiersze 25–26). | E | BE4 |

### 2G. Bramka G5 — właściciel (W8-33 … W8-38)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W8-33 | Maszyna z działającą izolacją OS (lub świadoma decyzja o zdegradowanym trybie). | R | właściciel |
| W8-34 | Test ucieczki z piaskownicy przechodzi. | R | właściciel + Tester |
| W8-35 | Test izolacji dwóch przestrzeni / klientów przechodzi. | R | właściciel + Tester |
| W8-36 | UAC / włączenie funkcji Windows — tylko właściciel. | R | właściciel |
| W8-37 | Konta klientów / Meta Ads do profili przeglądarki — tylko właściciel (agenci nie logują). | R | właściciel |
| W8-38 | Akceptacja bramki G5. | R | właściciel |

---

## 3. Co wymaga właściciela

1. **W8-33…38** — izolacja OS, UAC, G5, konta reklamowe / klienckie.
2. Potwierdzenie, czy na komputerze roboczym ma być włączony Windows Sandbox / inne mechanizmy (**nie sprawdzane w T1**).
3. Budżety realne ($ i limity kluczy) — kto płaci: nadal otwarte w `DECYZJE-WLASCICIELA` (część wiersza 5).
4. Ewentualne „pełny dostęp” dla team-agentów na PC roboczym ≠ domyślny poziom w produkcie (wiersz 27).

---

## 4. Pytania otwarte do lidera (max 12, z rekomendacją)

| # | Pytanie | Rekomendacja T1 |
|---|---|---|
| Q1 | Mechanizm izolacji: AppContainer+Job vs osobne konto Windows vs Windows Sandbox VM? | **AppContainer + Job** dla procesów potomnych, jeśli dostępne; inaczej ograniczone konto; Sandbox VM tylko jako opcja ciężka / lab. |
| Q2 | Gdy izolacja OS niedostępna? | **Odmowa** startu narzędzi dyskowych + karta z powodem; nie cichy full. |
| Q3 | Czy wykluczone foldery obowiązują także w `full`? | **Tak.** |
| Q4 | Czy `full` obejmuje Computer Use i kamerę? | **Nie** — osobne zgody (CU / media). |
| Q5 | Przestrzeń klienta: czy „Local server” / team z wiersza 1 to to samo? | **Nie na start** — przestrzeń klienta = izolacja danych agencji; serwer/team = osobny tor (W3/W9). Przełącznik w szynie, ale osobny obiekt. |
| Q6 | Budżet w $ czy tylko tokeny? | Tokeny + opcjonalny $ gdy dostawca podaje; inaczej „koszt niedostępny”. |
| Q7 | Router tani model vs listy zapasowe W5? | Najpierw polityka budżetu wybiera **preferowany** model; potem W5 (konta → fallback). Opisać w kontrakcie. |
| Q8 | W8-BE4 (Vault konektory) w tej samej bramce G5? | G5 = piaskownica + izolacja klientów; Vault BE4 może domykać się tuż po, bez blokowania G5. |
| Q9 | Domyślny poziom dla agentów zaimportowanych ze szablonu? | `working-folder`. |
| Q10 | Czy MCP w przestrzeni klienta jest osobną listą serwerów? | **Tak** — lista per przestrzeń (lub globalna + allowlist per przestrzeń); propozycja: allowlist per przestrzeń na globalnych serwerach. |
| Q11 | Paperclip: budżety / cele — czy K2 ma inspirować UX „budżet klienta”? | Tak na **funkcję** (licznik, stop, CSV), nie na wygląd tablicy Paperclip (decyzja W7 Q11). |
| Q12 | Testy G5: kto utrzymuje skrypt ucieczki? | Backend BE2 + Tester w acceptance; właściciel na maszynie z izolacją. |

---

## 5. Czego nie wiadomo (uczciwa lista)

1. **Dokładne zachowanie OpenBot 0.70** dla trzech poziomów dostępu i piaskownicy (luki: „piaskownica tylko macOS”) — **niezweryfikowane**; nie zgaduję API ani nazw trybów 0.70.
2. Czy **ten** Windows 10 (build z user_info) ma włączalny **Windows Sandbox**, **AppContainer** dla Electron child, albo polityki firmowe blokujące Job Objects — **nie sprawdzane w T1**.
3. Jak Codex/Claude CLI zachowują się pod AppContainer (czy w ogóle wstają) — **niezweryfikowane**.
4. Jednostka rozliczeniowa kosztów API (USD vs tokeny vs „credits”) per dostawca — brak w źródłach.
5. Czy przestrzeń klienta współdzieli jedną bazę SQLite z row-level filter czy osobne pliki DB — decyzja implementacji Backendu.
6. Pełna lista brakujących akcji przeglądarki poza skrótem w lukach — bez REA 0.70.
7. Nie uruchamiałem Electrona, UAC ani testu ucieczki.

---

## 6. Mapowanie na zadania z luk

| ID | Zakres |
|---|---|
| W8-BE1 | §1A, W8-01…08 |
| W8-BE2 | §1B, W8-09…14, G5 ucieczka |
| W8-BE3 | §1C, W8-15…19 |
| W8-K1 | §1D, W8-20…24, G5 izolacja |
| W8-K2 | §1E, W8-25…29 |
| W8-BE4 | §1F skrót, W8-32; Q8 |
| W8-T1 (ten plik) | spec wejściowy, nie raport G5 |

---

## Commity

Zobacz SHA w wyniku kanału na `team/tester/w8-spec`.
