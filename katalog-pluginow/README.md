# Katalog dodatkowych pluginów

To mały katalog pluginów, które można podpiąć do agentów (Marketplace > Aplikacje). Program wczytuje go z folderu.

## Jak go użyć w programie

1. Pobierz to repozytorium (albo tylko ten folder).
2. W programie wejdź w Marketplace > Aplikacje i wybierz **Wybierz folder katalogu**. Wskaż folder `katalog-pluginow`.
3. Kliknij plugin i **Zainstaluj**. Plugin zaczyna działać dopiero po instalacji. Sam katalog niczego nie uruchamia.

Pluginy z tego katalogu uruchamiają się przez program Node.js (polecenie `npx`), więc Node.js musi być zainstalowany.

## Jak dodać plugin

1. Dodaj folder `<nazwa-pluginu>` z plikiem `<wersja>.json` (wzoruj się na istniejących, na przykład `pamiec-agenta/1.0.json`).
2. Uruchom `bun scripts/build-plugin-catalog.ts`. Skrypt liczy sumy kontrolne i zapisuje `catalog.json`.
3. Zrób commit razem z `catalog.json`. Plik zmieniony ręcznie bez tego kroku zostanie pominięty przy wczytywaniu.

Ten folder można w każdej chwili przenieść do osobnego repozytorium (na przykład `cosgral-katalog`): program czyta zwykły folder, więc nic w kodzie się nie zmienia.
