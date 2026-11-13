# Backend W3-BE9: wygląd i spójność uruchomionej aplikacji

Gałąź `team/backend/w3-polish` od integracji `8d075f04b`, bez push. Zadanie przejęte od UI Designera (w tamtej sesji nie było dostępu do pulpitu). Wszystko oglądane w prawdziwym Electronie w piaskownicy z atrapą Codex, w ciemnym motywie programu i w jasnym podglądzie. Kodu OpenBota nowszego niż `a6fe240` nie czytałem; bez zasobów z 0.68.

## Wynik w skrócie

| # | Sprawa z listy W3-BE8 | Wynik | Commit |
|---|---|---|---|
| 1 | Ekran powitalny i Ustawienia bez stylów | ✓ przyczyna znaleziona, jedna wspólna warstwa stylów | `858a32160` |
| 2 | Dwa ekrany pytają o dostawcę | ✓ jeden przepływ, dostawca raz | `d5aea1ec5` |
| 3 | „Read aloud” jako zwykły tekst | ✓ akcja wiadomości (ikona), plus „Record voice” i „Choose from library” | `7905c2bc8` |
| 4 | „Tasks” i „Usage” to „Coming soon” | ✓ obie strony na istniejących kontraktach, bez nowego kontraktu | `abeb523dd` |
| 5 | Strony W3 w obu motywach | ✓ poprawione: Ustawienia głosu, Marketplace, zdalny pulpit, kontrast, kolumna, nagłówki | `fca56dde6` + commit z tym raportem |

## 1. Przyczyna braku stylów

Nie brakowało arkusza ani importu. Ekrany W3 (powitanie, „Application settings”, „Voice”, Marketplace, Workflows, Remote desktop) były pisane jako goły semantyczny HTML (`<label>`, `<select>`, `<button>`, `<table>`) bez klas. Tailwind (`@import "tailwindcss"`) ma preflight, który zdejmuje domyślne style przeglądarki, więc taki HTML wyglądał jak surowy tekst. Strony Phone i Providers (KK) wyglądały dobrze, bo używają prymitywów systemu (`Card`, `Heading`, `Field`, `NativeSelect`, `Button`).

**Naprawa (jedna, zamiast łatania każdej strony):**
- Nowy `styles/cosgral-pages.css`: warstwa dla stron szyny (`main.w2-library`), paneli `.w2-panel` i sekcji ustawień (`.cosgral-form`, `.cosgral-settings-block`). Daje gołemu HTML-owi wygląd prymitywów: kolumna 880 px, nagłówki, karty sekcji, pola, przyciski (jak `ui-button` secondary), listy, tabele, `details/summary`.
- Wszystko w `:where()`, czyli bez specyficzności: każda klasa komponentu i każdy `ui-*` dalej wygrywa. Same tokeny, bez nowych kolorów.
- Stare reguły `.w2-panel input/select/button` z `cosgral.css` przeniesione do nowej warstwy (jedno źródło).
- „Application settings”: komponenty systemu, czytelne nazwy zdarzeń („Needs your approval” zamiast `needs-approval`, kolumny „Notification” i „Sound”). Lista wewnętrznych identyfikatorów sekcji (`computer-use`, `transfer`…) zniknęła z widoku: nigdzie nie prowadziła. Kontrakt bez zmian.
- Okno ustawień: na Windows tytuł „Settings” i opis bez macOS; sekcje aplikacji i głosu stoją pod wyborem dostawcy, nie w nagłówku.

## 2. Jeden przepływ pierwszego uruchomienia

Było: okno „Welcome to COSGRAL” (język, dostawca, pierwszy agent), potem oryginalne „Where will COSGRAL Workspace run?” → „Set up this computer”, które znowu pytało o dostawcę.

Jest: zostaje oryginalny przepływ, bo pokazuje stan każdego dostawcy (zainstalowany, zalogowany) i ma „Connect to a host”. Pytania powitania (język, pierwszy agent z szablonu, co może Computer Use) są polami kroku „Set up this computer”. „Continue with Codex” wywołuje `onboarding.complete` (zapisuje i uruchamia dostawcę raz, tworzy pierwszego agenta), potem okno czyta `getSetupState`. Bez API onboarding działa stary `saveSetup`. `OnboardingW3` i `OnboardingW3Gate` usunięte; historia Storybooka pokazuje nowe pola.

