# Spec W7: kryteria odbioru (motyw, język PL/EN, ustawienia, kierunek wyglądu)

**Stan: 16.11.2026, integracja `codex/cosgral-desktop` @ `ff0801992`. Autor: Tester (W7-T1), tylko dokument, bez kodu i bez uruchamiania programu.**

Opis zachowania „co program ma robić” i tabela kryteriów. Podstawa dla UI (W7-UI1…) i współdzielonej pracy KK (katalog PL). Kolejność fal: `PLAN-W4.md` (W7 = motyw jasny, polski, ustawienia w jednym oknie, kierunek OpenBot + Grok Bot, nie Paperclip). Bramka G4 w `luki-070.txt`: właściciele akceptują wygląd.

## Na górze

- **Sytuacji:** 5 grup, **34** wiersze (sekcja 1).
- **Kryteriów: W7-01 … W7-36.** **Wymaga właściciela: W7-33 … W7-36** (ocena wyglądu / bramka G4).
- **Dziś w COSGRAL (sprawdzone w repo, bez uruchamiania):**
  - Motyw: **jeden ciemny** w aplikacji; tokeny `--openbot-*` w CSS; jasne wartości tylko w Storybook `theme-frame.tsx` („app itself ships one dark theme”).
  - Język: kontrakt `AppSettings.language`: `en` | `pl` (`APP_LANGUAGES`); wybór Polski **zapisuje się**, napisy UI **nie** przełączają się (parytet wiersz 39/40; odbiór W3).
  - Ustawienia: `SETTINGS_TABS` = general, agents, notifications, voice, computer-use, profile, mobile, dock, island, updates, hosts, transfer; UI to głównie lista / modal, nie pełne zakładki jak 0.70; osobne strony szyny: Providers, Usage, Library, …
  - Wygląd: własne logo C / ikony COSGRAL (decyzja kanału 12.11); bez grafik 0.68; kierunek OpenBot + Grok Bot, Paperclip tylko na pomysły funkcji.
- **Inwentarz napisów na sztywno (grep `src/renderer`, 16.11):** sekcja 5.

**Źródła w kolumnie:** `luki` = `luki-070.txt`; `PLAN-W4`; `parytet` = wiersze 39–40 (+ 2); `zlecenie T1`; **„do ustalenia”**; **„propozycja T1”**.

**Clean room:** własne słowa. Bez kopiowania tekstów 0.68/0.70. Bez czytania kodu OpenBota nowszego niż `a6fe240`. Przegląd **naszego** `src/renderer` jest dozwolony (inwentarz / stan COSGRAL).

**Poza minimalnym T1 (są w lukach W7-UI4 / UI5–UI8):** skala UI 67–200 %, kolor czatu, pełny zestaw animacji z „ograniczonym ruchem”, zadania W7-UI5…UI8 z sekcji kierunku wyglądu — wymienione w pytaniach / mapowaniu.

---

## 1. Zachowanie do dostarczenia

