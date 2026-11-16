# KK Fullstack W5-G3b: odbiór integracji w oknie i aktualizacja instalatora na wierzch

Data: 16.11.2026. Gałąź `team/kk/w5-g3b` (od integracji `b516ac19f`: G2b, BE7/UI6, BE8/UI7, UI8, W5-G3 i W6-BE2). Ciężkie polecenia po znaku `GO-G3.txt`, jedno naraz.

## Wynik w jednej linii

**Nowy instalator (`COSGRAL Workspace-0.2.0-x64.exe`, 108 MB, zbudowany 12:40) został zainstalowany na wierzch poprzedniego: dane i pobrane CLI zostały bez zmiany (6 plików porównanych po SHA-256), Codex 0.169.0 i Claude 2.1.325 uruchamiają się, bez nowej karty pobrania i bez błędów konsoli. Kroki W5 na integracji przeszły (28/28, po dodaniu kroków UI8 końcowo 29/29), `sandbox:e2e` 30 ok / 0 FAIL / 0 findings. `sandbox-installed.ts`: za drugim razem 10/10, za pierwszym 9/10 (I10, przejściowo, patrz pkt 3).**

## 1. Wyniki

| Krok | Wynik | Dowód |
|---|---|---|
| `bun run build` na `b516ac19f` | zielone | `kk-g3b-build.log` |
| `sandbox:e2e` (1. przebieg) | 29 ok / **1 FAIL** | „every read-only call answers: context.getState”. Przyczyna po mojej stronie (W6-BE2): przegląd tylko-do-odczytu wywołuje metody bez argumentów, a `context.getState` odmawia bez identyfikatora agenta (celowo). Poprawka w skrypcie (`89838d997`), nie w programie |
| `sandbox:e2e` (po poprawce) | **30 ok / 0 FAIL / 0 findings** | `kk-g3b-e2e2.log` |
| Kroki W5 (`COSGRAL_MODE=w5`) | **28/28 ok**, 0 błędów konsoli (z F02n) | `kk-g3b-w5.log` |
| Kroki UI8 dopisane (`4b0b932ec`) | F02n sprawdza też spokojną kartę „Connection problem” (bez „limit” i „Continue”, zamykana), nowy F03r przełącznik „Return to the first account after the limit resets” (domyślnie włączony, zapis „wyłączony” i z powrotem, limit zostaje): **2/2 ok** | `kk-g3b-ui8.log` |
| Pełny przebieg W5 z krokami UI8 (końcowy kod) | **29/29 ok**, 0 błędów konsoli | `kk-g3b-w5b.log` |
| `bun run dist:win` | zielone, instalator 108 054 025 B | `kk-g3b-dist.log` |
| Instalacja cicha na wierzch (`/S`, bieżący użytkownik, bez UAC) | exit 0 w 20 s | archiwum programu zmienione: `…0d9b725835` → `…ed71731551` |

## 2. Aktualizacja: dane zostają (`scripts/sandbox-update.ts`)

Profil: kopia profilu z poprzedniego przebiegu instalowanego programu (pobrany Codex 0.169.0, Claude 2.1.325, ukończony pierwszy start, jeden agent). Faza „przed” zapisana przed instalacją, faza „po” po niej.

| # | Sprawdzenie | Wynik |
|---|---|---|
| U01 | profil ma CLI i ustawienia do ochrony, program zapisany | ok (3 pliki CLI + 3 ustawień) |
| U02 | instalator podmienił program (inna kompilacja), nadal folder użytkownika | ok |
| U03 | pliki danych: CLI i ustawienia identyczne (rozmiar i SHA-256) przed startem programu | ok, 6 plików: nic nie zginęło, nic się nie zmieniło |
| U04 | zaktualizowany program startuje prosto do głównego okna (bez ekranu pierwszego uruchomienia) | ok |
| U05 | pobrane CLI są i działają: źródło „managed”, bez karty pobrania | ok: Codex 0.169.0, Claude 2.1.325 |
| U06 | agent z profilu przetrwał, rozmowa się czyta | ok (1 agent) |
| U07 | 0 błędów konsoli | ok |

Program **zostawiłem zainstalowany w nowej wersji** (`%LOCALAPPDATA%\Programs\cosgral-workspace\`).

## 3. `sandbox-installed.ts` po aktualizacji

- 1. przebieg: **9/10**, I10 (start logowania Codex i Claude) nie przeszedł: „Claude CLI was found but could not be started”. Zaraz po tym `claude.exe --version` działał (0,4 s).
- 2. przebieg (nowy profil): **10/10 ok, 0 błędów konsoli**, w tym prawdziwe pobrania (Codex 0.169.0 w 19 s, Claude 2.1.325 w 20 s, przypięcie 0.168.0 i powrót, ekrany logowania OpenAI i Claude, zatrzymanie na nich).
- Wniosek: przejściowe, najpewniej pierwsze uruchomienie świeżo pobranego pliku 372 MB (skan antywirusa) trwało dłużej niż limit odczytu wersji. **Usterka do naprawienia (niezablokowana):** `resolveClaudeCli` połyka przyczynę (limit czasu, odmowa dostępu) i pokazuje zawsze „found but could not be started”, a login nie ponawia. Warto: ponowić start po krótkiej przerwie i pokazać powód.

## 4. Czego nie sprawdziłem

1. Aktualizacji z **innej wersji numeru** (stara i nowa mają to samo `0.2.0`; archiwum różne, więc podmiana jest realna).
2. Odinstalowania po aktualizacji i prawdziwego profilu właściciela: nie uruchamiałem zainstalowanego programu na jego profilu (żadnych logowań ani danych właściciela).
3. Czystego konta Windows i prawdziwych logowań (tylko właściciel).
4. Kroku UI8 w Storybook (to praca UI), pełnego `bun run check`, SmartScreen (instalator bez podpisu).
5. Po przebiegach nie zostały procesy programu ani pomocnicze procesy logowania (sprawdzone na końcu).
