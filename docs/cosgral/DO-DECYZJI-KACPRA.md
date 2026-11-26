# Decyzje do podjęcia przez Kacpra

Stan: 25.11.2026. Każda pozycja to rzecz, której nie robię sam, bo wymaga zewnętrznego konta, klucza, płatności albo wysyła dane poza program. Przy każdej jest krótki opis opcji i moja rekomendacja.

## 1. Darmowe modele (onboarding)

W kroku wyboru dostawcy jest tylko opis, że darmowe modele są w planach. Trzeba wybrać, skąd mają pochodzić.

- **OpenRouter z modelami oznaczonymi „free”.** Klucz jest darmowy, ale trzeba założyć konto. Wiadomości idą do OpenRouter i dalej do dostawcy modelu. Limity bywają niskie.
- **Lokalny model (Ollama).** Dane zostają na komputerze, bez konta i bez płatności. Wymaga mocnego komputera i pobrania kilku GB.
- **Nic nie dodawać.** Zostaje Codex i Claude albo własny klucz w Dostawcach.

Rekomendacja: lokalny model, bo nic nie wychodzi poza komputer i nie trzeba konta. Potrzebuję Twojego „tak” i decyzji, czy pobieranie ma być automatyczne.

## 2. Nauka z przeglądania

W OpenBot agent może uczyć się z tego, co człowiek ogląda w przeglądarce. To oznacza wysyłanie treści oglądanych stron do modelu. W ustawieniach serwera jest już wyłączony przełącznik „Ucz się z przeglądania”.

- **Tylko na życzenie:** osobny przycisk „Pokaż to agentowi” wysyła jedną stronę, gdy sam klikniesz.
- **Ciągle w tle:** agent widzi wszystko, co otwierasz. Duże ryzyko dla prywatności (banki, poczta).
- **Nie robić.**

Rekomendacja: tylko na życzenie, jedna strona na kliknięcie, z widocznym potwierdzeniem.

## 3. Okno obrazu w obrazie (PiP) przeglądarki

Mały pływający podgląd przeglądarki, gdy agent pracuje. To duża zmiana w oknach programu, bez wpływu na dane. Warto, jeśli często zostawiasz agenta samego z przeglądarką.

## 4. Marketplace (katalog dodatkowych pluginów)

Decyzja 26.11: wybrałem najprostszą opcję. W repozytorium jest mały katalog w folderze `katalog-pluginow` (na start 3 pluginy bez logowania: Pamięć agenta, Myślenie krok po kroku, Dokumentacja bibliotek). Program wczytuje go z folderu: Marketplace > Aplikacje > Wybierz folder katalogu. Jak dodać kolejny plugin: `katalog-pluginow/README.md`. Folder można w każdej chwili przenieść do osobnego repozytorium, kod się nie zmieni.

Nie sprawdziłem w prawdziwym oknie, że te trzy pluginy się uruchamiają (wymagają Node.js i dostępu do internetu przy pierwszym starcie). Katalog z 251 pozycjami z OpenBota zostaje poza zakresem.

## 5. Członkowie i Strony w ustawieniach serwera

Zapraszanie osób i hostowanie stron wymagają usługi w internecie. Program działa dziś tylko na tym komputerze. Decyzja: czy w ogóle budować usługę, a jeśli tak, to gdzie ma działać i kto za nią płaci.

## 6. Rzeczy, które zostały po Twojej stronie

- Domyślna gałąź repozytorium: zmienić na `codex/cosgral-desktop`.
- Rejestracja aplikacji GitHub (Client ID i Sekret), żeby logowanie przez GitHub działało.
- Lista testów na Windows: `TEST-NA-WINDOWS.md`.
- Jasny motyw zostaje jak jest (Twoja wcześniejsza decyzja).