### 1A. Motyw jasny / ciemny / systemowy

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 1 | Wybiera motyw **ciemny**, **jasny** albo **systemowy** (śledzi motyw OS). | Cały UI (szyna, lista, czat, karty, strony, ustawienia, onboarding) przełącza się na zestaw tokenów `--openbot-*` dla tego motywu. Wybór zapisuje się i wraca po restarcie. | Zostawić „wyspy” starego motywu (np. karta jasna na ciemnym tle bez sensu). | luki W7-UI1; tabela luk „jasny, ciemny i systemowy”; zlecenie T1 |
| 2 | Ma motyw systemowy; zmienia motyw Windows. | Aplikacja podąża bez ręcznego restartu (**propozycja T1**; dokładny hook: do ustalenia). | Wymagać restartu programu przy zmianie OS, jeśli wybrano „systemowy”. | propozycja T1 |
| 3 | Przegląda ekrany w jasnym i ciemnym. | Tekst / ikony / obramowania spełniają **kontrast AA** na naszych tokenach (jak w zadaniach W7-UI1: bez błędów kontrastu). Storybook light preview nie zastępuje motywu w aplikacji. | Uznawać sam `ThemeFrame` Storybook za „motyw w produkcie”. | luki W7-UI1; stan `theme-frame.tsx` |
| 4 | Otwiera karty Needs you / Decyzja / limitu / błędu w obu motywach. | Karty czytelne, przyciski z kontrastem (już jest świadomość w CSS przy danger). | Biały tekst na jasnym tle / odwrotnie. | zlecenie T1; propozycja T1 |
| 5 | Patrzy na okna Electron poza rendererem głównym (dok, wyspa, osobne okno rozmowy z W6). | Te powierzchnie używają **tych samych** tokenów motywu (**propozycja T1**). | Osobna „paleta doku” bez tokenów. | zlecenie T1; propozycja T1 |
| 6 | Patrzy na ikonę aplikacji / tray (jeśli jest). | Ikona COSGRAL (własna), czytelna na jasnym i ciemnym pasku zadań — **warianty do ustalenia** (propozycja T1: jedna ikona z odpowiednim kontrastem albo light/dark asset). | Ikony / maskotki z paczki OpenBot 0.68. | luki („nie kopiować grafik”); decyzja kanału logo C |
| 7 | Włącza „ogranicz ruch” w systemie / w ustawieniach (W7-UI4). | Animacje skracają się lub znikają; stany agenta nadal czytelne bez ruchu (**szczegóły W7-UI4**, poza rdzeniem T1). | Ukryć stan „pracuje / czeka” tylko dlatego, że wyłączono animację. | luki W7-UI4; propozycja T1 |

### 1B. Język PL / EN

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 8 | Wybiera **Polski** albo **English** (onboarding albo ustawienia). | Cały **interfejs** (menu, przyciski, etykiety, pusta stan, błędy UI, szyna stron, ustawienia) przełącza się na ten język **bez restartu** (luki W7-UI2). Zapis w `AppSettings.language`. | Zostawić mieszankę PL+EN w jednym widoku (np. „Pokaż ukryte” obok „Needs you” przy wybranym PL). | luki W7-UI2; parytet 39–40; zlecenie T1 |
| 9 | Napisy pochodzą z **jednego katalogu** kluczy (PL i EN). | Brak klucza = widać w teście CI (luki: 0 brakujących); w runtime: **do ustalenia** (propozycja T1: klucz techniczny albo EN fallback + log, nie milcząca dziura). | Wpisywać nowe napisy UI na sztywno w JSX poza katalogiem. | luki W7-UI2 |
| 10 | Patrzy na daty i liczby. | Format zgodny z wybranym językiem / locale (`pl-PL` / `en-…`) — **biblioteka do ustalenia**. | Zostawić zawsze format US przy PL. | zlecenie T1; propozycja T1 |
| 11 | Czyta wiadomości **agenta** / treść z modelu / nazwy skilli użytkownika. | Zostają w języku, w jakim przyszły; program **nie** tłumaczy ich automatycznie. | Maszynowo tłumaczyć treść rozmowy przy zmianie języka UI. | zlecenie T1 |
| 12 | Ma dziś PL wpisane na sztywno w części ekranów, a reszta EN; wybiera EN. | Po W7 te miejsca też idą z katalogu — znikają „wyspy” PL przy EN i odwrotnie. | Naprawiać tylko Settings, a Sidebar zostawić po polsku. | inwentarz §5; parytet |
| 13 | 0.70 ma ~15 języków; W7 robi PL/EN. | W7 = **tylko PL i EN**. Kolejne języki: później / do ustalenia (nie blokują G4). | Obiecywać 15 języków w W7. | luki (15 jęz. w 0.70); PLAN-W4 „polski”; propozycja T1 |

### 1C. Ustawienia w jednym oknie

