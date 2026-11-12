# OpenBot 1:1: jak legalnie zdobyć backend (12.11.2026)

**Prośba właściciela:** program ma być identyczny jak OpenBot, „dosłownie to samo, a nawet lepszy”, a backend trzeba jakoś zdobyć.
**Autor:** Okiestrator (lider). **Status:** 12.11.2026 właściciel wybrał **drogę A** (licencja + dodatki, tylko na własny użytek). Plan: `2026-11-12-cosgral-openbot-plus.md` §0.
Ten dokument zastępuje część „silnik” w `2026-11-12-cosgral-engine-decision.md`.

## 1. Co ustaliłem (fakty ze źródła)

| Fakt | Źródło |
|---|---|
| Kod OpenBota jest publiczny: `github.com/nightly-labs/openbot` | strona repo |
| Wersje **do 0.1.11 włącznie są na Apache-2.0**. Licencję zmieniono na PolyForm Noncommercial w commicie `5f733c8` z 20.08.2026. | `LICENSE` w commicie `b74d7d2`, diff `5f733c8`, README sekcja „License and attribution” |
| Ostatni commit na Apache-2.0: `a6fe240209e58ffe5a5fc749d61f306a7218c326` (20.08.2026, wersja 0.1.11) | GitHub API |
| Wersje nowsze (do 0.68.0) wolno używać komercyjnie tylko z płatną licencją od Synthetify Labs sp. z o.o. | README, `openbot.run/commercial-license` |
| Licencja komercyjna (stan z 29.10.2026) pozwala instalować, uruchamiać i **modyfikować** OpenBota na własny użytek komercyjny. Zmiany należą do licencjobiorcy, ale **nie wolno ich dawać innym firmom**, chyba że zostaną przekazane twórcom. Nie wolno zmieniać nazwy ani logo OpenBot. Miejsce w licencji zajmuje człowiek, agenci AI się nie liczą. | `openbot.run/commercial-license` §2.1, §1.6, §6.2, §6.3 |
| Cennik z 12.11.2026: **licencja bezpłatna do 1.12.2026**. Potem Team (2 osoby w cenie, +10,80 € za każdą kolejną) kosztuje 25 €/mies. albo 18 €/mies. przy płatności rocznej. Starter (1 osoba) kosztuje 10 €/mies. albo 7,20 €/mies. przy płatności rocznej. Zakup: w OpenBocie Ustawienia → Rozliczenia albo `licenses@openbot.run`. | `openbot.run/pricing`, README |

## 2. Test S1: rdzeń OpenBota 0.1.11 (Apache) na tym PC

Kopia: `Shared\upstream\openbot-apache-0.1.11\openbot-a6fe240` (ZIP commitu `a6fe240`). Logi: `s1.log`, `s1-run.log`.

| Krok | Wynik |
|---|---|
| Rozmiar | 378 plików, około 50 tys. linii TS: backend 11,9 tys., proces główny 9 tys., UI SolidJS 24,1 tys., API kont 3,4 tys. |
| Stos | Electron 43, `node:sqlite`, Claude Agent SDK, klient Codex App Server, MCP SDK, serwer zespołu po WebSocket, noVNC, `electron-updater` |
| `bun install` (bun 1.3.11, przenośny w `Shared\tools\bun`) | OK, 219 s. Dla porównania Paperclip potrzebował 25 min. |
| `typecheck:node` | OK, 15 s |
| `build` (electron-vite) | OK, 22 s |
| `test:backend` | 29 z 96 testów przechodzi. Błędy są głównie środowiskowe: atrapa CLI Codex w testach to skrypt pod macOS (24×), a Windows blokuje plik SQLite przy sprzątaniu (`EBUSY`). CI autorów działało tylko na macOS. |
| Uruchomienie (folder domowy i AppData w piaskownicy) | Okno „OpenBot” po 4 s. Baza `openbot.db` utworzona i zmigrowana. Prawdziwe dane OpenBota nietknięte. |
| Znany brak | Część funkcji wymaga konta w chmurze OpenBot („Sign in to OpenBot first”). W naszej wersji trzeba to zastąpić własnym logowaniem. |

Nie sprawdzone: pełny przebieg agenta (Codex lub Claude) i instalator `dist:win`.

## 3. Dwie legalne drogi do „identyczny i lepszy”

| Kryterium | A. Licencja OpenBot + nasze dodatki | B. Własny program na bazie 0.1.11 (Apache) |
|---|---|---|
| Dosłownie ten sam program od dziś | ✓ | — |
| Wszystkie funkcje 0.68 bez przepisywania | ✓ | — |
| Aktualizacje od twórców | ✓ | — |
| Wolno dawać lub sprzedawać innym firmom | — | ✓ |
| Własna nazwa i logo | — | ✓ |
| Bez opłat licencyjnych | — | ✓ |
| Niezależność od warunków Synthetify Labs | — | ✓ |

**A. Licencja OpenBot + nasze dodatki (dla użytku wewnętrznego)**
- Właściciel aktywuje licencję Team (teraz za 0 €). Od tej chwili korzystamy z oryginalnego OpenBota legalnie w pracy.
- „Lepszy” robimy na dwa sposoby:
  1. **Jako wtyczki, skille i serwery MCP:** Plugin Studio, oczy agenta, nasze narzędzia. To nasz kod, przetrwa aktualizacje OpenBota i nie podlega zakazowi dystrybucji.
  2. **Jako zmiany w prywatnym forku kodu 0.68:** tylko tam, gdzie wtyczka nie wystarczy. Koszt to scalanie z szybko zmieniającym się upstreamem (numery PR przekroczyły 8000 w 3 miesiące).

**B. Własny program „COSGRAL Workspace” (gdy ma trafić do innych)**
- Bazą jest import `a6fe240`, czyli prawdziwy backend OpenBota z sierpnia, legalny także dla firmy.
- Warunki Apache-2.0:
  - zachowujemy `LICENSE` i `NOTICE` (Norbert Bodziony, Blobatar MIT);
  - oznaczamy zmienione pliki;
  - nazwa, logo i `appId` muszą być nasze;
  - logowanie do chmury OpenBot zastępujemy własnym.
- Funkcje z wersji 0.2–0.68 odtwarzamy w trybie **clean room**:
  - Tester opisuje zachowanie własnymi słowami (działająca aplikacja i REA);
  - Backend i UI implementują tylko z tego opisu;
  - **nikt z implementujących nie otwiera kodu nowszego niż `a6fe240`** (domyślna gałąź na GitHubie to już kod niekomercyjny).
- Paperclip (MIT) zostaje dawcą części: adaptery Gemini, Grok, OpenCode, Hermes i OpenClaw oraz wzorce zatwierdzeń i rutyn.
- Uczciwie: pełna zgodność z 0.68 to tygodnie pracy, a oryginał dalej szybko się rozwija.

## 4. Do decyzji właściciela

1. Czy COSGRAL Workspace jest tylko dla Was (A), czy ma trafić do innych firm lub klientów (B)?
2. Przy A trzeba aktywować licencję Team w OpenBocie: Ustawienia → Rozliczenia, 2 osoby, teraz 0 € do 1.12.2026. Tego nie możemy zrobić za Was.

Nie jestem prawnikiem. Przed sprzedażą produktu z drogi B warto dać §1–3 do krótkiej opinii prawnej.
