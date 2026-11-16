# KK Fullstack W5-G2b: instalator na tym komputerze i odbiór T2 (G02–G12)

Data: 16.11.2026. Gałąź `team/kk/w5-g2b` (od integracji `934fd5c6a`). Modele zapasowe per dostawca przejęli BE7 i UI6 (już w integracji): tu ich nie ma, tylko kroki odbioru dopasowane do kontraktu BE7.

## Wynik w jednej linii

**Instalator zbudowany i zainstalowany na tym komputerze (dla bieżącego użytkownika, bez administratora). Zainstalowany program pobrał prawdziwe CLI Codex i Claude z oficjalnych źródeł (SHA-256 sprawdzone), przypiął starszy Codex i wrócił do nowszego, odinstalowanie zostawia dane. Po drodze znalazłem i naprawiłem usterkę blokującą (przełączanie wersji CLI = błąd EPERM na Windows). Prawdziwego logowania nie dotykałem: doszedłem do ekranów logowania i się zatrzymałem. Czystego konta Windows tu nie założę (brak praw administratora): G03–G08, G11, G12 i „agent odpowiada OK” z G02 zostają Tobie.**

## 1. Co zrobiłem i co wyszło

| # | Krok | Wynik |
|---|---|---|
| 1 | `bun run dist:win` | zielone, `COSGRAL Workspace-0.2.0-x64.exe` (108 MB, bez podpisu: SmartScreen może ostrzegać); przebudowany po naprawie z pkt 3 |
| 2 | Instalacja cicha, tylko dla mnie | exit 0, 22 s, bez okna UAC, `%LOCALAPPDATA%\Programs\cosgral-workspace\` (215 MB), skróty, wpis „COSGRAL Workspace 0.2.0” |
| 3 | Naprawa blokady (pkt 3 niżej) | test jednostkowy + sprawdzone na przebudowanym instalatorze |
| 4 | Odinstalowanie, potem instalacja ponowna | dane programu (folder `COSGRAL Workspace`) zostają; „Usuń moje dane” to osobna akcja; ponowna instalacja i aktualizacja nad istniejącą działają |
| 5 | Kroki `scripts/sandbox-installed.ts` na zainstalowanym programie | **10/10 ok**, 0 błędów konsoli (I01–I10, dowód w tabeli G02–G12 niżej) |
| 6 | P10b (bezczynny proces), P11b (odmowa dla telefonu/zdalnego) | zob. pkt 4 |
| 7 | Pełny przebieg okna W5 i `sandbox:e2e` na końcowym kodzie | zob. pkt 5 |

Uruchomienie z pliku skrótu użyje **Twojego prawdziwego profilu** i prawdziwych logowań: tego nie robiłem. `%APPDATA%\OpenBot` bez zmian (sprawdziłem: istnieje, nie dotykałem). Dane nowego programu są tylko w folderach `COSGRAL Workspace`.

### 2. Tabela G02–G12 (T2)

„ok” = sprawdzone tu na prawdziwym zainstalowanym programie. „atrapa” = sprawdzone na atrapie (to samo zachowanie programu, nie prawdziwe konto). „Ty” = potrzebny właściciel.

| G | Kryterium | Stan | Dowód / co zostaje |
|---|---|---|---|
| G02 | Czysty Windows: jedno kliknięcie pobiera oficjalne CLI; agent odpowiada „OK” | **część ok, część Ty** | ok: profil bez CLI: onboarding blokuje Continue, karta „Brak”, brak martwego przycisku logowania (I03); karta „Download Codex CLI 0.169.0?” → tak → pobrane w 12 s, 365 MB, SHA-256 sprawdzone przez program, wersja 0.169.0 działa (I04); setup idzie dalej, okno główne otwarte (I05). Claude Code 2.1.325 tak samo, 13 s, kopia pobrana wygrywa z systemową (I09). **Ty:** prawdziwie czyste konto Windows bez administratora i tura „OK” po zalogowaniu |
| G03 | Logowanie Codex w oknie, bez terminala; tura „OK” | **Ty (doszedłem do ekranu)** | I10: start logowania daje stan „waiting-for-browser”, komunikat „Finish signing in in the browser. If it did not open, use the link.”, strona `https://auth.openai.com/oauth/authorize`, bez kodu urządzenia. Zatrzymałem się tam: anulowane, konto testowe usunięte, żadnych plików logowania nie czytałem, haseł nie wpisywałem |
| G04 | Logowanie Claude w oknie, bez terminala; tura „OK” | **Ty (doszedłem do ekranu)** | I10: stan „code-required”, komunikat „Sign in in the browser, then paste the code shown there.”, strona `https://claude.com/cai/oauth/authorize`. W programie trzeba wkleić kod ze strony: to krok właściciela |
| G05 | Wylogowanie obu; agent prosi o sign-in bez awarii | **atrapa ok / Ty** | W5 z atrapą Codex: wylogowanie → „signed-out”, agent odmawia grzecznie, bez awarii. Prawdziwe wylogowanie: Ty |
| G06 | Dwa konta Claude, agent A konto 1, agent B konto 2 | **atrapa ok / Ty** | W5 P01–P09: pula kont, przypięcie konta do agenta, limit. Dwa prawdziwe konta Claude: Ty |
| G07 | Przejście przy limicie na prawdziwych kontach | **atrapa ok / Ty** | W5 P04–P09 (limit z atrapy: przejście na drugie konto, potem model zapasowy z dostawcy wg BE7, powrót po resecie). Naturalny limit na prawdziwych kontach: brak, Ty |
| G08 | Klucz API wpisany w programie; tura „OK”; skan bez jawnego klucza | **atrapa ok / Ty** | W5 K01–K04 na atrapie sprawdzania klucza: wpis, test, brak jawnego klucza w logach i bazie. Prawdziwy klucz: Ty |
| G09 | Aktualizacja + przypięcie na prawdziwym nowszym wydaniu | **ok (Codex)** | I08: przypięcie 0.168.0 → pobrane i działa (0.168.0) → odpięcie i aktualizacja → 0.169.0 działa; bez nowej karty po pierwszej zgodzie; 32 s dwa prawdziwe pobrania. Claude: pobranie ok (I09), przypięcie nie przechodziłem |
| G10 | Ollama / LM Studio jeśli zainstalowane | **atrapa ok / pominięte** | W5 E01–E06 na atrapie serwera loopback (lista modeli, test, wybór modelu). Prawdziwej Ollama / LM Studio nie sprawdzałem (nie zakładam, że jest) |
| G11 | Wspólnicy podpinają subskrypcje sami, bez instrukcji | **Ty** | obserwacja człowieka; ekrany logowania z I10 wyglądają jak wyżej |
| G12 | Warunki planów ChatGPT i Claude przeczytane przed pulą | **Ty** | jedno zdanie w kanale |

