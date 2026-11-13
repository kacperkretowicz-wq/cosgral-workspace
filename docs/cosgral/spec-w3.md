# Spec W3 — Computer Use, zdalny pulpit, głos, dostawcy, zespół, dok, wyspa, ustawienia, onboarding, marketplace

**Dla:** Backend, KAPI, KK Spajacz, UI, Tester (odbiór).
**Źródła:** `docs/cosgral/parytet-0.68.md` wiersze 32–41 (opis zachowania 0.68 zebrany wcześniej z obserwacji, README i changelogu 0.68), raporty Computer Use (`backend-w3-computer-use.md`), dostawców (`kapi-w3-dostawcy.md`), doku i wyspy (`kk-w3-dock-island.md`) oraz notki kontraktów w PLAN.md. W tej turze **nie** czytałem README 0.68 ani paczki na nowo: tam, gdzie parytet nie podaje szczegółu, jest to wpisane jako pytanie otwarte (§11), nie zgadywane. Bez kopiowania tekstów i grafik UI, bez kodu nowszego niż `a6fe240`.
**Stan:** 13.11.2026, integracja `codex/cosgral-desktop` @ `5368cc9a5`. Żaden test odbioru z tej specyfikacji nie został jeszcze uruchomiony w COSGRAL.

Legenda „Stan w COSGRAL”: **jest** (w integracji), **gałąź** (oddane, niescalone), **w toku**, **brak**.

## 1. Computer Use (wiersz 32) — jest (W3-BE1)

| # | Temat | Zachowanie | Test odbioru |
|---|---|---|---|
| 1.1 | Sterownik osobny | Agent steruje pulpitem **poza przeglądarką** przez osobny sterownik (0.68: `cua-driver`); przeglądarka agenta to osobna droga. | Agent z włączonym Computer Use opisuje i klika element zwykłej aplikacji (np. Notatnik). |
| 1.2 | Zgoda | Pierwsze użycie wymaga zgody człowieka (karta confirm w Needs you); zgoda dotyczy agenta. | Bez zgody agent nie wykona akcji; po Allow wykona. |
| 1.3 | Stop | Stop kończy sesję **od razu**, cofa zgodę i przerywa pisanie. | Stop w trakcie akcji → sesja znika z wiersza agenta, kolejna akcja wymaga nowej zgody. |
| 1.4 | Odmowy | Okna wrażliwe (UAC, administrator, okno COSGRAL, Vault, Win+L) są poza zasięgiem agenta. | Agent próbuje kliknąć okno UAC → odmowa z czytelnym komunikatem. |
| 1.5 | Stan | Wiersz agenta pokazuje „steruje komputerem” (acting/idle, ostatnia akcja). | Podczas sesji wskaźnik widoczny; po Stop zniknął. |
| 1.6 | Brzeg: restart | Zgoda **nie przetrwa restartu** (decyzja lidera). | Zgoda → restart → akcja znów pyta. |

## 2. Zdalny pulpit (wiersz 33) — brak (Windows↔Windows)

| # | Temat | Zachowanie | Test odbioru |
|---|---|---|---|
| 2.1 | Konfiguracja po stronie właściciela | Właściciel hosta włącza udostępnianie pulpitu i wybiera, kto może się połączyć. | Włączyć host → inna instancja widzi go na liście. |
| 2.2 | Połączenie | Podgląd i sterowanie pulpitem hosta (0.68: VNC/tunel); obraz widoczny, sterowanie myszą i klawiaturą. | Połączyć → widać pulpit, klik działa. |
| 2.3 | Rozłączenie | Rozłączenie nie wiesza żadnej strony; host wraca do normalnego stanu. | Rozłączyć w trakcie ruchu myszy → brak zawieszenia, host nadal działa. |
| 2.4 | Brzeg: Computer Use | Zdalny pulpit i Computer Use to osobne funkcje; zgoda jednej nie włącza drugiej. | Włączyć jedno → drugie nadal wymaga zgody. |

## 3. Głos (wiersz 34) — brak

