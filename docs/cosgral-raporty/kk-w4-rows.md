# KK Fullstack: W4-T5, cztery wiersze parytetu w prawdziwym oknie (24, 26, 30, 35)

Data: 16.11.2026. Integracja `codex/cosgral-desktop` @ `4111f0e30` (G1 zielone), gałąź robocza `team/kk/w4-rows`. Prawdziwy Electron w piaskownicy (własny profil), atrapa Codex i atrapa agenta ACP z repozytorium, bez sieci i bez kont. Zmieniłem tylko skrypt odbioru i atrapy; kodu programu nie ruszałem.

## Wynik w jednej linii

**Wiersz 24 (Skille): jest. Wiersze 26 (Vault), 30 (Pliki) i 35 (Dostawcy): zostają „częściowo”, każdy z nowymi dowodami.** Parytet: **27 jest + 17 częściowo = 35,5 z 44 = 80,7%** (było 35 = 79,5%). Pełny odbiór na końcowym kodzie: **45/45 kroków, 0 błędów konsoli** (275 s). Błędów programu, które blokują któryś wiersz: 0; drobnych usterek do zgłoszenia: 3 (niżej).

## Wynik per wiersz

| Wiersz | Wynik | Dowód (krok w `scripts/sandbox-acceptance.ts`) | Czego nadal brakuje do „jest” |
|---|---|---|---|
| **24 Skille** | **jest** | 24b: agent tworzy skill z tekstu SKILL.md (wersja 1, autor = ten agent), instaluje, poprawia (wersja 2, jego kopia zostaje na 1, widać aktualizację); zmieniona lokalnie kopia jest wykrywana, aktualizacja bez zgody odrzucona, z nadpisaniem naprawia kopię; 2 wersje, cofnięcie do wersji 1 daje wersję 3. 24c: drugi agent dodaje ten skill, kopia pierwszego się nie zmienia. R2b, R3b: po restarcie skill jest w bibliotece (wersja 3) i w instrukcjach nowej rozmowy | skill z dodatkowymi plikami i tworzenie z folderu (`sourcePath`), aktualizacja skilla z Marketplace (nie sprawdzone) |
| **26 Vault** | częściowo | 26b: login zapisany dla lokalnej strony (loopback); agent otwiera ją w wbudowanej przeglądarce, odczytuje elementy, woła `fill_login`, wysyła formularz; strona dostała login i hasło. Hasła nie ma w wyniku narzędzia, w rozmowie agenta, na liście Vault, w oknie ani w żadnym pliku profilu piaskownicy (bajtowo) | konektory 1Password, Bitwarden i Proton (w programie ich nie ma); karta, kontakt, klucz API i TOTP w oknie (są w silniku i testach API) |
| **30 Pliki** | częściowo | 30b: „Add files” przez okno wyboru dodaje plik (39 bajtów, rozmiar poprawny); „Open” prosi powłokę o otwarcie kopii z biblioteki (treść identyczna); `download` zapisuje identyczną kopię w wybranym miejscu; `reveal` prosi powłokę o pokazanie pliku; po restarcie plik jest (R2b) | siatka, zaznaczanie, sprzątanie, pliki maszyny; przyciski Download i Reveal w panelu (są tylko Open, Attach, Delete) |
| **35 Dostawcy** | częściowo | 35b: pełne okno limitu Codex przenosi agenta na model zapasowy INNEGO dostawcy (agent ACP); agent odpowiada z ACP (`activeModel` = `acp:demo-acp`); Providers pisze „Assistant is using Demo ACP (ACP) instead of Terra” i „Assistant switched from gpt-5.6-terra to acp:demo-acp: gpt-5.6-terra is not available now.”; po zdjęciu limitu następna wiadomość wraca na własny model | prawdziwy agent ACP (Gemini, OpenCode…), wiele kont jednego dostawcy (W5), komunikat o przełączeniu w widoku rozmowy, pierścienie użycia jako wykres |

Zrzuty (poza repo, mają nazwę konta): `library-row-30b.png`, `vault-form-row-26b.png`, `providers-fallback-row-35b.png` w `Shared\cosgral-sandbox\acceptance\rows-*\evidence`.

## Jak sprawdzałem (i co jest atrapą)

- **Okna wyboru plików i powłoka (wiersz 30):** natywnego okna „Otwórz” i „Zapisz jako” nie da się obsłużyć z zewnątrz. Skrypt odpowiada na nie w procesie głównym (podmienia `dialog.showOpenDialog` i `showSaveDialog`) i zapisuje, o co program prosi powłokę (`shell.openPath`, `showItemInFolder`). Cała reszta (kopiowanie do biblioteki, lista, rozmiar, zapis kopii) to kod programu bez zmian. Prawdziwego otwarcia pliku przez system nie sprawdzałem.
- **Formularz (wiersz 26):** lokalny serwer HTTP na `127.0.0.1` ze stroną z polami użytkownika i hasła; zapamiętuje, co dostał. Agent robi to samo, co zrobiłby prawdziwy: narzędzia `openbot_browser` (otwórz, odczytaj, kliknij) i `cosgral_vault.fill_login`. Przeszukanie profilu piaskownicy szuka hasła jako bajtów w każdym pliku (bazy, logi, pamięć podręczna przeglądarki).
- **Limit i inny dostawca (wiersz 35):** atrapa Codex zgłasza pełne okno użycia (`LIMITON`), a agent „Demo ACP” to `src/backend/testing/acp-stub.mjs` uruchomiony przez Node (program startuje go jak prawdziwego agenta ACP przez stdio). Powrót: inny agent Codex zdejmuje limit (`LIMITOFF`).
- **Skille (wiersz 24):** narzędzia agenta `cosgral_skills.create_skill`, `install_local_skill`, `revise_skill`; wersje, aktualizacja, naprawa i cofnięcie przez `window.openbot.skills`; zmianę kopii agenta robi skrypt zapisem do jej `SKILL.md`.