| Nr | Użytkownik robi | Program robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 14 | Otwiera Ustawienia. | Jedno okno / modal z **zakładkami** (nie długa lista sekcji bez nawigacji). Wyszukiwarka ustawień: w lukach W7-UI3 — **w zakresie W7** (propozycja T1: tak, w tym samym oknie). | Zostawić tylko scroll „jeden formularz pod drugim” jako docelowy UX (luki: „czego nie robić”). | luki W7-UI3; zlecenie T1 |
| 15 | Widzi zakładki wg zlecenia T1: **Ogólne, Dostawcy, Powiadomienia, Wygląd, Dane i prywatność, Zaawansowane**. | Każda zakładka ma jedną rolę. Mapowanie na obecne `SETTINGS_TABS` / strony: **do ustalenia** (tabela propozycji poniżej). | Duplikować tę samą kontrolkę w trzech miejscach bez linku. | zlecenie T1; luki W7-UI3 (inna lista) |
| 16 | Otwiera **Dostawcy** z ustawień. | Trafia do zarządzania dostawcami / kontami / kluczami (dziś strona Providers na szynie). Czy Providers znika z szyny: **do ustalenia** (propozycja T1: szyna może mieć skrót, ale kanoniczne miejsce = zakładka). | Dwa sprzeczne ekrany ustawień konta. | propozycja T1 |
| 17 | Otwiera **Wygląd**. | Motyw, (później) skala / ruch / kolor czatu. | Chować motyw tylko w ukrytym menu. | zlecenie T1 |
| 18 | Otwiera **Dane i prywatność**. | Eksport / usuwanie danych / Vault status / „usuń moje dane” — **zakres pól do ustalenia**. | Ukryć destrukcyjne akcje bez potwierdzenia. | zlecenie T1; propozycja T1 |
| 19 | Otwiera **Zaawansowane**. | Hosty, transfer, flagi developerskie, Computer Use details — **do ustalenia**. | Wymagać Zaawansowanych do zwykłej zmiany języka. | propozycja T1 |
| 20 | Co z obecnymi stronami szyny (Usage, Library, Marketplace, Phone, Remote, Schedule, …)? | Zostają jako **powierzchnie pracy**, nie jako „ustawienia”. Library „rozbite na osobne widoki” (luki W7-UI3): **osobne zadanie UI**, nie blokuje motywu/języka. | Wpychać cały Library do okna ustawień. | luki W7-UI3; propozycja T1 |
| 21 | Zakładki z kontraktu dziś niedostępne (`available: false`). | Pokazane wyłączone albo ukryte zgodnie z `SettingsTab.available`. | Klik w martwą zakładkę bez komunikatu. | kontrakt `SETTINGS_TABS`; propozycja T1 |

**Propozycja mapowania zakładek T1 ↔ stan / luki (do decyzji lidera):**

| Zakładka T1 | Skąd wziąć treść dziś / z luk |
|---|---|
| Ogólne | język, (skala), onboarding leftovers; część `general` |
| Dostawcy | strona Providers + konta + CLI + klucze + endpointy |
| Powiadomienia | macierz z `AppSettings.notifications` |
| Wygląd | motyw (+ W7-UI4: skala, kolor czatu, ruch) |
| Dane i prywatność | Vault status, usuwanie danych, logi — **dziś rozproszone / brak** |
| Zaawansowane | hosts, transfer, computer-use, dock/island/mobile/updates jako podsekcje albo linki |

Lista luk W7-UI3 (Głos, Dok, Wyspa, Aktualizacje, Profil) wchodzi jako **podsekcje** Ogólne / Zaawansowane / Wygląd — Q poniżej.

### 1D. Kierunek wyglądu (OpenBot + Grok Bot, nie Paperclip)