| # | Temat | Zachowanie | Test odbioru |
|---|---|---|---|
| 3.1 | Mowa → tekst | Nagranie w kompozytorze zamienia się na tekst szkicu; wysłanie to osobny krok człowieka. | Nagrać zdanie → tekst w szkicu, nic nie wysłane. |
| 3.2 | Tekst → mowa | Odpowiedź agenta można odczytać głosem (przycisk / ustawienie). | Włączyć odczyt → odpowiedź słyszalna; wyłączenie ucisza. |
| 3.3 | Osobne hosty | 0.68 ma osobne hosty przetwarzania mowy i transkrypcji; awaria jednego nie zabija okna. | Zabić host głosu → okno żyje, komunikat o niedostępności głosu. |
| 3.4 | Uprawnienia | Mikrofon wymaga zgody systemu; odmowa daje jasny komunikat. | Odmowa mikrofonu → komunikat, brak błędu w konsoli. |
| 3.5 | Brzeg: zakładka ustawień | Głos ma własną zakładkę ustawień (włącz, język). | Wyłączyć głos → przycisk nagrywania znika. |

## 4. Dostawcy i limity (wiersz 35) — gałąź (W3-K1, `team/kapi/w3-providers`)

| # | Temat | Zachowanie | Test odbioru |
|---|---|---|---|
| 4.1 | Wielu dostawców | Poza Codex i Claude: Gemini, Grok, OpenCode, Cursor, własny ACP; agent ACP = model `acp:<id>`. | Dodać agenta ACP → pojawia się jako model; agent odpowiada. |
| 4.2 | Konta | Lista kont dostawców, każde ze stanem użycia. | Dwa konta jednego dostawcy → oba na liście. |
| 4.3 | Limity | Użycie i limity jako pierścienie: ok / limited / unavailable, z czasem **resetu**. | Limit wyczerpany → stan limited z resetsAt. |
| 4.4 | Modele zapasowe | Do 4 modeli zapasowych; przy limicie agent przełącza się na następny, `activeModel` pokazuje użyty. | Wyczerpać limit → kolejna tura na zapasowym; zdarzenie model-fallback. |
| 4.5 | Brzeg: restart | Stan limitów po restarcie (dziś: do dokończenia przez KAPI). | Restart w trakcie limitu → limit nadal widoczny albo odczytany od nowa. |

## 5. Zespół i serwery (wiersz 36) — częściowo (baza ma `team-store`, `HostPanel`)

| # | Temat | Zachowanie | Test odbioru |
|---|---|---|---|
| 5.1 | Członkowie i role | Właściciel zaprasza osoby (link/QR) i nadaje role. | Zaprosić → druga osoba dołącza z rolą. |
| 5.2 | Hostowanie | Komputer może hostować serwer; widać status maszyny. | Włączyć host → status online. |
| 5.3 | Macierz dostępu | Dostęp **per agent** (kto widzi którego agenta). | Zabrać dostęp do agenta → osoba go nie widzi. |
| 5.4 | DM i obecność | Obie osoby widzą obecność i piszą w DM. | Dwie instancje → obecność i wiadomość DM. |
| 5.5 | Klient webowy | Dostęp przez przeglądarkę do hosta. | Otworzyć adres hosta → logowanie i czat. |

## 6. Dok agentów (wiersz 37) — gałąź (W3-KK1, `team/kk/w3-dock-island`)

| # | Temat | Zachowanie | Test odbioru |
|---|---|---|---|
| 6.1 | Mini-czat | Osobne okno z mini-czatami ulubionych agentów, poza głównym oknem. | Przypiąć agenta → mini-czat odpowiada. |
| 6.2 | Porządek | Ukrywanie, kolejność, rozmiar (280/360/440 px), max 8. | Zmienić kolejność i rozmiar → zapis po restarcie. |
| 6.3 | Przy zamkniętym oknie | Dok działa po zamknięciu głównego okna (gdy widoczny). | Zamknąć główne okno → dok żyje, „Open COSGRAL” przywraca. |

## 7. Dynamic Island (wiersz 38) — gałąź (W3-KK1)

