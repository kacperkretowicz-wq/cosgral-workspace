# Uruchomienie programu i podpięcie Linuksa (Oracle): plan KK-Z

Stan: 18.11.2026, integracja `codex/cosgral-desktop` @ `5ac646674` plus gałąź `team/kk/w12-y`. Czytałem tylko kod, nic nie uruchamiałem (ciche okno, `GO-lead-check.txt`). Liczby czasu to **moje oszacowania**, nie pomiary.

**Wynik w jednej linii:** program na Windows da się uruchomić już dziś (pkt 1). Linux da się podpiąć na dwa sposoby; szybszy to **ten sam program na Linuksie w oknie wirtualnym** (pkt 2A), a docelowy to **tryb bez okna** (pkt 2B), którego jeszcze nie ma i który trzeba zbudować.

## 1. Uruchomienie na Windows (dziś)

| Sposób | Komenda / plik | Do czego |
|---|---|---|
| Codzienny | `start-cosgral.cmd` (opis: `README_URUCHOMIENIE.md`, `PRZEWODNIK.md` sekcja 2) | praca na Twoim komputerze |
| Piaskownica | `start-cosgral-sandbox.cmd` | testy bez ruszania danych OpenBota |
| Instalator | `bun run dist:win` (NSIS, x64) | instalacja jak zwykły program |

**Czego nie ma:** instalatora dla Linuksa (`electron-builder.yml` i skrypty `dist:*` mają tylko Windows i macOS).

## 2. Linux: dwie drogi

### 2A. Szybka: ten sam program na Linuksie (ok. 1–2 dni, ryzyko średnie)

Pomysł: uruchomić zwykłą aplikację na serwerze Oracle w wirtualnym ekranie (Xvfb), włączyć w niej „hostowanie” (to, co dziś robi `team-api-server.ts`), a z Windowsa dołączyć jak do zdalnego serwera.

1. **Zbudować pakiet Linux:** dodać cel `--linux` (AppImage lub `deb`) do `electron-builder.yml` i skrypt `dist:linux`. Architektura serwera Oracle „Ampere” to `arm64`, więc cel `arm64`.
2. **Brak magazynu kluczy:** program szyfruje sekrety przez `safeStorage` Electrona (`src/main/index.ts` ok. linii 1520). Na serwerze bez pulpitu nie ma pęku kluczy, więc `safeStorage.isEncryptionAvailable()` zwróci fałsz. Trzeba dodać zapasowy sposób (klucz z pliku o prawach 600 albo ze zmiennej środowiskowej). **To jedyna zmiana w kodzie, która jest tu konieczna.**
3. **Uruchomienie:** `xvfb-run` + usługa `systemd` (restart po awarii).
4. **Dołączenie z Windowsa:** zaproszenie (`inviteUrl`) w oknie „Dołącz do serwera” (jest, `JoinServerDialog`).
5. **Co sprawdzić najpierw (spike, ok. 2–3 h):** czy program startuje na Linuksie `arm64` i czy włączone hostowanie wystawia API na porcie, do którego da się dojść.

**Minusy:** waży więcej (Electron plus Xvfb), nie ma wygodnego sterowania z linii poleceń, a część funkcji (Computer Use, zdalny pulpit, oczy) ma sens tylko z ekranem Windows.

### 2B. Docelowa: tryb bez okna (ok. 4–7 dni, ryzyko wyższe)

Pomysł: osobny punkt wejścia (np. `src/headless/main.ts`) uruchamiany zwykłym Node, bez Electrona.

**Fakty z kodu, które to ułatwiają:**
1. `src/backend` ma 146 plików, z czego **tylko jeden importuje Electrona** (`browser-host.ts`, przeglądarka agenta).
2. Baza to `node:sqlite` (wbudowana w Node, bez modułu natywnego), więc nic nie trzeba kompilować pod `arm64`.
3. Serwer HTTP dla zespołu już jest w `src/main/team-api-server.ts` (1186 linii, `node:http`).
4. Z 76 plików `src/main` Electrona importuje **8** (`index.ts`, okna rozmowy, dok, oczy, przechwyt pulpitu, `trusted-ipc`, `data-ipc`, `maintenance-service`).

**Fakty, które to utrudniają:**
1. Całe „sklejenie” usług siedzi w `src/main/index.ts` (**2768 linii**). Tryb bez okna to wydzielenie z niego tego, co nie dotyczy okien, albo napisanie drugiego, mniejszego pliku sklejającego.
2. Magazyn kluczy jak w 2A pkt 2.
3. Ekrany i IPC idą przez okno. Zdalny klient musi dostać to samo przez sieć. Droga częściowo jest: klient webowy telefonu (`/app`) i API zespołu, ale pełnego odpowiednika `window.openbot.*` przez sieć **nie ma**.

**Kroki:**
1. Wydzielić „rdzeń” bez Electrona z `index.ts` do `src/main/core.ts` (ok. 2 dni). Okno i tryb bez okna wołają ten sam rdzeń.
2. Punkt wejścia `src/headless/main.ts`, konfiguracja z pliku, token, nasłuch tylko na `127.0.0.1` (ok. 1 dzień).
3. Zapasowy magazyn kluczy (ok. 0,5 dnia).
4. Tunel do serwera: **SSH `-L`** albo Tailscale (jest instrukcja w panelu telefonu), nic nie wystawiamy publicznie (ok. 0,5 dnia).
5. Paczka i usługa `systemd` na Oracle (ok. 0,5 dnia).
6. Odbiór: Windows dołącza do serwera, tworzy agenta, wysyła wiadomość (ok. 1 dzień, z Testerem).

## 3. Oracle: co jest po Twojej stronie

1. Konto Oracle Cloud i maszyna „Always Free” (wg oficjalnej dokumentacji Oracle, strona „Always Free Resources” z 12.06.2026: **2 rdzenie Ampere `arm64` i 12 GB pamięci**, nie więcej; szczegóły i ryzyko odebrania bezczynnej maszyny: `serwer-linux-oracle.md`).
2. Reguły sieci: otwarty tylko SSH. API programu zostaje na `127.0.0.1` i idzie tunelem.
3. Klucze SSH. Nie wklejaj ich w czat ani do repo; powiem, gdzie je wpiąć.
4. Zgoda na pobranie programów dostawców (Claude, Codex) na serwer i **logowanie do nich robisz Ty** (konta są Twoje).

## 4. Moja rekomendacja

1. **Teraz:** spike 2A pkt 5 (2–3 h). Pokaże, czy w ogóle jest sens iść szybką drogą, i da pierwszy działający serwer.
2. **Równolegle:** dodać zapasowy magazyn kluczy (potrzebny w obu drogach, niski koszt).
3. **Potem decyzja:** zostać przy 2A, jeśli działa wystarczająco, albo wydzielać rdzeń (2B).
4. **Nie robić:** wystawiania API w internecie bez tunelu, serwerów hostowanych w chmurze, logowania do Twoich kont przez agentów.

## 5. Czego nie sprawdziłem

1. Nie uruchamiałem programu na Linuksie (nie mam tam maszyny) ani nie budowałem pakietu Linux.
2. Nie sprawdziłem, czy `electron-builder` w tej wersji buduje `arm64` dla Linuksa bez dodatkowych zależności.
3. Nie sprawdziłem, czy włączone hostowanie działa bez ekranu.
4. Estymaty godzin są moją oceną z liczby plików i wcześniejszych etapów.
