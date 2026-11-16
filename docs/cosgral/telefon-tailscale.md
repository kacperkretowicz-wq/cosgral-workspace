# Telefon poza domem: Tailscale, PIN, powiadomienia

Instrukcja dla właściciela. Tekst kroków jest też w kontrakcie (`window.openbot.phone.getTailscaleGuide`), ale **ekranu w oknie programu jeszcze nie ma**: UI Designer ma go zbudować na kontrakcie (nazwy przycisków poniżej są propozycją, do ustalenia z UI). Do tego czasu push i Tailscale działają tylko od strony silnika i telefonu (włączenie push na komputerze wymaga na razie ekranu albo wywołania API). Nic tu nie wymaga konta OpenBota ani cudzej chmury rozmów: rozmowa idzie tylko między Twoim komputerem a telefonem.

## 1. Zasięg: Tailscale (raz, ok. 15 minut)

Tailscale robi prywatną sieć między Twoimi urządzeniami. Program nie dostaje trzeciego trybu połączenia: to ten sam „Lokalna sieć" co w domu, tylko adres jest adresem Tailscale.

1. **Tylko Ty:** załóż konto Tailscale i zainstaluj aplikację na komputerze i na telefonie; zaloguj obie tym samym kontem. (Instalacja na komputerze może wymagać administratora.)
2. W programie: Mobile Connect → włącz **Lokalna sieć** → **Sparuj telefon**.
3. Na liście adresów powinien być adres Tailscale: zaczyna się od `100.` (z zakresu 100.64–100.127) albo kończy się na `.ts.net`. Okno pokazuje wtedy „Zasięg: Tailscale". Jeśli adresu nie ma, Tailscale nie działa na komputerze.
4. Zeskanuj kod QR aparatem telefonu. Jeśli telefon otwiera inny adres niż Tailscale, otwórz ten z Tailscale ręcznie (nazwa komputera w aplikacji Tailscale, `…ts.net`, albo adres `100.x.y.z`).
5. Przeglądarka ostrzeże o certyfikacie (jest samopodpisany, zrobiony na tym komputerze). **Porównaj odcisk** z oknem programu i dopiero potem kontynuuj.
6. Zatwierdź parowanie kartą w „Czeka na Ciebie" na komputerze.
7. Na telefonie dodaj stronę do ekranu głównego (na iPhonie to warunek powiadomień).

Wyłączenie: „Wyłącz" w Mobile Connect zamyka serwer telefonu; sparowane telefony zostają, ale nie połączą się, dopóki go nie włączysz.

## 2. PIN (opcjonalny, na telefonie)

- Ustawiasz w aplikacji telefonu: zakładka Telefon → Blokada PIN-em (4–8 cyfr). Polecam przy pierwszym połączeniu poza domem.
- Aplikacja blokuje się po 5 minutach bez użycia, gdy z niej wyjdziesz lub ją zamkniesz, i po restarcie programu na komputerze.
- Komputer pilnuje tego sam: zablokowany telefon nie dostaje żadnych danych (odpowiedź 423), więc wykradziony klucz telefonu sam nie wystarcza.
- **5 błędnych PIN-ów z rzędu usuwa telefon** (parujesz go od nowa). Tak samo wygląda droga powrotna po zapomnianym PIN-ie: komputer nie pokazuje ani nie resetuje PIN-ów (trzyma tylko skrót z solą).

## 3. Powiadomienia (domyślnie wyłączone)

1. Na komputerze: Mobile Connect → **Powiadomienia o „Czeka na Ciebie"** → włącz. Program robi wtedy klucze (prywatny zostaje zaszyfrowany w sejfie tego komputera, nigdy w repo ani na telefonie).
2. Na telefonie: zakładka Telefon → **Włącz powiadomienia** → zezwól, gdy telefon zapyta.
3. „Wyślij powiadomienie testowe" w oknie programu sprawdza, że dochodzi.

Treść powiadomienia to tylko „*agent X czeka na Ciebie*". Pytania, polecenia i odpowiedzi nie przechodzą przez żadną usługę poza Twoimi urządzeniami. **Jedyny wyjątek:** samo powiadomienie idzie przez system telefonu (Google lub Apple), zaszyfrowane dla Twojego telefonu.

Stuknięcie powiadomienia otwiera kartę (po PIN-ie, jeśli jest ustawiony).

## Czego nie sprawdziłem (tylko Ty, na prawdziwych urządzeniach)

- Prawdziwy Tailscale i połączenie z telefonu przez LTE.
- Prawdziwy push na Androidzie i na iPhonie (PWA na ekranie głównym). Jeśli na iPhonie nie dojdzie mimo poprawnej konfiguracji, to znana granica: wtedy zostaje decyzja o aplikacji natywnej (decyzja 16).
- Czy usługa push Apple przyjmie ogólny adres kontaktowy w tokenie (`mailto:noreply@example.com`); zmiana tego adresu to jedna stała w `web-push.ts`.
- Certyfikat HTTPS sieci Tailscale zamiast samopodpisanego: nie zrobiony (Q2: opcja na później). Dziś jest samopodpisany plus odcisk.
