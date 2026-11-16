# Odbiór W7 — skrypt w oknie (motyw, PL/EN, ustawienia, kierunek)

**Stan: 16.11.2026. Autor: Tester (W7-T2).** Tylko dokument, **bez** uruchamiania programu.  
**Integracja odniesienia:** `codex/cosgral-desktop` @ `7fe84704e`.  
**Kryteria:** `docs/cosgral/spec-w7.md` §2 (W7-01…W7-36) + §8 decyzje lidera. Bramka **G4** w `luki-070.txt`.  
**Raport motywu:** `docs/cosgral-raporty/ui-w7-ui1.md` (W7-UI1 w integracji; bez Electrona).  
**Inwentarz napisów:** `docs/cosgral/i18n-inwentarz.md` (wejście W7-UI2).

## Na górze

- **Cel:** przebieg W7 w prawdziwym Electronie (piaskownica COSGRAL): light/dark/system, PL↔EN bez wysp, jedno okno ustawień z zakładkami T1, kierunek OpenBot+Grok (nie Paperclip).
- **Podział:** **KK** = kroki E w sandboxie / acceptance (`COSGRAL_MODE=w7` gdy powstanie). **Właściciel** = W7-33…36 (G4).
- **Blokada T2:** nie uruchamiałem okna; ten plik = checklista. Motyw UI1 = **kod + testy jednostkowe/Storybook**, nie dowód W7-08 w zbudowanej aplikacji.

---

## 0. Przygotowanie (KK)

1. PATH: `Shared\tools\bun`, `node`, `git\cmd`.
2. Worktree integracji z W7-UI1 (theme) i ewentualnie późniejszym W7-UI2/UI3; `bun install` jeśli trzeba.
3. Piaskownica: osobne `USERPROFILE` / `APPDATA` / `LOCALAPPDATA`; **nie** ruszać profilu OpenBot.
4. Przed startem: `sandbox:e2e` zielone na tej integracji (lider/KK).
5. Selektory: przy PL etykiety zmienią się (Q8: „Needs you” → tłumaczenie); nie hardcodować tylko EN w asercjach po migracji i18n.
6. Zrzuty light+dark × PL+EN: **bez** nazwy profilu w ścieżce (W7-32).

---

## 1. Motyw — W7-01…08 (KK)

| ID | Krok w oknie | Pass gdy | Fail gdy |
|---|---|---|---|
| W7-01 | Settings → Appearance → System / Light / Dark; restart | Motyw wraca; `data-theme` / wygląd zgodny | Reset do samego dark; partial flash bez cache (zgłoś, nie fail jeśli tylko start) |
| W7-02 | Przejdź szynę (Agents, Schedule, Usage, …), czat, Settings w **light** i **dark** | Spójne tokeny `--openbot-*`; brak „wysp” starego tła | Jasna karta na ciemnym bez sensu / odwrotnie |
| W7-03 | Otwórz Needs you + sticky Decision (+ limit/błąd jeśli jest) w obu motywach | Czytelne; przyciski z kontrastem | Biały tekst na jasnym / odwrotnie |
| W7-04 | Motyw **System**; zmień motyw Windows | Aplikacja podąża **bez** restartu | Wymaga ręcznego restartu programu |
| W7-05 | Dok / wyspa / osobne okno rozmowy (gdy dostępne) | Te same tokeny co główne | Osobna paleta bez tokenów |
| W7-06 | Skan paczki UI (KK/Tester, J) | Brak assetów OpenBot 0.68; logo COSGRAL | Maskotki / logo 0.68 |
| W7-07 | axe / checklista kontrastu na głównych ekranach light+dark | AA na tokenach (jak paleta UI1) | Fail axe na tekście podstawowym |
| W7-08 | Zbudowana aplikacja Electron (nie tylko Storybook) | Light działa w oknie produktu | Jedyny dowód = Storybook `ThemeFrame` |

**Uwaga T2:** UI1 dostarczył pole `theme`, `theme-light.css`, `startTheme`, Appearance, Storybook axe — **W7-08 i G4 nadal wymagają okna**.

---

## 2. Język PL/EN — W7-09…16 (KK; po W7-UI2)