## 3. Usterka blokująca: przełączanie wersji CLI (naprawiona)

Przy przypięciu starszej wersji, a potem powrocie do nowszej, program zgłaszał `EPERM unlink ...\cli\codex\0.169.0\codex.exe`. Windows nie pozwala skasować uruchomionego pliku, a program kasował folder wersji bez sprawdzania.
Naprawa w `src/backend/managed-cli.ts`: zanim skasuje, porównuje sumę SHA-256 pliku na dysku z oczekiwaną; jeśli jest identyczny (pobranie już raz zweryfikowane), używa go ponownie; jeśli to inny plik, który nie da się usunąć, zgłasza zrozumiały komunikat „still running” i zostawia działającą wersję. Dwa nowe testy w `managed-cli.test.ts`. Na przebudowanym instalatorze I08 przechodzi (0.168.0 i z powrotem 0.169.0).

## 4. Kroki P10b i P11b (okno W5) i test pilnujący sieci

- **P10b:** agent bezczynny: proces CLI zatrzymany po czasie bezczynności; kolejna wiadomość uruchamia nowy proces (identyczny wątek).
- **P11b:** próba z telefonu / zdalnego serwera do kont, kluczy, punktów końcowych i dostawców: każdy kanał odmówiony, bez wycieku i bez użycia rejestru. Test jednostkowy `src/main/local-only-ipc.test.ts` (6 testów) obejmuje kanały `registerApiKeysIpc`, `registerEndpointsIpc`, `registerSubscriptionsIpc`, `registerProviderIpc` dla 4 identyfikatorów nielokalnych. Do tego mała zmiana `ipcRegistry` w `trusted-ipc.ts` (bez `vi.mock`, którego reguła lint zabrania).
- F02 i F03 dopasowane do kontraktu BE7 (`chain`, `providerScope`, warstwy się dodają: własna → dostawcy → ogólna).