| Nr | Użytkownik robi | Program robi / zespół robi | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 22 | Ocenia gęstość i szkielet okna. | **Od OpenBota:** szkielet okna, gęstość pracy desktopowej, szyna + lista + czat. | Przerabiać UI na tablicę zgłoszeń / organigram (Paperclip). | luki „Kierunek wyglądu”; „Czego nie robić” |
| 23 | Ocenia listę agentów. | **Od Grok Bot (zasady, nie pliki):** boty jak kontakty; awatar / stan jako sygnał; komputer agenta w poziomach (ikona → panel → pełny) — **stopień wdrożenia w W7 do ustalenia** (propozycja T1: W7 = tokeny + spójność; pełne „trzy poziomy” może dojść z UI5–UI8). | Kopiować awatary / teksty / assety Grok Bot. | luki s.5–7 |
| 24 | Szuka brandingu. | Własne **logo C** i ikony COSGRAL; nazwa COSGRAL. | Grafiki, maskotki, logo, dosłowne teksty UI z OpenBot 0.68. | luki; pamięć kanału 12.11 |
| 25 | Przechodzi między stronami. | Jedna główna praca na stronę; ustawienia w oknie ustawień (nie formularze „jeden pod drugim” jako domyślny wzorzec). | Nowy ekran ustawień jako ściana pól bez zakładek. | luki „Czego nie robić” |
| 26 | Widzi ruch. | Ruch tylko tam, gdzie niesie stan; respekt dla ograniczonego ruchu. | Dekoracyjny motion bez informacji. | luki tabela kierunku |
| 27 | Paperclip. | **Nie** jako wygląd. Ewentualnie później tylko pomysły na funkcje (budżety, cele) — poza W7 UI. | Wzorować layout na Paperclip. | luki; PLAN-W4 |

### 1E. Inwentarz → praca migracji napisów

| Nr | Użytkownik / zespół robi | Program / proces | Czego nie wolno | Źródło |
|---|---|---|---|---|
| 28 | UI przenosi napisy do katalogu. | Każdy nowy napis UI ma klucz EN+PL; test CI łapie braki (W7-UI2). | Dodawać kolejne PL/EN na sztywno „na chwilę”. | luki W7-UI2 |
| 29 | Tester przy odbiorze. | Skrypt / checklista: przy `language=pl` zero typowych EN z listy krytycznej i odwrotnie (sekcja 2). | Oceniać tylko Settings. | zlecenie T1 |
| 30 | Backend / kontrakt. | `language` już jest; pole **motywu** w `AppSettings`: **brak dziś** → do dodania (**propozycja T1**: `theme: "dark" \| "light" \| "system"`). | Trzymać motyw tylko w localStorage renderera bez synchronizacji. | stan kontraktu; propozycja T1 |

---

## 2. Kryteria odbioru

**Skróty:** **J** = jednostkowe / CI; **E** = okno / Storybook axe; **R** = właściciel (wygląd).

### 2A. Motyw (W7-01 … W7-08)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W7-01 | Przełącznik dark / light / system zapisuje się i wraca po restarcie (wiersz 1). | E | UI + Backend (pole theme) |
| W7-02 | Wszystkie główne strony szyny + czat + Settings wyglądają spójnie w light i dark (wiersz 1, 3). | E + axe | UI |
| W7-03 | Karty Needs you / Decyzja / limit czytelne w obu motywach (wiersz 4). | E | UI |
| W7-04 | Systemowy motyw reaguje na zmianę OS bez restartu aplikacji (wiersz 2; po decyzji). | E | UI |
| W7-05 | Dok / wyspa / dodatkowe okno używają tych samych tokenów (wiersz 5). | E | UI |
| W7-06 | Brak assetów z OpenBot 0.68 w paczce UI (wiersz 6, 24). | J (skan nazw/assetów) | UI / Tester |
| W7-07 | Kontrast AA na tokenach (wiersz 3). | E axe / checklist | UI |
| W7-08 | Storybook light ≠ jedyny dowód; motyw działa w zbudowanej aplikacji (wiersz 3). | E | UI / Tester |

### 2B. Język (W7-09 … W7-16)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W7-09 | Zmiana PL↔EN bez restartu; natychmiast na otwartych widokach (wiersz 8). | E | UI + KK katalog |
| W7-10 | Przy `pl` brak mieszania z krytycznymi EN z listy odbioru; przy `en` brak wysp PL z inwentarza (wiersze 8, 12). | E | Tester |
| W7-11 | Katalog PL/EN; CI: 0 brakujących kluczy (wiersz 9). | J | UI + KK |
| W7-12 | Daty/liczby wg locale (wiersz 10). | E | UI |
| W7-13 | Treść wiadomości agenta nie jest tłumaczona przez UI (wiersz 11). | E | UI |
| W7-14 | Onboarding: wybór języka realnie zmienia napisy setupu (parytet 40). | E | UI |
| W7-15 | Settings: wybór Polski nie zostawia angielskiego UI (parytet 39). | E | UI |
| W7-16 | Tylko `en`\|`pl` w W7; brak obietnicy 15 języków (wiersz 13). | J kontrakt | Backend / UI |