| # | Temat | Zachowanie | Test odbioru |
|---|---|---|---|
| 7.1 | Stany | Nakładka: pracuje, wiadomość, pytanie, zatwierdzenie, przejęcie, błąd. | Agent pyta w tle → wyspa pokazuje „pytanie”. |
| 7.2 | Kliknięcie | Klik otwiera główne okno na właściwej karcie Needs you. | Klik → okno + karta. |
| 7.3 | Chowanie | Pusta wyspa się chowa; po odpowiedzi na kartę znika. | Odpowiedzieć na kartę → wyspa znika. |
| 7.4 | Brzeg: fokus | „Nowa wiadomość” tylko gdy główne okno bez fokusu. | Okno z fokusem → brak wyspy dla wiadomości. |

## 8. Ustawienia i powiadomienia (wiersz 39) — w toku (W3-BE2)

| # | Temat | Zachowanie | Test odbioru |
|---|---|---|---|
| 8.1 | Zakładki | Ogólne, agenci, powiadomienia, głos, Computer Use, profil, Mobile Connect, dok, wyspa, aktualizacje, rozliczenia, hosty, transfer. | Każda zakładka otwiera się; zakładki funkcji niedostępnych są ukryte lub zablokowane z powodem. |
| 8.2 | Macierz powiadomień | Zdarzenie × kanał (toast systemowy, dźwięk). | Wyłączyć toast dla „needs input” → zdarzenie nie pokazuje toastu, karta nadal jest. |
| 8.3 | Ustawienia agenta | Model, dostawca, narzędzia, pamięć/skille/MCP, uprawnienia — jeden zapis. | Zmienić narzędzia → następna tura używa nowego zestawu. |
| 8.4 | Język | en/pl. | Zmiana języka → UI w nowym języku po odświeżeniu. |

## 9. Onboarding (wiersz 40) — w toku (W3-BE2)

| # | Temat | Zachowanie | Test odbioru |
|---|---|---|---|
| 9.1 | Kroki | Język → pierwszy dostawca → pierwszy agent z propozycji → Computer Use (opcjonalnie). | Świeża instalacja → przejście kończy listą z agentem gotowym do czatu. |
| 9.2 | Pominięcie | Każdy krok można pominąć; wraca do niego ustawienia. | Pominąć dostawcę → komunikat w ustawieniach, nie błąd. |
| 9.3 | Raz | Onboarding nie wraca po ukończeniu. | Restart → brak onboardingu. |

## 10. Marketplace i wtyczki (wiersz 41) — brak (W3-K2)

| # | Temat | Zachowanie | Test odbioru |
|---|---|---|---|
| 10.1 | Katalog | Skille i agenci z wyszukiwarką. | Wyszukać skill → wynik z opisem. |
| 10.2 | Instalacja | Instalacja skilla włącza go u wybranego agenta; limity 200 plików / 10 MB. | Zainstalować → agent ma skill; za duży → odrzucony z komunikatem. |
| 10.3 | Sugestie | Agent może zasugerować aplikację z katalogu; nic nie instaluje sam. | Sugestia → karta; bez zgody brak instalacji. |
| 10.4 | Agent z katalogu | Instalacja agenta używa zwykłego tworzenia agenta (szablony W3-BE2). | Zainstalować agenta → pojawia się z ustawieniami domyślnymi szablonu. |
| 10.5 | Brzeg: publikacja | Lokalny skill nie trafia do katalogu sam. | create_skill → brak wpisu w katalogu. |

## 11. Pytania otwarte (tylko to, czego nie da się ustalić samemu)

1. **Zdalny pulpit (2):** technologia (VNC / WebRTC / RDP przez loopback + tunel) i czy w ogóle bez konta OpenBota. Decyzja lidera/właściciela przed startem prac.
2. **Głos (3):** silnik STT/TTS — lokalny (offline) czy usługa online? Wpływa na prywatność i koszt.
3. **Publiczny adres webhooków / klient webowy (5.5):** gdzie ma stać przekaźnik. Pytanie do właściciela.
4. **Zespół (5):** czy W3 obejmuje tylko LAN/loopback, czy zdalne zaproszenia przez internet.
5. **Marketplace (10):** źródło własnych treści katalogu (seed w repo) i czy „wtyczki z własnymi połączeniami” wchodzą do W3.
6. **Powiadomienia (8.2):** pełna lista zdarzeń w macierzy (parytet ich nie wylicza).

Wszystko poza tym spec ustalam z parytetu; kolejny odbiór robię po scaleniu danej funkcji.
