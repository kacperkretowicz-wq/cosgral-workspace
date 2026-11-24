# Prawdziwe okno programu w kontenerze Linux (23.11.2026)

Gałąź `claude/festive-pasteur-5oh1yh`. Pierwszy raz w kontenerze uruchomiono **cały program** (Electron, proces główny, silnik,
prawdziwe okno), a nie Storybook. Wszystko w piaskownicy z atrapą Codexa (`src/backend/testing/channel-codex.cjs`), bez modelu,
konta i sieci. To nie zastępuje odbioru na Windows: platformowe funkcje (zdalny pulpit, izolacja, głosy Windows, `.exe`) tu nie działają.

## Jak uruchomić (tylko kontener, nie commitować uprzęży)

Chromium odmawia własnego sandboksa, gdy proces działa jako root, a program woła `app.enableSandbox()`, więc procesy potomne padają
(stąd wcześniejsze „puste okno”). Kodu programu nie zmieniamy: sandbox jest celowym zabezpieczeniem. Zamiast tego uprząż **poza
repozytorium** wyłącza go tylko w tym uruchomieniu:

```js
// /tmp/cg/harness/main.cjs (obok: package.json z "name": "cosgral-workspace", "main": "main.cjs")
const { app } = require("electron");
app.enableSandbox = () => undefined;
app.commandLine.appendSwitch("no-sandbox");
require("/home/user/cosgral-workspace/out/main/index.js");
```

```sh
bun run build
# Krótka ścieżka TMPDIR: gniazdo Chromium w długiej ścieżce scratchpadu przekracza limit Uniksa.
env -u NODE_OPTIONS ELECTRON_DISABLE_SANDBOX=1 HOME=<piaskownica>/home XDG_CONFIG_HOME=<piaskownica>/home/.config TMPDIR=/tmp/cg/t \
  OPENBOT_CODEX_PATH=<piaskownica>/fixture/codex OPENBOT_CLAUDE_PATH=<piaskownica>/fixture/missing-claude \
  xvfb-run -a -s "-screen 0 1440x900x24" node_modules/electron/dist/electron /tmp/cg/harness \
  --no-sandbox --disable-gpu --disable-dev-shm-usage --remote-debugging-port=9333
```

`<piaskownica>/fixture/codex` to skrypt: `ELECTRON_RUN_AS_NODE=1 exec <repo>/node_modules/electron/dist/electron <piaskownica>/fixture/codex.cjs "$@"`.
Okno steruje się przez CDP (`playwright` `chromium.connectOverCDP("http://127.0.0.1:9333")`); główne okno to strona o adresie
`openbot-app://app/index.html` (druga, `#island`, to pływająca wyspa).

## Co przeszło w prawdziwym oknie

| Ścieżka | Wynik |
|---|---|
| Kreator: „Use this computer”, dostawca Codex (atrapa wykryta jako „Available”), język polski, pierwszy agent z szablonu | działa |
| Rozmowa: wybór modelu, wybór specjalności, wysłanie, odpowiedź atrapy, kroki agenta | działa |
| Kanał: menu „+” → „Nowy kanał”, utworzenie z prowadzącym, wiadomość, wynik prowadzącego w kanale | działa |
| Strony: Przepływy, Zadania (5 kolumn), Zużycie, Biblioteka (8 zakładek), Harmonogram, Katalog dodatków, Zdalny pulpit, Dostawcy, Telefon, Ustawienia serwera, okno Ustawień, ustawienia agenta | otwierają się, bez błędów konsoli |
| Skan napisów: każde zdanie z co najmniej 3 słowami, angielskie i bez polskich liter, na wszystkich powyższych widokach | po poprawkach niżej: 0 w Bibliotece, Harmonogramie, Ustawieniach serwera; reszta poprawiona |

## Błędy znalezione w oknie i naprawione (z testami)

1. Po kreatorze z pierwszym agentem otwierała się strona „Nowy agent” zamiast rozmowy (strona otwarta przez program przy pustej
   liście nie zamykała się, gdy agent się pojawił). `App.tsx`, 2 testy.
2. Po polsku wybór specjalności z listy nigdy nie trafiał w gotowy profil (szukanie po przetłumaczonej etykiecie), więc szła ścieżka
   awaryjna z angielską wiadomością. `Conversation.tsx` mapuje odpowiedź na klucz; pierwsza wiadomość w języku okna. 1 test.
3. „3 kroków” zamiast „3 kroki”: liczba kroków przez `tn()`. Test form 1/2–4/5+/22.
4. Po angielsku w polskim oknie: szablony agentów (nazwy, role, opisy) na stronie „Nowy agent”, w ustawieniach agenta i w kreatorze;
   rola agenta na liście; „New thread”; powód raportu zużycia; „Codex (this computer)”; powód zdalnego pulpitu; status CLI
   dostawcy („Not installed: …”); powód izolacji; zdanie o głosach Windows; zdanie o aktualizacjach. Nowe `tDataParts()` tłumaczy
   zdania sklejane przez silnik część po części. Testy: `contract-messages` (powody zużycia), `i18n-parts`.
5. Liczba członków kanału wyglądała jak znacznik nieprzeczytanych: ikona osób przy liczbie.

## Druga runda (ten sam dzień)

| Ścieżka | Wynik |
|---|---|
| Przepływ: nowy, wyzwalacz + agent, połączenie, zapis, „Uruchom teraz”, historia (oba kroki „Zakończone”), wersja 1 | działa |
| Zadanie z kanału na tablicy Zadań (kolumna do przejrzenia, #projekt) | działa |
| Jasny motyw na wszystkich widokach | po poprawce niżej czytelny |
| axe w prawdziwym oknie (`color-contrast`, `button-name`, `label`, `aria-allowed-attr`, `nested-interactive`): 13 widoków × 2 motywy | 26/26 bez naruszeń |
| `test:visual` (7) i `test:storybook` (378, z axe) z lokalną konfiguracją Chromium | zielone |

Naprawione w tej rundzie: nowe kroki przepływu nachodziły na siebie (karty 260 px, odstęp 250 px) i miały tytuły „trigger”/„agent”;
podsumowanie wersji przepływu po angielsku („1 trigger, 1 agent step”, teraz „1 wyzwalacz, 1 krok agenta” z odmianą); aktywna
zakładka „Rozmowa” w kanale traciła kolor akcentu, a w jasnym motywie była biała na białym (przegrywała z ogólną regułą przycisków
drugorzędnych); opis wyłączonego przełącznika miał kontrast 1,8–2,3 (przygaszony razem z przełącznikiem); stany pobierania głosu
(„absent”) jako słowa.

## Czego to nie sprawdza

Windows (`.exe`, zdalny pulpit, izolacja procesów, głosy, Computer Use), prawdziwe modele i konta, komunikatory na żywo, telefon,
drugi komputer w zespole. Kolumna „O” w `parytet-0.71.md` nie została zmieniona: to dowód z Linuksa w kontenerze, a nie odbiór
Testera na Windows; decyzja, czy go liczyć, należy do lidera.
