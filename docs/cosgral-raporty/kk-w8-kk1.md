# KK Fullstack W8-KK1: przestrzenie klientów

Data: 16.11.2026. Gałąź `team/kk/w8-kk1` (od integracji `61799a63c`). Spec: `spec-w8.md` §1D, W8-20…24; decyzje lidera Q5, Q9, Q10. Tylko testy jednostkowe, bez Electrona.

## Wynik w jednej linii

**Przestrzeń klienta to osobny folder danych z własną bazą SQLite i własnym „domem” agentów; program działa na jednej przestrzeni naraz, a przełączenie zapisuje wybór i restartuje program na wybranej. Kontrakt i mock są w osobnym pierwszym commicie `d6d7c6938`; silnik (rejestr, foldery, IPC, wpięcie w `main`) i testy w drugim. `agent-service.ts` nietknięty.**

## 1. Decyzja: osobne pliki, nie filtr wierszy

| | Osobny folder danych + restart (wybrane) | Jedna baza i filtr `space_id` |
|---|---|---|
| Wyciek przez zapomniany filtr | niemożliwy: druga baza nie jest otwarta | możliwy w każdym zapytaniu, w każdym pliku, także cudzym |
| Vault, MCP, konta CLI, pamięć, profil przeglądarki (ciasteczka) | osobne „z natury” (leżą w folderze danych) | każda tabela i plik trzeba osobno oznaczyć |
| Foldery robocze agentów | osobny „dom” per przestrzeń | osobna logika ścieżek |
| Koszt | przełączenie = restart programu (kilka sekund, tury w toku się kończą) i kopie CLI per przestrzeń | brak restartu, ale zmiany w `agent-service.ts` i w każdym magazynie |

Mocnego argumentu za filtrem nie ma. Konsekwencja dla Q10: lista serwerów MCP jest osobna dla każdej przestrzeni, więc „klient A nie widzi serwerów klienta B” wynika z konstrukcji. Wspólne (globalne) serwery z allowlistą to osobna, jawna funkcja: nie zbudowana.

## 2. Jak to leży na dysku

```
<AppData>\COSGRAL Workspace             przestrzeń „Main”: dane, które program już ma (niczego nie przenoszę ani nie kopiuję)
<AppData>\COSGRAL Workspace Spaces\
    spaces.json                          lista przestrzeni i wybór
    <id>\data                            userData przestrzeni (baza, Vault, MCP, konta, profil Chromium)
    <id>\home                            „dom” przestrzeni: <id>\home\COSGRAL Workspace\Bots, Shared, Downloads
```
- Folder przestrzeni jest **obok** danych głównych, nie w nich: „Delete my data” w przestrzeni Main nie rusza danych klientów (test), a wewnątrz przestrzeni klienta strażnik czyszczenia odmawia jej folderów (test), więc nic nie zostanie skasowane przez pomyłkę.
- Przy starcie `main/index.ts` (kilka linii przed `enableSandbox`) wybiera przestrzeń z `spaces.json`, ustawia `userData` na jej folder i podaje jej „dom” do `BotStore` i do ścieżek czyszczenia (zamiast `homedir()`). Brak wybranej przestrzeni (zarchiwizowana, folder usunięty ręcznie) = start na Main i zdanie w `problem`. Uszkodzony `spaces.json` jest odkładany obok (`.damaged-…`), program idzie na Main, foldery danych zostają nietknięte.
- Identyfikator przestrzeni jest nazwą folderu. Program go **tworzy** jako 12 znaków szesnastkowych (`randomBytes(6).toString("hex")`, czyli `[0-9a-f]{12}`), a parser **przyjmuje** `main` albo `^[a-z0-9][a-z0-9-]{5,39}# KK Fullstack W8-KK1: przestrzenie klientów

Data: 16.11.2026. Gałąź `team/kk/w8-kk1` (od integracji `61799a63c`). Spec: `spec-w8.md` §1D, W8-20…24; decyzje lidera Q5, Q9, Q10. Tylko testy jednostkowe, bez Electrona.

## Wynik w jednej linii

**Przestrzeń klienta to osobny folder danych z własną bazą SQLite i własnym „domem” agentów; program działa na jednej przestrzeni naraz, a przełączenie zapisuje wybór i restartuje program na wybranej. Kontrakt i mock są w osobnym pierwszym commicie `d6d7c6938`; silnik (rejestr, foldery, IPC, wpięcie w `main`) i testy w drugim. `agent-service.ts` nietknięty.**

## 1. Decyzja: osobne pliki, nie filtr wierszy

| | Osobny folder danych + restart (wybrane) | Jedna baza i filtr `space_id` |
|---|---|---|
| Wyciek przez zapomniany filtr | niemożliwy: druga baza nie jest otwarta | możliwy w każdym zapytaniu, w każdym pliku, także cudzym |
| Vault, MCP, konta CLI, pamięć, profil przeglądarki (ciasteczka) | osobne „z natury” (leżą w folderze danych) | każda tabela i plik trzeba osobno oznaczyć |
| Foldery robocze agentów | osobny „dom” per przestrzeń | osobna logika ścieżek |
| Koszt | przełączenie = restart programu (kilka sekund, tury w toku się kończą) i kopie CLI per przestrzeń | brak restartu, ale zmiany w `agent-service.ts` i w każdym magazynie |

Mocnego argumentu za filtrem nie ma. Konsekwencja dla Q10: lista serwerów MCP jest osobna dla każdej przestrzeni, więc „klient A nie widzi serwerów klienta B” wynika z konstrukcji. Wspólne (globalne) serwery z allowlistą to osobna, jawna funkcja: nie zbudowana.

## 2. Jak to leży na dysku

```
<AppData>\COSGRAL Workspace             przestrzeń „Main”: dane, które program już ma (niczego nie przenoszę ani nie kopiuję)
<AppData>\COSGRAL Workspace Spaces\
    spaces.json                          lista przestrzeni i wybór
    <id>\data                            userData przestrzeni (baza, Vault, MCP, konta, profil Chromium)
    <id>\home                            „dom” przestrzeni: <id>\home\COSGRAL Workspace\Bots, Shared, Downloads