| ID | Krok | Pass gdy | Uwagi |
|---|---|---|---|
| W7-09 | Ustawienia / onboarding: PL↔EN | Cały UI przełącza się **bez restartu** | Dziś: zapis `language` jest, napisy **nie** (parytet 39) |
| W7-10 | Przy `pl`: zero krytycznych EN z listy odbioru; przy `en`: zero wysp PL z inwentarza | Brak mieszanki w jednym widoku | Lista: `i18n-inwentarz.md` + „Needs you”, „Thinking”, „Settings”, „Pokaż ukryte”, „Pobierz” |
| W7-11 | CI katalogu PL/EN | 0 brakujących kluczy | Po W7-UI2; utrzymanie KK+UI (Q12) |
| W7-12 | Daty / liczby na PL | Format `pl-PL` (lub ustalony locale) | Nie US przy PL |
| W7-13 | Wiadomość agenta po zmianie języka UI | Treść modelu **bez** auto-tłumaczenia | |
| W7-14 | Onboarding: wybór języka | Napisy setupu realnie PL/EN | Parytet 40 |
| W7-15 | Settings: Polski | UI nie zostaje po angielsku | Parytet 39 — dziś fail, dopóki brak katalogu |
| W7-16 | Kontrakt | Tylko `en`\|`pl` | Już w `APP_LANGUAGES` |

**Przed W7-UI2:** KK oznacza W7-09…15 jako **blocked: brak katalogu i18n**, nie fail G4 za sam brak ekranu — o ile lider nie wymaga G4 wcześniej.

---

## 3. Ustawienia — W7-17…22 (KK; po W7-UI3)

| ID | Krok | Pass |
|---|---|---|
| W7-17 | Otwórz Ustawienia | Jedno okno z **zakładkami** (nie sama ściana scroll) |
| W7-18 | Zakładki T1 | Ogólne, Dostawcy, Powiadomienia, Wygląd, Dane i prywatność, Zaawansowane — nawigowalne (Q1) |
| W7-19 | Wyszukiwarka ustawień | Znajduje ≥1 kontrolkę z Ogólne i Powiadomienia |
| W7-20 | Dostawcy / Wygląd / Powiadomienia | Kanoniczne w ustawieniach; skrót Providers na szynie OK (Q2) |
| W7-21 | Delete my data (lub równoważne) | Confirm (np. wpisz DELETE); bez cichego wipe |
| W7-22 | Zakładka `available: false` | Wyłączona / ukryta; nie pusty martwy ekran |

**Dziś (7fe84704e):** modal ma General / Appearance / Notifications / Advanced; Appearance działa; inne „Coming soon”; **brak** pełnych 6 zakładek T1 i wyszukiwarki. `DataWipeSection` ma confirm — do sprawdzenia, czy jest w ścieżce Settings po UI3.

---

## 4. Kierunek wyglądu — W7-23…28 (KK + właściciel)

| ID | Krok | Kto | Pass |
|---|---|---|---|
| W7-23 | Layout szyna+lista+czat | R właściciel | Nie tablica Paperclip |
| W7-24 | Logo C / ikony COSGRAL; skan assetów | R + J | Bez 0.68 |
| W7-25 | Lista agentów czytelna (kierunek komunikatora) | R | |
| W7-26 | Ustawienia ≠ ściana formularzy | R | Po UI3 |
| W7-27 | Reduce motion (gdy UI4) | E KK | Stan pracuje/czeka bez ruchu |
| W7-28 | Spójność z `ui-w1` / tokenami UI1 | E | |

---

## 5. Inwentarz / regresja — W7-29…32

| ID | Krok | Kto |
|---|---|---|
| W7-29 | Po migracji: grep PL-wysp z inwentarza = 0 (albo przez katalog) | Tester / UI |
| W7-30 | CI zakaz nowych hardcodów | KK / UI (do ustalenia reguła) |
| W7-31 | `theme` w kontrakcie + test | Backend — **jest** (`APP_THEMES`, testy UI1) |
| W7-32 | Raport zrzutów light+dark PL+EN bez ścieżki profilu | Tester przy odbiorze okna |

---

## 6. Właściciel — W7-33…36 (G4)

| ID | Krok | Kto |
|---|---|---|
| W7-33 | Akceptacja motywu jasnego na głównych ekranach | Właściciel |
| W7-34 | Akceptacja polskiego UI (spójność, bez mieszania) | Właściciel |
| W7-35 | Akceptacja okna ustawień (nawigacja) | Właściciel |
| W7-36 | Akceptacja kierunku OpenBot + Grok Bot, nie Paperclip | Właściciel |