### 2C. Ustawienia (W7-17 … W7-22)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W7-17 | Jedno okno z zakładkami (nie sama lista) (wiersz 14). | E | UI |
| W7-18 | Zakładki z decyzji lidera (T1 lub zaktualizowana lista) obecne i nawigowalne (wiersz 15). | E | UI |
| W7-19 | Wyszukiwarka ustawień znajduje ≥1 kontrolkę z Ogólne i Powiadomienia (jeśli Q to potwierdzi). | E | UI |
| W7-20 | Dostawcy / wygląd / powiadomienia mają kanoniczne miejsce (wiersze 16–17). | E | UI |
| W7-21 | Destrukcja danych wymaga potwierdzenia (wiersz 18). | E | UI + Backend |
| W7-22 | `available: false` nie otwiera pustego martwego ekranu (wiersz 21). | E | UI |

### 2D. Kierunek wyglądu (W7-23 … W7-28)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W7-23 | Layout = szyna + lista + czat (OpenBot), nie tablica Paperclip (wiersze 22, 27). | R | właściciel |
| W7-24 | Branding COSGRAL (logo C), bez assetów 0.68 (wiersz 24). | R + J | właściciel / Tester |
| W7-25 | Lista agentów czytelna jak komunikator (kierunek Grok Bot — zasady) (wiersz 23). | R | właściciel |
| W7-26 | Ustawienia nie są ścianą formularzy (wiersz 25). | R | właściciel |
| W7-27 | Ruch nie zasłania stanu przy „reduce motion” (wiersz 26; gdy UI4 gotowe). | E | UI |
| W7-28 | Makiety / tokeny zgodne z `docs/cosgral/ui-w1` tam, gdzie W7-UI1 wymaga (luki). | E | UI |

### 2E. Inwentarz / regresja napisów (W7-29 … W7-32)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W7-29 | Pliki z inwentarza PL (§5) nie trzymają PL na sztywno po migracji (albo idą przez katalog). | J grep | UI / Tester |
| W7-30 | Nowe PR UI: zakaz nowych hardcodów — reguła w CI **do ustalenia**. | J | KK / UI |
| W7-31 | Pole `theme` w ustawieniach (jeśli przyjęte) ma test kontraktu. | J | Backend |
| W7-32 | Raport odbioru W7 zawiera zrzuty light+dark PL+EN **bez** nazwy profilu w ścieżce. | R | Tester |

### 2F. Bramka G4 — właściciel (W7-33 … W7-36)

| Nr | Kryterium | Jak | Kto |
|---|---|---|---|
| W7-33 | Akceptacja motywu jasnego na wszystkich głównych ekranach. | R | właściciel |
| W7-34 | Akceptacja polskiego UI (spójność, bez mieszania). | R | właściciel |
| W7-35 | Akceptacja okna ustawień (nawigacja „jak w 0.70” wg luk). | R | właściciel |
| W7-36 | Akceptacja kierunku OpenBot + Grok Bot, nie Paperclip (bramka G4). | R | właściciel |

---

## 3. Co wymaga właściciela

1. **W7-33 … W7-36** — ocena wyglądu i bramka G4.
2. Zrzuty / porównanie „czy to wygląda jak praca, nie panel admina” — subiektywne.
3. Decyzje produktowe z sekcji 4, jeśli lider odroczy do właściciela (domyślnie: **lider**).

---

## 4. Pytania otwarte do lidera (z rekomendacją)

