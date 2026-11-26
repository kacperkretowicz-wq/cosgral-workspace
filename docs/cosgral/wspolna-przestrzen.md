# Wspólna przestrzeń botów dla dwóch osób (Kacper i Kuba)

Stan: 26.11.2026. Kacper wybrał opcję A, więc jest już w programie (patrz „Jak to włączyć”). Niczego nie założyłem, nie zapłaciłem i nie uruchomiłem na prawdziwej sieci. Każdy krok, który wymaga konta, pieniędzy albo wysłania danych poza komputer, czeka na zgodę Kacpra.

## Czego chcesz

Te same boty dla Ciebie i dla Kuby. Niezależnie od tego, gdzie jesteście, obaj możecie wejść i coś w tej przestrzeni zrobić.

## Jak jest dziś

- Program działa tylko na jednym komputerze. Boty, rozmowy i klucze leżą na dysku tego komputera. Kuba ich nie zobaczy.
- W programie jest już kawałek na wspólną pracę: jeden komputer może być „gospodarzem”, a druga osoba dołącza przez link zaproszenia. Są też role (właściciel, administrator, członek) i widać, kto jest teraz w środku. W ustawieniach serwera działy „Członkowie” i „Strony” są jednak wyłączone, bo nie mają dziś dokąd się połączyć.
- Dlaczego nie mają: gospodarz łączy się ze światem przez usługę OpenBota, a program przyjmuje tylko adresy z domeny `openbot.run` (sprawdziłem w kodzie). Tej usługi nie mamy, więc dziś zaproszenia działać nie mogą.
- Wcześniejsza rekomendacja z projektu (wiersz 17 w DECYZJE-WLASCICIELA.md): „zero cudzej chmury”, czyli sieć lokalna albo Tailscale zamiast cudzego przekaźnika. Plan poniżej jest z nią zgodny.

## Trzy realne opcje

### Opcja A. Jeden komputer-gospodarz plus prywatna sieć (Tailscale)

Jak to wygląda: boty stoją na jednym komputerze (Twoim albo osobnym, który jest włączony na stałe). Tailscale łączy Wasze komputery w prywatną sieć, jakbyście byli w jednym domu. Kuba otwiera program, dołącza do Twojego komputera i widzi te same boty.

- **Koszt:** zero złotych za program. Tailscale ma darmowy plan dla małych grup, ale aktualne limity trzeba sprawdzić przed założeniem kont. Jeśli komputer ma być włączony całą dobę, dojdzie prąd albo tani mały komputer (to Twoja decyzja, nic nie kupuję).
- **Klucze i dane:** zostają zaszyfrowane na komputerze gospodarza. Kuba korzysta z botów, ale nie dostaje Twoich kluczy ani logowań do modeli. Rozmowy i boty leżą tylko u gospodarza.
- **Ryzyka:**
  - Gdy komputer gospodarza jest wyłączony, nikt nie wejdzie.
  - Gdy jego dysk się zepsuje, boty i rozmowy przepadną, więc potrzebna jest kopia zapasowa.
  - Boty pracują na Twoim koncie z modelami. Warunki planów subskrypcyjnych (Codex, Claude) mogą ograniczać dzielenie konta między osoby. To trzeba sprawdzić w warunkach dostawców, zanim Kuba zacznie z tego korzystać. Bezpieczniej: osobny klucz API (płatny za użycie) dla wspólnej przestrzeni.
- **Co trzeba zrobić w programie:** pozwolić gospodarzowi stać pod adresem z Tailscale zamiast pod adresem z `openbot.run` oraz włączyć z powrotem działy „Członkowie” i „Strony”. To jedna zmiana w kodzie, którą mogę zrobić po Twojej zgodzie. Nie sprawdzałem, jak to się zachowa na prawdziwych dwóch komputerach.

### Opcja B. Własny mały serwer w internecie

Jak to wygląda: wynajmujesz mały serwer (kilka euro miesięcznie, cena orientacyjna, do sprawdzenia) i program stoi tam cały czas. Wchodzicie obaj z dowolnego miejsca, bez włączania czyjegoś komputera.