## 5. Testy końcowe

| Co | Wynik |
|---|---|
| `sandbox-installed.ts` na zainstalowanym programie | 10/10 ok |
| `sandbox:e2e` na końcowym kodzie | **30 ok, 0 FAIL, 0 findings** |
| `COSGRAL_MODE=w5` na końcowym kodzie | **27/27 ok**, 0 błędów konsoli |
| `bun run lint` (779 plików), `typecheck:node`, `typecheck:renderer` | zielone |
| `managed-cli.test.ts`, `local-only-ipc.test.ts` | zielone, 18/18 |

## 6. Czego brakuje i co znalazłem „przy okazji”

1. **Piaskownica nie izoluje prawdziwych CLI.** Prawdziwy Codex/Claude pytają Windows o folder domowy i ignorują `USERPROFILE`, więc w piaskownicy widzą Twoje prawdziwe logowania (zdarzyło się przy drugim starcie: konta systemowe pokazane jako zalogowane, w ostatnim przebiegu nie). Nie czytałem żadnych plików logowania i niczego nie wysłałem do modelu. Rozwiązanie na później: przełącznik tylko dla testów, który ignoruje CLI z systemu i prawdziwy folder domowy.
2. **I10 otwiera Twoją domyślną przeglądarkę** na prawdziwych stronach logowania (OpenAI, Claude). Nic tam nie wpisywałem; po zakończeniu krok anulował logowanie i usunął konto testowe. Po przebiegu nie znalazłem procesów pomocniczych logowania ani nasłuchu na porcie 1455.
3. Surowy prefiks IPC w komunikatach błędu (np. przy przekroczeniu limitu kont albo `setFallbackModels` w `ProvidersPage`): do wycięcia.
4. Dwie karty pod rząd po „returned” z limitem: do sprawdzenia.
5. Karta zgody pobrania nie podaje rozmiaru (365 MB), choć jest znany.
6. Instalator nie jest podpisany: SmartScreen może ostrzegać.
7. Nie sprawdzałem: czystego konta Windows, prawdziwych tur z modelem, prawdziwego limitu, Ollama / LM Studio, przypięcia Claude, pełnego `bun run check` (lider).

## 7. Plan na kolejne godziny (raport 14:00)

| Kiedy | Co | Efekt |
|---|---|---|
| teraz–12:00 | Przekazanie G2b liderowi (gałąź, SHA, raport); lint i typecheck | gotowe do scalenia |
| 12:00–13:00 | Wycięcie surowego prefiksu IPC w błędach `ProvidersPage` i rozmiar na karcie zgody (z testami) | drobne naprawy UI/backendu |
| 13:00–14:00 | Przełącznik testowy „bez prawdziwego domu i CLI z systemu” + krok z prawdziwym CLI w piaskownicy | bezpieczne testy prawdziwych CLI |
| na 14:00 | Raport: co scalone, co zrobione z listy wyżej; plan G2 na czystym koncie (G03–G08, G11, G12) do wykonania przez Ciebie | decyzja, kto robi czyste konto |

Co potrzebuję od Ciebie: **drugie konto Windows z prawami administratora albo wskazanie osoby**, która przejdzie `docs/cosgral/T2-odbior-czysty-windows.md` (G03–G08, G11, G12). Bez tego G2 zostaje otwarte.