```
- Folder przestrzeni jest **obok** danych głównych, nie w nich: „Delete my data” w przestrzeni Main nie rusza danych klientów (test), a wewnątrz przestrzeni klienta strażnik czyszczenia odmawia jej folderów (test), więc nic nie zostanie skasowane przez pomyłkę.
- Przy starcie `main/index.ts` (kilka linii przed `enableSandbox`) wybiera przestrzeń z `spaces.json`, ustawia `userData` na jej folder i podaje jej „dom” do `BotStore` i do ścieżek czyszczenia (zamiast `homedir()`). Brak wybranej przestrzeni (zarchiwizowana, folder usunięty ręcznie) = start na Main i zdanie w `problem`. Uszkodzony `spaces.json` jest odkładany obok (`.damaged-…`), program idzie na Main, foldery danych zostają nietknięte.
 (`ipc-spaces.ts`): 6–40 małych liter, cyfr i myślników, bez myślnika na początku. Odrzuca wszystko, co mogłoby wyjść z folderu (`..`, ukośniki, wielkie litery). Poprawione 16.11 (W8-BE1, L9 z przeglądu W6-T4): wcześniej raport opisywał generator jako `[a-z0-9]`, a kontrakt jest szerszy.
- **Usuwanie** (po `confirm: true`): kasuje wyłącznie `<Spaces>\<id>`, odmawia dla Main, dla przestrzeni, na której program działa lub która jest wybrana, i dla folderu, który jest dowiązaniem/junction (nic za nim nie jest kasowane; test).

## 3. Kontrakt (commit `d6d7c6938`) i IPC

`window.openbot.spaces` (opcjonalne): `list`, `create`, `rename`, `archive`, `restore`, `delete({id, confirm})`, `switch({id, confirm})`, `describe`. Zdarzenie `spaces-changed` z całą listą. `SpaceList`: `runningId` (przestrzeń, na której program działa teraz: to jej nazwę pokazuje szyna), `selectedId` (po przełączeniu do restartu inna), `problem`. `SpaceDescription`: `separateFolder`, `isolated` (agents, files, vault, browser, mcp, memory), `hasData`, `sizeBytes`. Limity: 20 przestrzeni, nazwa do 60 znaków i unikalna, „Main” zajęte. `delete` i `switch` bez prawdziwego `true` są odrzucane przez parser, zanim program cokolwiek zrobi. Kanały `spaces:*` tylko dla tego komputera (obcy serwer i telefon dostają odmowę; dopisane do `local-only-ipc.test.ts`).

`switch` zapisuje wybór, odpowiada z listą i po ok. 150 ms zleca restart (`main`: zatrzymanie agentów i serwerów jak przy czyszczeniu danych, potem `app.relaunch()`; zmienna `COSGRAL_SPACE_NO_RELAUNCH=1` dla testów w piaskownicy). Wybór uruchomionej przestrzeni nie restartuje niczego.

**Dla UI:** nazwę przestrzeni w szynie bierze się z `list().spaces.find(running)`; przełącznik to osobny obiekt niż serwer/zespół (Q5). Przy `switch` pokazać potwierdzenie „program się zrestartuje, trwające tury zatrzymają się”. Po restarcie okno ładuje się na wybranej przestrzeni samo.

## 4. Testy

| Plik | Co | Wynik |
|---|---|---|
| `ipc-spaces.test.ts` (kontrakt) | identyfikatory, nazwy, strażnik listy (jedna uruchomiona, jedna wybrana), opis, parsery z `confirm`, zdarzenie w `AgentEvent` | 6/6 |
| `mock-spaces.test.ts` | te same reguły w mocku | 8/8 |
| `space-store.test.ts` | Main bez śladu na dysku, katalog obok danych, tworzenie, unikalność i limit, brak współdzielonych folderów, wybór i restart, rename/archiwum po restarcie, ochrona Main i uruchomionej przestrzeni, usuwanie tylko własnego folderu, odmowa dla dowiązania, złe identyfikatory, brak wybranej przestrzeni, uszkodzona lista, opis | 15/15 |
| `space-isolation.test.ts` (**W8-22, G5 po stronie danych**) | prawdziwe bazy: agent, login w Vault, serwer MCP z sekretem i plik agenta z przestrzeni A nie ma ani w B, ani w Main (listy i **ani jednego bajtu** w ich folderach), po restarcie A jest cała; strażnik czyszczenia | 3/3 |
| `spaces-ipc.test.ts` | prawdziwy magazyn z zaufaniem okna: tworzenie, odmowy (nazwa, id, inny serwer, niezaufana strona), potwierdzenia, przełączenie raz i po odpowiedzi, powrót bez restartu | 5/5 |
| `local-only-ipc.test.ts` | 8 kanałów `spaces:*` odmawia obcym serwerom i telefonowi | 6/6 |
| `src/main`, kontrakty, `stories` razem (+ powyższe) | | 54 pliki, 281/281 |
| `bun run lint` (872 pliki), `typecheck:node`, `typecheck:renderer` | | zielone |

## 5. Prośby do Backendu (hooki), czego nie sprawdziłem

1. **Nic w `agent-service.ts` nie jest potrzebne** do izolacji danych. Dwie rzeczy do rozważenia później, nie blokują: (a) przy zmianie przestrzeni „wiersz agenta” i karty „Needs you” przeładują się same przez restart; (b) domyślny poziom `working-folder` dla agentów zaimportowanych ze szablonu (Q9) wpina Backend w poziomach dostępu (W8-BE1), bo to jego kontrakt.
2. **CLI i konta są osobne per przestrzeń** (leżą w folderze danych): każda przestrzeń pobiera własne CLI (ok. 365 MB Codex) i ma własne logowania. Bezpieczne, ale kosztuje dysk. Wspólny, tylko do odczytu katalog binariów CLI to jedna linia w `createManagedCli`, ale zmienia model logowań, więc nie robiłem bez decyzji.
3. **Nie uruchamiałem Electrona:** prawdziwy start na folderze przestrzeni, `app.setPath("userData")` przed gotowością, blokada pojedynczej instancji po `relaunch` (nowa ścieżka danych = inna blokada, więc nowy proces nie zostanie uznany za duplikat; z lektury kodu i dokumentacji Electrona, nie z uruchomienia) oraz restart z przełącznika **nie były sprawdzone w oknie**. To pierwszy krok odbioru po `GO-W6.txt`.
4. **Brak izolacji OS** (to W8-BE2): przestrzeń to osobne foldery i baza, ale proces agenta (CLI, ACP, MCP) nadal ma prawa użytkownika Windows i może dojść do cudzych folderów, dopóki nie dojdzie piaskownica procesów. Izolacja jest więc **danych programu**, nie systemu operacyjnego.
5. Profil przeglądarki agenta i ciasteczka są osobne, bo siedzą w folderze `userData`; sprawdzone tylko przez rozmieszczenie folderów (test), nie w prawdziwej przeglądarce.
6. Windows: prawdziwych dowiązań (junction) użyłem w teście usuwania; na maszynie bez prawa ich tworzenia ten test się pomija po cichu.
7. Decyzje do potwierdzenia: limit 20 przestrzeni; przełączenie wymaga restartu (nie ma jednoczesnych dwóch przestrzeni); nazwa „Main” zarezerwowana; przestrzeni Main nie można zmienić nazwy.
8. Konflikty przy scalaniu: `ipc-channels.ts`, `ipc-conversation.ts`, `ipc-desktop-apis.ts`, `ipc.ts`, `preload/index.ts`, `mock-openbot.ts`, `main/index.ts`, `local-only-ipc.test.ts`: zostawić obie strony.