- **Koszt:** opłata za serwer co miesiąc plus czas na obsługę.
- **Klucze i dane:** klucze do modeli trzeba wpisać na serwerze, czyli leżą poza Waszymi komputerami u firmy, która serwer wynajmuje. Trzeba pilnować aktualizacji i kopii zapasowych.
- **Ryzyka:** program jest zrobiony jako okno na komputerze. Wersja bez okna na serwerze z Linuksem została wcześniej odłożona jako zbyt droga (decyzja 8). Dla początkującego to najtrudniejsza opcja: serwer, adres, szyfrowanie połączenia, aktualizacje.
- **Co trzeba zrobić:** duża praca programistyczna (uruchomienie bez okna) i obsługa serwera.

### Opcja C. Synchronizacja przez repozytorium (te same boty, bez wspólnych rozmów na żywo)

Jak to wygląda: każdy ma program u siebie. Opis botów (nazwa, rola, instrukcje, skille, plany) trzymacie jako pliki w repozytorium na GitHubie i wczytujecie u siebie. Macie te same boty, ale rozmowy są osobne.

- **Koszt:** zero złotych (GitHub już macie).
- **Klucze i dane:** każdy używa własnych kluczy i własnych logowań, więc nic wrażliwego nie jedzie przez internet. Do repozytorium trafiają tylko opisy botów, nigdy klucze i rozmowy.
- **Ryzyka:** to nie jest „wchodzimy i robimy razem”. Zmiana bota u jednego pojawia się u drugiego dopiero po wczytaniu. Dziś program nie ma eksportu i wczytywania botów z plików (Import i Przeniesienie są wyłączone), więc to też trzeba dopisać.
- **Co trzeba zrobić:** eksport i wczytywanie botów do plików, bez kluczy.

## Rekomendacja dla początkującego

**Opcja A, w dwóch krokach.**

1. Najpierw sprawdzić na sucho, bez kont i bez pieniędzy: ja poprawiam program tak, żeby gospodarz mógł stać pod adresem z Tailscale, i testuję to na jednym komputerze z atrapą.
2. Dopiero po Twoim „tak”: Ty i Kuba zakładacie darmowe konta Tailscale, jeden komputer zostaje gospodarzem, Kuba dołącza linkiem zaproszenia.

Dlaczego A: daje dokładnie to, o co prosisz (te same boty, wejście z dowolnego miejsca, wspólna praca), nic nie kosztuje na początek, klucze zostają na Twoim komputerze i jest najbliżej tego, co program już ma. Opcja B jest dla Ciebie za trudna na start, a C nie daje wspólnej pracy na żywo.

Zanim Kuba zacznie używać botów: sprawdź w warunkach planu, czy wolno Wam dzielić jedno konto z modelem. Jeśli nie, zrobimy wspólną przestrzeń na osobnym kluczu API.

## Jak to włączyć (opcja A jest już w programie)

Stan 26.11: program ma gotowe udostępnianie przez Tailscale. Sprawdziłem je w testach na atrapie Tailscale (gospodarz, link zaproszenia, dołączenie nazwą i hasłem, ponowne logowanie). **Nie próbowałem tego na prawdziwym Tailscale ani na dwóch komputerach**, bo nie zakładam kont. Pierwszy prawdziwy test robicie Wy.

**Gospodarz (komputer, na którym stoją boty, na przykład Twój):**

1. Zainstaluj Tailscale (tailscale.com/download) i zaloguj się. Konto zakładasz Ty, jeśli zdecydujesz się z niego korzystać.
2. W panelu administracyjnym Tailscale (zakładka DNS) włącz nazwy MagicDNS i HTTPS dla Waszej sieci. Bez tego program powie, co zrobić.
3. W programie: pasek serwerów po lewej, prawy przycisk na swoim serwerze, „Udostępnij ten COSGRAL Workspace”. Wpisz nazwę serwera i kliknij „Utwórz serwer i włącz udostępnianie”.
4. Wejdź w „Ludzie”, wybierz rolę (Członek albo Admin), kliknij „Utwórz link zaproszenia” i wyślij link drugiej osobie. Link działa raz i wygasa po 24 godzinach.

**Druga osoba (Kuba):**

