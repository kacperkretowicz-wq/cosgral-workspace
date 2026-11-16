# W5-UI1a: zarządzane CLI w interfejsie

Gałąź: `team/ui/w5-ui1`. Baza kontraktu: `1f521605d`, scalona integracja `codex/cosgral-desktop` oraz końcowy BE1 `d7f7a3fae`. Bez push.

## Zakres

- Providers/Usage: Narzędzia CLI, Codex i Claude; źródło, wersja używana/pobrana/najnowsza, pobierz/sprawdź/aktualizuj/usuń wyłącznie pobraną kopię, automatyczne aktualizacje, przypięcie/odpięcie, własna ścieżka i jej wyczyszczenie. Walidacja pełnej ścieżki, długości i znaków sterujących; sprawdzenie pliku i wersji należy do silnika.
- Fazy pochodzą z `managed-cli-changed`: sprawdzanie, oczekiwanie na zgodę, pobieranie (bajty i procent, nieznany rozmiar bez udawanego procentu), SHA-256, instalowanie, usuwanie, błąd i ponów. Kontrolki zajętego CLI są blokowane. Błędy maskują ścieżki profilu.
- Pierwsza instalacja: istniejący `DraftPreviewCard` z `variant: confirm`, dostarczony przez BE1 do Needs you. Renderer obsługuje go istniejącym ActionCard, bez drugiego typu karty. Backend podaje nazwę, wersję, rozmiar i oficjalne źródło, bez ścieżki profilu. Bez agenta Backend używa systemowego dialogu (onboarding). Dodana historia zgody CLI.
- Onboarding lokalny: wybrany dostawca ma sekcję Połącz dostawcę. Bez CLI zwykłe Continue jest zablokowane; Pobierz i przejdź dalej instaluje i wywołuje dotychczasowe zapisanie wyboru. Odrzucenie zgody/błąd nie przechodzą dalej. Dostępna informacja Logowanie wkrótce, bez martwego przycisku logowania. Starsze wersje bez opcjonalnego subscriptions zachowują dotychczasowy setup.
- Komponenty `components/ui`, tokeny istniejącej palety COSGRAL; siatka składa się do jednej kolumny, przyciski zawijają się.

## Weryfikacja

- Node + Vitest: ManagedCliSection 8/8 (akcje, walidacja, maskowanie, postęp, zdarzenie silnika, pomyślna instalacja i callback).
- InitialSetup.onboarding 3/3, w tym brak CLI → instalacja → zapis bez terminala.
- Storybook/Chromium: ManagedCli 9/9 i ActionCards 3/3. Stany: brak, pobieranie, błąd, auto-update wyłączone, własna ścieżka, zgoda, weryfikacja, instalowanie, jasny motyw. Testy interakcji: pobierz, blokowanie, procent, ponów.
- Typecheck renderer i Storybook: oba exit 0 po końcowych zmianach.
- Biome na ośmiu zmienionych plikach: zielony. `check:ui`: zielony. Impeccable detect dla nowego komponentu: `[]`.
- Testy uruchamiane pojedynczymi plikami. Runner przez Node: uruchomiony przez Bun ładował serwerową wersję Solid, więc nie użyto jego wyniku jako dowodu UI. Storybook używa istniejącego wspólnego katalogu Playwright, niczego nie doinstalowano.

## Kontrakt

Nie brakuje typu karty zgody CLI: `draft-preview` + `variant: confirm`, `respondToDraftPreview`, `draft-preview-resolved` już istnieją. Sam `ManagedCliState` nie niesie rozmiaru/adresu instalacji; te dane dostarcza tekst karty BE1 i nie trzeba ich dublować w UI.

Kont i metod logowania nadal brak w `SubscriptionsDesktopApi` (BE2). Dalszy ekran będzie potrzebował listy kont i ich stanów oraz rozpoczęcia/anulowania logowania, przekazania kodu i wylogowania; nie dodano fikcyjnych wywołań do obecnego kontraktu.

## Czego nie sprawdziłem

- Nie oglądałem okna Electron ani renderowanych historii osobiście; Storybook sprawdzono automatycznie w headless Chromium. Nie twierdzę, że wykonano ręczny odbiór wyglądu, klawiatury lub czytnika ekranu.
- Nie uruchamiałem programu z prawdziwym profilem, logowania, prawdziwego pobierania CLI, automatycznej aktualizacji w tle ani prawdziwych kont. Testy silnika/e2e są po stronie BE1 i KK.
- Nie uruchamiałem pełnego `bun run check`, typecheck całego repo, build ani `sandbox:e2e`. Nie zmieniałem danych OpenBota ani cudzych worktree.
- C01–C13: interfejs dostarcza odpowiednie kontrolki i prezentację; pobranie z oficjalnego hosta, SHA-256, czyszczenie pliku i ciągłość tury wymagają odbioru silnika. Nie oznaczam całych kryteriów jako odebranych wyłącznie na podstawie testów UI.