## Znalezione usterki programu (z odtworzeniem)

Żadna nie blokuje wiersza. Kodu programu nie poprawiałem.

1. **Pobieranie pliku z biblioteki może paść na `app.getPath("downloads")`** (mała, jedna linia). Odtworzenie: w piaskownicy z własnym profilem (`USERPROFILE`, `APPDATA` przestawione) wywołaj `window.openbot.library.open({ fileId, action: "download" })` → błąd „Failed to get 'downloads' path”, zanim pojawi się okno zapisu. Przyczyna: `src/main/data-ipc.ts` (gałąź `download` w `libraryOpen`) liczy `defaultPath` jako `join(app.getPath("downloads"), file.name)`, a system nie potrafi wskazać folderu „Pobrane”. Może zdarzyć się też na prawdziwym koncie z usuniętym lub przeniesionym folderem. Propozycja: otoczyć `try/catch` i przy błędzie użyć `app.getPath("documents")` albo samej nazwy pliku jako `defaultPath`. Skrypt odbioru podstawia tę ścieżkę tylko w piaskownicy.
2. **Panel plików nie ma przycisków Download i Reveal.** Odtworzenie: zakładka Library → sekcja Files → każdy plik ma tylko Open, Attach, Delete. Akcje `download` i `reveal` są w kontrakcie i silniku (działają, patrz 30b), ale nic w interfejsie ich nie wywołuje. Propozycja dla UI: dwa przyciski drugorzędne (`components/ui`) obok „Open”, wywołujące `library.open({ fileId, action })`.
3. **Komunikat o przełączeniu modelu jest tylko na stronie Providers.** Dowód z kodu (nie odtworzone w oknie): w rendererze `activeModel` i zdarzenie `model-fallback` czyta wyłącznie `src/renderer/src/components/ProvidersPage.tsx`; lista „Assistant switched from … to …” to stan lokalny strony, więc zbiera zdarzenia tylko, gdy strona jest otwarta. Stałe zdanie „… is using Demo ACP (ACP) instead of Terra” liczy się z modelu aktywnego i zostaje (zrzut 35b). Ani wiersz agenta, ani rozmowa nie oznaczają, że odpowiedział model zapasowy. Propozycja: oznaczenie przy agencie lub wiersz „Odpowiedział model zapasowy: …” w rozmowie.

## Poprawki w skryptach i atrapach (nie w programie)

- `scripts/sandbox-acceptance.ts`: kroki 30b, 26b, 24b, 24c, 35b, R2b, R3b; `Driver` trzyma uchwyt Electrona; pomocniki `toolResult`, `snapshotOf`, `anyFileContains`. Krok 35b sprząta po sobie nawet po błędzie.
- `src/backend/testing/acp-stub.mjs`: atrapa ACP reagowała na słowa `LIMIT`, `TOOL`, `SLOW` w całym tekście. Po zmianie dostawcy program dołącza do pierwszej wiadomości poprzednią rozmowę („--- current message ---”) i baner `[COSGRAL: …]`, więc dawne „LIMITON” wywoływało u atrapy błąd limitu. Teraz czyta tylko bieżącą wiadomość. To poprawny dla programu sposób (historia jedzie z agentem), błąd był w atrapie. Testy `acp-client` 5/5.

## Sprawdzone przed oddaniem

`typecheck:node` zielony, Biome czysty na zmienionych plikach, testy `acp-client` 5/5. Biegi odbioru: pierwszy z nowymi krokami 41/44 (3 błędy moich kroków: `require` w procesie głównym, nazwa pola `fallbackModels`, ścieżka „Pobrane”), kolejne poprawki, następnie 44/44, a końcowy przebieg z krokiem 24c: 45/45.

## Czego nie sprawdziłem

- Prawdziwych okien wyboru plików i prawdziwego otwarcia pliku przez system (podmienione w procesie głównym).
- Prawdziwego agenta ACP (Gemini, OpenCode i inne) i prawdziwego limitu Codex lub Claude (atrapy).
- Vault: karty, kontaktu, klucza API i TOTP w oknie; konektorów (ich nie ma). Wypełnienia formularza na stronie https z certyfikatem i na stronie z przekierowaniem; wielu pasujących loginów (karta wyboru).
- Skilli z plikami dodatkowymi, z folderu i z Marketplace; usuwania skilla.
- Hasła poza plikami profilu piaskownicy: pamięć procesu i katalog `tmp` nie były przeszukiwane; sama strona testowa z konieczności dostaje hasło.
- Zachowania listy przełączeń po wyjściu ze strony Providers i po powrocie (wniosek z kodu, patrz usterka 3) oraz wyglądu strony Providers po zmianie rozmiaru okna.
- Jednego przebiegu na krok po ostatniej poprawce poza pełnym końcowym przebiegiem; stabilności przy powtórzeniach nie badałem.
- Pełnego `bun run check` po zmianach (nie dotykają kodu programu; zmieniają skrypt odbioru i atrapę ACP, objęte `lint` i `typecheck`, które sprawdziłem osobno dla pliku).

## Pliki

`scripts/sandbox-acceptance.ts`, `src/backend/testing/acp-stub.mjs`, `docs/cosgral/parytet-0.68.md`, `COSGRAL-CHANGES.md`, ten raport. Logi przebiegów i zrzuty: poza repo, `Shared\cosgral-sandbox\acceptance\rows-*`.