1. Zainstaluj Tailscale i zaloguj się. Dołącza do Waszej sieci Tailscale (zaprasza gospodarz w panelu Tailscale).
2. W programie: plus na pasku serwerów, wklej link zaproszenia, wybierz swoją nazwę i hasło (co najmniej 12 znaków) i kliknij „Dołącz do serwera”.
3. Kuba widzi tych samych agentów i rozmowy, może pisać do botów i prowadzić z Tobą rozmowy. Role: Członek, Admin, Właściciel; Ty możesz w „Ludziach” zmienić rolę, wyłączyć dostęp albo usunąć osobę.

**Ważne:**

- Gospodarz musi mieć włączony komputer i program. Gdy go zamkniesz, serwer znika (przy następnym starcie program sam włącza udostępnianie, jeśli było włączone).
- Boty pracują na kontach i kluczach gospodarza. Kuba ich nie widzi. Sprawdź warunki planów, zanim wspólnie z nich korzystacie.
- Dane (boty, rozmowy) leżą na dysku gospodarza. Zrób kopię zapasową.
- Hasło Kuby jest zapisane w jego programie w postaci zaszyfrowanej, żeby mógł wejść ponownie po wygaśnięciu sesji (po 30 dniach).
- Zaproszenie mailem jest wyłączone (program nie ma skrzynki). Używaj linku.
- Sekcja „Strony” w Ustawieniach serwera dalej jest wyłączona (hosting stron wymaga usługi w internecie).

## Marketplace: skąd miałby pochodzić katalog dodatkowych pluginów

Marketplace to miał być katalog dodatkowych pluginów, które można podpiąć do agentów. Dziś w programie pokazują się tylko skille i agenci wpisani na stałe (14 skilli i 9 agentów). Katalog z 251 pozycjami pochodzi z OpenBota i leży poza repozytorium, więc tych danych nie mamy.

Dobra wiadomość: program umie już wczytać katalog z folderu. Szuka w nim pliku `catalog.json` i plików `<nazwa>/<wersja>.json`, sprawdza sumy kontrolne i odrzuca pozycje, które się nie zgadzają. Z katalogu nic się samo nie uruchamia: plugin zaczyna działać dopiero, gdy go zainstalujesz. Adresy muszą być bezpieczne (https).

Skąd mógłby pochodzić taki folder:

1. **Plik w repozytorium z listą** (osobne repozytorium, np. `cosgral-katalog`, albo folder `katalog/` w tym). Wy dopisujecie pozycje, zmiany widać w historii, Kuba ma to samo przez pobranie repozytorium. Zero kosztu, zero kont, kod programu bez zmian.
2. **Gotowy katalog z internetu** (np. publiczne listy serwerów MCP). Dużo pozycji naraz, ale nie wiemy, kto je sprawdza, i dane idą z cudzego miejsca.
3. **Własna usługa katalogu.** Najdroższa, bez sensu dla dwóch osób.

**Rekomendacja: pierwsza.** Zaczynamy od małego katalogu w osobnym repozytorium (na start kilka pluginów, które naprawdę chcecie podpiąć), w programie wskazujecie ten folder. Gdy się sprawdzi, można dołożyć więcej pozycji albo, za Waszą zgodą, własną listę wzorowaną na publicznych.

## Streszczenie decyzji dla Kacpra

1. **Wspólna przestrzeń:** czy idziemy w Opcję A (komputer-gospodarz plus Tailscale)? Jeśli tak, zaczynam od zmiany w programie i testu na jednym komputerze, bez żadnych kont.
2. **Konta:** zakładanie kont Tailscale dla Was dwojga zrobicie Wy, kiedy powiesz „tak” (ja nic nie zakładam).
3. **Modele:** sprawdzić warunki planu przed dzieleniem konta z Kubą albo przejść na osobny klucz API dla wspólnej przestrzeni.
4. **Marketplace:** czy robimy mały katalog w osobnym repozytorium (rekomendacja), czy wolisz inne źródło? Podaj też, jakie pluginy chcecie na start.
5. **Gdzie leżą kopie zapasowe** wspólnych botów (przy A: kopia z komputera gospodarza).