**Zasady:** żadnych haseł w czacie/repo; skan prywatności przed push.

---

## 7. Mapowanie ról

| Rola | Kroki |
|---|---|
| **KK (sandbox)** | §0, W7-01…08 (E), W7-09…16 po UI2, W7-17…22 po UI3, W7-27 gdy UI4; log + 0 console errors |
| **UI Designer** | UI1 (motyw — w integracji), UI2 (i18n), UI3 (zakładki), UI4 (skala/ruch) |
| **Backend** | `theme`/`language` już; dalsze pola tylko jeśli UI potrzebuje |
| **Tester** | Ten skrypt + `i18n-inwentarz.md`; po zielonym oknie — parytet / raport G4 |
| **Właściciel** | W7-33…36 |

---

## 8. Co z W7 jest już w kodzie vs brak (`7fe84704e`)

| Obszar | W kodzie (grep/raport, bez Electrona) | Brak / niezaliczone E |
|---|---|---|
| Motyw dark/light/system | `APP_THEMES`, `AppearanceSettings`, `theme.ts`, `theme-light.css`, `theme-init.js`, Storybook axe, testy kontrastu (UI1) | W7-08 w zbudowanym Electronie; native titlebar/tray; pełne E wszystkich stron; dok/wyspa nie odpalone |
| Język PL/EN | `APP_LANGUAGES`, zapis `language` / onboarding | Katalog i18n; przełączanie napisów; CI braków; locale dat; tłumaczenie „Needs you” (Q8) |
| Ustawienia 1 okno | `SettingsModal` + nav częściowy; Appearance; `DataWipeSection` z confirm | 6 zakładek T1; wyszukiwarka; kanon Dostawcy w Settings; spięcie z `SETTINGS_TABS` |
| Kierunek / brand | Logo COSGRAL (`AppLogo`, assety cosgral-logo-*); layout szyna+lista+czat | Ocena G4 właściciela; UI4 reduce motion / skala |
| Inwentarz | Ten T2: `i18n-inwentarz.md` | Migracja UI2; CI hardcode ban |

**Legenda kryteriów (skrót):**  
`kod` = pliki/kontrakt · `test` = jednostkowe/Storybook · `E` = okno · `brak` · `UI` = czeka na UI2/3/4 · `R` = właściciel.

| ID | Stan dziś |
|---|---|
| W7-01…04, W7-07, W7-31 | **kod + test** (UI1); E w Electronie = **niejasne / do KK** |
| W7-05, W7-06, W7-08 | **częściowo kod** / skan; E lub pełny J = **do KK** |
| W7-09…15, W7-29…30 | **brak** katalogu → **UI** (W7-UI2) |
| W7-16 | **kod** kontrakt |
| W7-17…20, W7-22 | **częściowo** modal; pełne T1 = **UI** (W7-UI3) |
| W7-21 | **kod** wipe + confirm; miejsce w nowym oknie = **UI** |
| W7-23…26, W7-28, W7-33…36 | **R** / kierunek; niezaliczone bez właściciela |
| W7-27 | **UI** (W7-UI4) |
| W7-32 | po odbiorze okna |

---

## 9. Proponowane nazwy kroków w skrypcie (dla KK)

Prefiks `W7-` w `sandbox-acceptance.ts` / mode `w7`, np.:

- `W7-M01` … `W7-M08` = motyw  
- `W7-L09` … `W7-L16` = język  
- `W7-S17` … `W7-S22` = ustawienia  
- `W7-D23` … kierunek (głównie R)  
- `W7-G33` … G4 właściciel  

Nie implementuję skryptu w T2 (tylko dokument).

---

## 10. Czego ten dokument nie sprawdza

1. Uruchomienia Electrona / `sandbox:e2e` / acceptance (zakaz w W7-T2).  
2. Pełnego AST i18n — inwentarz = grep (zawyża Title Case).  
3. Native Windows titlebar / tray przy light.  
4. Prawdziwej zmiany motywu OS na maszynie odbioru.  
5. W7-UI2/UI3/UI4 (mogą dojść po tym SHA).  
6. Oceny subiektywnej G4.

---

## Commity

Gałąź `team/tester/w7-t2` — SHA w `channel_result`.