| # | Pytanie | Rekomendacja T1 |
|---|---|---|
| Q1 | Zakładki: lista zlecenia T1 (6 szt.) czy lista luk W7-UI3 (Głos, Dok, Wyspa, …)? | **T1 jako główne 6**; Głos/Dok/Wyspa/Aktualizacje/Profil jako podsekcje Ogólne / Zaawansowane / Wygląd. |
| Q2 | Czy strona Providers znika z szyny? | Zostawić skrót na szynie; kanon = zakładka Dostawcy. |
| Q3 | Pole `theme` w `AppSettings`? | Tak: `dark` \| `light` \| `system`, domyślnie `dark` (albo `system` — preferuję **`system`**, by jasny był „za darmo” na jasnym Windows). |
| Q4 | Domyślny motyw po instalacji? | `system`. |
| Q5 | Fallback przy brakującym kluczu i18n? | EN + wpis w logu diagnostycznym; CI red. |
| Q6 | Czy W7 obejmuje skalę 67–200 % i kolor czatu? | W tej samej fali (UI4), ale **po** motywie+i18n+oknie; nie blokuje startu UI1/UI2. |
| Q7 | 15 języków? | Nie w W7; tylko PL/EN. |
| Q8 | Czy „Needs you” / nazwy własne zostają po angielsku jako brand? | **Nie** przy PL — tłumaczyć etykiety UI („Potrzebuje Ciebie” albo ustalony termin); brand COSGRAL bez zmian. |
| Q9 | Library rozbicie (W7-UI3) w tej samej bramce G4? | Osobny odbiór UI; G4 może przejść bez pełnego rozbicia Library, jeśli ustawienia+motyw+PL są OK. |
| Q10 | Ikona light/dark? | Jedna ikona COSGRAL na start; wariant dark/light tylko jeśli kontrast na pasku pada. |
| Q11 | Paperclip: czy wolno brać pomysły na budżety do W8? | Tak na **funkcje** w W8; zero na wygląd W7. |
| Q12 | Test CI i18n — kto utrzymuje? | KK + UI (jak w lukach W7-UI2). |

---

## 5. Inwentarz napisów na sztywno (`src/renderer`, grep 16.11)

Metoda: przeszukanie `src/renderer/**/*.ts(x)` (bez uruchamiania). **Przybliżenie** — nie jest to pełny AST i18n extractor.

| Zbiór | Liczba plików | Uwagi |
|---|---|---|
| Wszystkie `src/renderer` `*.ts` / `*.tsx` | **279** | komponenty + testy + stories |
| Z markerami PL (diakrytyki / Pokaż / Pobierz / Narzędzia / …) | **23** | w tym testy i stories |
| Z markerami PL — tylko `src/renderer/src` **bez** `*.test.*` | **11** | produkcyjny UI do migracji w pierwszej kolejności |
| Z typowymi EN UI (`Needs you`, `Thinking`, `Settings`, `Providers`, `Download`, `Sign in`, `Continue`, `Language`, `Fallback`, …) | **71** (cały renderer) / **~86** komponentów bez testów przy szerszym Title Case | większość UI jest EN na sztywno |

**11 plików produkcyjnych z PL na sztywno (priorytet):**

1. `src/renderer/src/App.tsx`
2. `src/renderer/src/page-pins.ts`
3. `src/renderer/src/components/Sidebar.tsx` — np. **„Pokaż ukryte”**
4. `src/renderer/src/components/PageRail.tsx` — np. „Przypięta”
5. `src/renderer/src/components/LibraryPanel.tsx` — **„Pobierz”**, **„Pokaż w folderze”**
6. `src/renderer/src/components/ManagedCliSection.tsx` — **„Narzędzia CLI”**, „Pobierz”, „Własna ścieżka”, …
7. `src/renderer/src/components/ProviderAccounts.tsx` — stany logowania po polsku
8. `src/renderer/src/components/AgentAccountPicker.tsx` — „Konto agenta”, instrukcje PL
9. `src/renderer/src/components/AppSettingsW3.tsx` — opcja „Polski” (OK) + etykiety EN obok
10. `src/renderer/src/components/InitialSetup.tsx` — „Pobierz i przejdź dalej”
11. `src/renderer/src/components/VoiceSettings.tsx`

