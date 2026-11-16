# W5-UI1b: konta i pula dostawców

Gałąź: `team/ui/w5-ui1b`. Baza: Backend BE2 `5931ffced` (kontrakt `e1f60cd87`), scalona integracja `6ab40a89b`. Bez push. Gałęzie W3-UI6 i W5-UI1 zachowane.

## Co działa na atrapie

1. Strona Dostawcy: Konta i pula, osobno Codex i Claude. Etykieta, maskowane konto z kontraktu, plan, zalogowane/wylogowane, konto systemowe/domyślne, limit do określonej godziny. Dodanie konta ma własną etykietę i tekst `ACCOUNT_POOL_WARNING` (nowe konto jest w puli według BE2). Nigdy nie pokazujemy `stateDir` ani folderu profilu.
2. Logowanie: oczekiwanie na przeglądarkę, ponowne otwarcie adresu HTTPS przez `openUrl`, kod urządzenia, pole hasłowe na kod logowania (bez zapisu, wyczyszczenie po przekazaniu/anulowaniu/zakończeniu), anulowanie, sukces, błąd i ponów. Odśwież, wyloguj, usunięcie po potwierdzeniu. Konto systemowe nie ma logowania, terminala, wylogowania ani usuwania w UI. Terminal jest widoczny dopiero po błędzie jako opisane obejście; metoda BE2 wywołuje istniejącą kartę zgody przed otwarciem terminala. Na atrapie niczego nie logowano ani nie uruchamiano naprawdę.
3. Pula: każde włączenie konta otwiera potwierdzenie z `ACCOUNT_POOL_WARNING`. Osobne Włączone, ustawienie konta domyślnego, widoczna kolejność i strzałki z natywną obsługą klawiatury. Kontrolki blokowane na czas zapisu. Limit 1–10, domyślnie 3; pełna pula i limit dodawania mają komunikaty. Kontrakt BE2 ogranicza również całkowitą liczbę dodanych kont, więc UI opisuje oba skutki tego ustawienia.
4. Agent: Konto: Domyślne / etykieta konta, wyłącznie konta dostawcy zapisanego modelu. Zapis przez `assignAccountToAgent`; Domyślne wysyła `null`. Po zmianie modelu wybór jest zablokowany do zapisu profilu; udany zapis odświeża dostawcę i odblokowuje wybór. Pozostawione przypisanie innego dostawcy/usuniętego konta ma wyraźny komunikat i możliwość wyboru domyślnego. Dla ACP brak fikcyjnego wyboru kont.

## Kontrakt i granice

- Użyte są wyłącznie metody z `subscriptions` i istniejące `openUrl`, `agentSettings.update`. Stan idzie z `listAccounts` i `accounts-changed` (pełny snapshot). Aktualizacja zachowuje kartę po ID, fokus i wpisywany kod zamiast odtwarzać cały formularz.
- Karta terminala: istniejący mechanizm confirm w Needs you (BE2), bez wymyślania nowego typu.
- Brakuje informacji o **aktywnym** koncie agenta: obecne `AccountsSnapshot.assignments` opisuje wybór zapisany przez użytkownika, nie konto faktycznie używane w bieżącej turze po przejściu przy limicie. Potrzebne od K1: identyfikator/etykieta aktywnego konta w stanie/zdarzeniu agenta. Nie wyświetlam przypisania jako dowodu, że odpowiada to konto.
- Użycie folderu konta w procesie agenta, przejście przy limicie, powrót i karta po pierwszej akcji należą do K1; UI ich nie udaje.
- Raportu `backend-w5-be2.md` jeszcze nie było w bazie podczas rozpoczęcia; kontrakt i źródło `provider-accounts.ts` potwierdzają zachowanie zgody terminala i ochronę systemowego konta.
- Naprawiona zgodność UI1a z rozszerzeniem API: akcje ManagedCliSection są jawnym zbiorem metod CLI; wcześniejsze `Exclude<keyof SubscriptionsDesktopApi, listCli>` zaczęło obejmować metody kont i psuło typecheck. Usunięte nieaktualne „logowanie wkrótce”.

## Dowody

- Jednostkowe, pojedynczymi plikami przez Node/Vitest: ProviderAccounts 8/8, AgentAccountPicker 2/2, AgentSettingsW3 2/2, regresja ManagedCliSection 8/8. Łącznie 20/20. Obejmują systemowe konto, zgodę puli, potwierdzenie usunięcia, kod, adres HTTPS, kolejność, pełny limit, zachowanie fokusu przy zdarzeniu, filtr dostawcy, null, błąd zapisu oraz zapis zmiany modelu.
- Storybook: 8/8 historii przeszło w Chromium po końcowych zmianach. 8 historii (brak kont, tylko systemowe, limit, błąd, kod, oczekiwanie na przeglądarkę, jasny motyw, dodaj/zaloguj/przesuń Enterem). Atrapa `mock-accounts.ts` przez `createMockOpenBot`; dane demonstracyjne.
- Obejrzany Storybook w prywatnej przeglądarce: widok ciemny przy 1912 px oraz ciemny/jasny w wąskim widoku ok. 390 px. Poprawione odstępy i grupowanie oznaczeń. Brak poziomego przepełnienia w sprawdzonym wąskim widoku (scrollWidth 382, innerWidth 390). To nie jest odbiór okna Electron.
- Typecheck renderer i Storybook: exit 0. `check:ui`: zielony. Impeccable detect nowych komponentów: `[]`. Biome na zmienionych plikach.
- Serwer Storybook uruchomiony tylko na loopback, zatrzymany po oglądaniu; karta przeglądarki zamknięta. Logi diagnostyczne pozostały poza repo w katalogu piaskownicy (`ui-w5-ui1b-storybook*.log`); cache narzędzi w ignorowanym node_modules. Nie zapisano zrzutów do repo.

## Czego nie sprawdziłem

- Nie oglądałem okna Electron. Nie uruchamiałem sandbox:e2e, prawdziwego terminala, karty zgody z prawdziwego procesu głównego, usuwania folderu konta ani logowania na rzeczywistym koncie. Nie czytałem plików logowania.
- Nie odbierałem przejścia przy limicie, ochrony przed powtórzeniem akcji ani zmiennych środowiska procesu konta (K1). Kryteria L/P silnika pozostają do odbioru BE/KAPI/KK.
- Nie uruchamiałem pełnego bun run check/test, build, typecheck node ani testów całego repo. Zmiany dotyczą renderera i historii; zmergowany silnik ma niezależny odbiór zespołu.
- Nie wykonywałem pełnego audytu czytnikiem ekranu ani macierzy DPI Windows. W dev Storybook są ostrzeżenia Solid STRICT_READ_UNTRACKED z istniejących Field/Switch oraz statycznej konfiguracji historii; testy interakcji i a11y Storybook przechodzą, nie twierdzę że konsola jest bez ostrzeżeń.