## 3. Głos w rozmowie

- „Read aloud” to jedna akcja wiadomości (ikona 24 px, jak reakcje i „More”, pokazuje się po najechaniu lub fokusie). Podczas czytania ten sam przycisk zatrzymuje („Stop reading”); `speak` kończy się po przeczytaniu, więc tylko czytana odpowiedź ma Stop.
- „Record voice” w polu wiadomości to okrągły przycisk-ikona 28 px jak „+” (mikrofon, kwadrat podczas nagrywania).
- „Choose from library” to cicha rozwijana kontrolka zamiast trójkąta przeglądarki.

## 4. Tasks i Usage

Kontrakty wystarczyły, nic nie wymyślałem.

- **Tasks:** zadania wszystkich kanałów na jednej liście (`channels.list` + `listTasks` na kanał), od najnowszych: tytuł, `#kanał`, właściciel, godzina, stan. Filtry: All, Open, Done, Failed or stopped, Archived. Tylko akcje, które silnik przyjmie dla danego stanu (jak w `channel-store` `act`): Pause, Resume, Stop, Archive, Restore przez `actOnTask`. Na żywo przez `task-changed` i `channels-changed`.
- **Usage:** `providers.listUsage` w tej samej liście co na stronie Providers: stan ok, limited albo unavailable, procent, powód, godzina resetu. Do tego Refresh, `provider-usage-changed` i `acp-agents-changed`. Liczników tokenów na agenta nie ma w żadnym kontrakcie; strona tego nie udaje.

## 5. Przegląd stron W3 (zrzuty w obu motywach)

| Strona | Znalezione | Poprawka |
|---|---|---|
| Ustawienia → Voice | sekcja w ogóle się nie pokazywała przez kilka do kilkunastu sekund: czekała na listę głosów z PowerShella (do 30 s) | ustawienia od razu, lista głosów dochodzi później (test) |
| Marketplace | przycisk z tytułem i opis wyrównany do prawej z „—”; szczegóły pozycji dopiero pod całym katalogiem | filtry w jednym rzędzie, pozycje jako wiersze (tytuł, opis pod spodem), szczegóły pod filtrami |
| Remote desktop | pola i przyciski jeden pod drugim; biały tekst na jasnej czerwieni ok. 2,6:1 | pola obok siebie, przyciski w rzędzie, „Stop all remote sessions” w kolorach `danger` (czytelne w obu motywach) |
| Library, Schedule | brak nagłówka strony; w Schedule karta w karcie | nagłówki; zagnieżdżony panel bez ramki |
| Phone, Providers | węższa kolumna (760 px) niż reszta | ta sama kolumna 880 px |
| Głos (lista modeli) | przyciski rozjechane po wierszu | wybór po lewej, przyciski razem po prawej |
| Workflows | goły HTML | wygląd z warstwy (przyciski, pole, karta płótna) |

## Co widziane w uruchomionym programie

Skrypt `scripts/sandbox-polish-shots.ts` uruchamia prawdziwy Electron w piaskownicy, przechodzi pierwsze uruchomienie i jedną rozmowę. Włącza głos (tylko w piaskownicy) i zakłada jeden kanał z zadaniem. Potem robi zrzut każdej strony szyny i Ustawień, każdy w dwóch wersjach: ciemny motyw programu i jasny podgląd (tokeny z `stories/theme-frame.tsx`). Ostatni przebieg: świeża piaskownica, 46 zrzutów, 0 wpisów w konsoli.

Zrzuty są poza repozytorium (zawierają nazwę konta piaskownicy): `Shared\cosgral-sandbox\polish\{before,step1,step2,step4,step4b,step5,final}`. Widziane:
- pierwsze uruchomienie, oba kroki;
- czat z „Read aloud” po najechaniu, „Record voice”, „Choose from library”;
- Agents, Schedule, Tasks (z zadaniem kanału), Workflows, Usage, Library, Marketplace, Remote desktop, Providers, Phone;
- Ustawienia: dostawca, aplikacja, głos.

## Weryfikacja