**Przykłady mieszania (dokładnie z zlecenia / grep):**

| Miejsce | Przykład |
|---|---|
| `Sidebar.tsx` | `label="Pokaż ukryte"` |
| `ManagedCliSection.tsx` | `aria-label="Narzędzia CLI"` |
| `LibraryPanel.tsx` | tekst przycisku `Pobierz` |
| `AppSettingsW3.tsx` | `label="Language"` + `<option>Polski</option>` przy reszcie EN |
| Wiele komponentów EN | `"Needs you"`, `"Search conversation"`, `"Show thinking details"`, … |

**Motyw — stan plików:** `src/renderer/src/styles/*.css` (8 plików) używa `var(--openbot-*)`; **brak** `theme-light` / `prefers-color-scheme` w stylach aplikacji. Jasny zestaw: tylko `src/renderer/stories/theme-frame.tsx`.

**Szacunek pracy (dla UI/KK, nie zobowiązanie):** ~11 plików PL-wysp + ~70–90 plików EN UI → katalog i18n rzędu **setek kluczy**; CI jak w W7-UI2.

---

## 6. Czego nie wiadomo

1. Dokładne nazwy zakładek i copy 0.70 — nie kopiujemy; lista T1 vs luki do decyzji (Q1).
2. Pełna lista kluczy i18n bez extractor — inwentarz jest grepem, nie kompletny AST.
3. Zachowanie ikony tray / native titlebar w Electron przy motywie — do sprawdzenia przy implementacji.
4. Czy właściciel akceptuje tłumaczenie „Needs you” (Q8).
5. Zakres W7-UI5…UI8 (kierunek wyglądu szczegółowy) — poza opisem zasad w §1D.
6. Nie uruchamiałem Electrona; nie czytałem kodu OpenBota > `a6fe240`.

---

## 7. Mapowanie na zadania z luk

| ID | Zakres w tym specu |
|---|---|
| W7-UI1 | §1A, W7-01…08 |
| W7-UI2 | §1B, §5, W7-09…16, W7-29…30 |
| W7-UI3 | §1C, W7-17…22 |
| W7-UI4 | skala / kolor / ruch — Q6; W7-27 |
| W7-UI5…UI8 | kierunek szczegółowy — §1D zasady; szczegóły UI później |
| W7-T1 (odbiór w lukach) | później: W7-01…36; ten plik = **spec wejściowy** |

---

## 8. Decyzje lidera (Q1–Q12, 16.11.2026)

Źródło: wiadomość Okiestratora w kanale (akceptacja wszystkich rekomendacji Testera z §4). Obowiązują przy implementacji W7.

| Q | Decyzja |
|---|---|
| Q1 | **6 zakładek T1** jako główne (Ogólne, Dostawcy, Powiadomienia, Wygląd, Dane i prywatność, Zaawansowane). Głos / Dok / Wyspa / Aktualizacje / Profil = **podsekcje**. |
| Q2 | Skrót **Providers zostaje na szynie**; kanoniczne miejsce = zakładka Dostawcy. |
| Q3 / Q4 | Pole `theme`: `dark` \| `light` \| `system`; **domyślnie `system`**. |
| Q5 | Brakujący klucz i18n: **fallback EN** + wpis w logu diagnostycznym + **czerwony test CI**. |
| Q6 | Skala **67–200 %** i kolor czatu w **tej samej fali**, po motywie i i18n (W7-UI4). |
| Q7 | W7: **tylko PL / EN** (bez 15 języków). |
| Q8 | Przy PL **tłumaczymy etykiety UI**, w tym „Needs you”; brand **COSGRAL** bez zmian. |
| Q9 | Rozbicie Library = **osobny odbiór**; nie blokuje G4. |
| Q10 | **Jedna ikona** COSGRAL na start. |
| Q11 | Pomysły Paperclip tylko na **funkcje W8**, zero na wygląd W7. |
| Q12 | Test i18n utrzymują **KK + UI**. |

---

## Commity

Zobacz SHA w wyniku kanału (gałąź ze spec-w7 / w8-spec).
