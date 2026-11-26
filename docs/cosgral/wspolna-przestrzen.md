# Wspólna przestrzeń botów dla dwóch osób (Kacper i Kuba)

Stan: 26.11.2026. Kacper wybrał opcję A (jeden komputer-gospodarz) i odrzucił Tailscale jako wymóg, więc w programie jest darmowy tunel Cloudflare bez konta; Tailscale został jako opcja zaawansowana (patrz „Jak to włączyć”). Niczego nie założyłem, nie zapłaciłem i nie uruchomiłem na prawdziwej sieci. Każdy krok, który wymaga konta, pieniędzy albo wysłania danych poza komputer, czeka na zgodę Kacpra.

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

## Jak to robi OpenBot (sprawdzone w kodzie: `apps/auth-api` w tym repozytorium)

Kod ich usługi jest w tym repozytorium (licencja Apache 2.0), więc to nie domysły.

- **Usługa pośrednicząca to jedna aplikacja na Cloudflare Workers z bazą D1.** Przechowuje konta (logowanie kodem z maila) i „rezerwacje” serwerów.
- **Stała nazwa:** gospodarz prosi usługę o adres. Usługa przez API Cloudflare (ich token, ich konto, ich strefa DNS) tworzy **tunel z nazwą** i wpis DNS `<nazwa>-<losowe osiem znaków>-host.openbot.run`. Nazwa jest zapisana w ich bazie, więc po każdym restarcie gospodarz dostaje ten sam adres. Gospodarz dostaje token i uruchamia `cloudflared tunnel run`; tunel łączy się wychodząco, więc nic nie trzeba otwierać w routerze.
- **Gość:** dostaje link zaproszenia z adresem `…openbot.run` i dołącza. Adres nigdy się nie zmienia.
- **Kto płaci i co jest czyje:** tunele Cloudflare i Workers z D1 mają darmowe progi, ale **domena `openbot.run` i konto Cloudflare należą do OpenBota** (domena kosztuje rocznie, jest też płatna poczta do wysyłania kodów). Program akceptuje tylko adresy z tej domeny. **Otwarty jest kod usługi, a nie jej konta, domena i tokeny**, więc nie możemy z niej korzystać.
- **Wniosek:** stały adres „jak w OpenBocie” wymaga domeny na koncie Cloudflare. Bez własnej domeny i konta nie da się go zrobić. Dlatego poniżej jest droga, która daje to samo dla gościa (nic nie wysyłasz drugi raz), ale za darmo i bez konta.

## Jak to włączyć (darmowy tunel Cloudflare i samodzielne odnajdywanie adresu)

Program używa **darmowego tunelu Cloudflare „na szybko” (quick tunnel)**. Nie trzeba konta, niczego instalować ani ustawiać w routerze: komputer sam „dzwoni” do Cloudflare. Adres takiego tunelu jest losowy i zmienia się po każdym ponownym włączeniu. Żeby **Kuba nie musiał dostawać nowego adresu**, dzieje się to automatycznie:

1. Gdy gospodarz włącza udostępnianie (i potem co pół godziny), program zostawia **podpisaną notatkę z aktualnym adresem** w darmowej publicznej skrzynce (ntfy.sh, bez konta). Nazwę skrzynki da się obliczyć tylko znając identyfikator serwera i odcisk klucza, które są w zaproszeniu.
2. Program Kuby, gdy serwer przestaje odpowiadać, sprawdza skrzynkę, weryfikuje podpis gospodarza i tożsamość serwera pod nowym adresem i sam przełącza się na nowy adres. Próbuje co 10 s, potem rzadziej (do 2 min). Gdy znajdzie serwer, sam się łączy i odświeża dane. Jeśli sesja wygasła, loguje się zapisanym hasłem.
3. Nikt nie musi ufać skrzynce: bez podpisu gospodarza i potwierdzenia tożsamości program niczego nie zmieni, a w skrzynce leży tylko tymczasowy adres.

**Gospodarz:**

1. Pasek serwerów po lewej, prawy przycisk na swoim serwerze, „Udostępnij ten COSGRAL Workspace”. Wpisz nazwę serwera i kliknij „Utwórz serwer i włącz udostępnianie”.
2. Za pierwszym razem program sam pobiera mały darmowy program Cloudflare (około 40 MB, z oficjalnej strony Cloudflare na GitHubie) i sprawdza jego sumę kontrolną.
3. „Ludzie” > rola > „Utwórz link zaproszenia” i wyślij link Kubie **raz**. Link działa raz i wygasa po 24 godzinach.

**Kuba:** plus na pasku serwerów, wklej link, wybierz nazwę i hasło (co najmniej 12 znaków), „Dołącz do serwera”. Od tej pory wchodzi sam, o ile Twój komputer i program są włączone.

**Ważne, uczciwie:**

- Gospodarz musi mieć włączony komputer i program. Gdy go zamkniesz, serwer znika. Po ponownym włączeniu Kuba wraca w ciągu około minuty lub dwóch.
- Skrzynka ntfy.sh to cudza, darmowa usługa. Widzi tymczasowy adres tunelu (nie widzi haseł, rozmów ani kluczy). Gdyby była niedostępna, zostaje przycisk „Skopiuj nowy adres dla osób” (Kuba wkleja link w oknie „Dołącz”). Własną skrzynkę można wskazać zmienną `COSGRAL_ADDRESS_RELAY` (adres https), wyłączyć ją wartością `off`.
- Adres tunelu jest dostępny z internetu, ale bez zaproszenia nikt się nie zaloguje.
- Boty pracują na kontach i kluczach gospodarza. Kuba ich nie widzi. Sprawdź warunki planów, zanim wspólnie z nich korzystacie.
- Dane (boty, rozmowy) leżą na dysku gospodarza. Zrób kopię zapasową.
- Zaproszenie mailem jest wyłączone (program nie ma skrzynki). Sekcja „Strony” dalej jest wyłączona.
- **Nie sprawdziłem tego na prawdziwym Cloudflare ani ntfy.sh ani na dwóch komputerach**: moje środowisko nie ma dostępu do tych usług. Cały przebieg (uruchomienie, zaproszenie, dołączenie, restart z nowym adresem, samodzielne odnalezienie adresu) przetestowałem na atrapach. Pierwszy prawdziwy test robicie Wy.

**Zaawansowane (dla kogoś, kto już ma Tailscale):** w panelu „Publikowanie”, przed włączeniem, jest „Zaawansowane” z opcją „Użyj Tailscale zamiast darmowego tunelu Cloudflare”. Adres jest wtedy stały (`<komputer>.<sieć>.ts.net`), ale obie osoby muszą mieć Tailscale w tej samej sieci.

**Jeśli kiedyś będziesz chciał prawdziwie stały adres jak w OpenBocie (nic z tego nie zrobiłem, bo wymaga konta albo pieniędzy):** darmowe konto Cloudflare plus własna domena (około 40–60 zł rocznie) i nazwany tunel; albo darmowy Worker na Twoim koncie Cloudflare jako własny rejestr nazw. W obu przypadkach potrzebne jest Twoje konto Cloudflare.

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