| Sprawdzenie | Wynik |
|---|---|
| `typecheck:renderer`, `typecheck:node` | kod 0 |
| `biome check` na 24 plikach gałęzi | 0 błędów; 1 ostrzeżenie w starym fragmencie `cosgral.css:102` (nie z tej zmiany) |
| Nowe testy, po jednym pliku | `AppSettingsW3` 2/2, `InitialSetup.onboarding` 2/2, `VoicePlayback` 3/3, `VoiceSettings` 1/1, `TasksPage` 4/4, `UsagePage` 2/2 |
| Zmienione lub dotknięte testy | `App.eyes` 8/8, `VoiceRecorder.ui` 1/1, `MarketplacePage` 1/1, `RemoteDesktopPage` 2/2, `App.test.tsx` z filtrem setup/provider/permission/onboarding/macOS 15/15 (72 pominięte filtrem) |
| `bun run build` | kod 0 |
| `sandbox:e2e` | **19/19**, 0 wpisów w konsoli (drugi przebieg). Pierwszy przebieg: 18/19, krok „agent tools” padł, bo po restarcie pole wiadomości było wyłączone dłużej niż 30 s („Connecting to agent CLIs…”); w tym czasie Tester też uruchamiał Electrona |

`App.eyes`: test szukał regionu „Marketplace”, którego strona nigdy nie miała. Padał też na `8d075f04b`, czyli przed tą zmianą. Teraz szuka nagłówków stron.

## Czego nie sprawdzono

- **Prawdziwy jasny motyw:** program ma tylko ciemny. Jasny to podgląd z tokenów Storybooka wstrzykniętych w działające okno. W nim pigułka modelu w nagłówku czatu jest czarna (stały kolor spoza tokenów, poza zakresem). Nie dodawałem jasnego motywu do programu.
- **Pierwszy agent z szablonu:** pole i wywołanie `onboarding.complete` z `firstAgent` sprawdzone testem, a w programie przeszedłem pierwsze uruchomienie tylko z „Choose later”.
- **Odczyt na głos i nagrywanie:** sam dźwięk i mikrofon nie są do sprawdzenia w piaskownicy. Widziałem tylko przyciski i stany, a działanie sprawdziły testy z atrapą `voice`.
- **Akcje Tasks w programie:** w piaskownicy zadanie kanału kończy się „Failed” na atrapie Codex, więc widziałem tylko Archive. Pause, Stop, Resume i Restore sprawdzone testami na atrapie API.
- **Inne rzeczy:** pełne `bun run test`, czytnik ekranu, inne rozmiary okna niż 1280×800, prawdziwy Codex i Claude, instalator.
- **Skrypt zrzutów** czasem pada przy pierwszym przebiegu po buildzie (czas startu CLI). Drugi przebieg z `--keep` przechodzi. To narzędzie do oglądania, nie test.

## Dla innych (zauważone, nie poprawiane)

- **KAPI / silnik dostawców:** `providers.listUsage` w piaskownicy zwraca Claude jako „Available”, a wybór dostawcy pokazuje „Not installed”. Strony Usage i Providers pokazują więc dostępnego Claude, którego nie ma.
- **Silnik kanałów / Tester:** na atrapie Codex wiadomość w nowym kanale kończy zadanie stanem „Failed”, a wiersz agenta pokazuje „Error · The last turn failed”. Nie badałem, czy to atrapa, czy silnik.
- **UI:**
  - Okno ustawień ma trzy przyciski zapisu: dostawca („Save changes”), aplikacja i głos (głos zapisuje się od razu). Zostawiłem, bo to zmiana zachowania.
  - Menu konta na Windows dalej nazywa to okno „Providers & permissions”.
  - Nad tytułem kroku jest etykieta „COSGRAL SETUP”. To stary element bazy, zostawiłem.
  - `ComingSoon` nie jest już używany w szynie: każda strona jest prawdziwa. Komponent został na przyszłe strony.

## Jak powtórzyć

```
bun run build
set COSGRAL_SANDBOX_ROOT=<folder poza repo>
node scripts/sandbox-polish-shots.ts [--keep] [--out=<podfolder>]
node scripts/sandbox-e2e.ts
```
