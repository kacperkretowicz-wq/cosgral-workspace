# P0: pomiar health i profil CPU

Stan 4 XI 2026: pierwotne zawieszenie ~110 s pozostaje niewyjaśnione. Ten dokument
opisuje zbieranie dowodów, nie naprawę ani odbiór P0.

`scripts/cosgral-profile-server.mjs` działa w osobnym procesie, aby blokada pętli
zdarzeń aplikacji nie zatrzymywała pomiaru. Najpierw włącza profiler CPU przez
lokalny Node Inspector, potem wykonuje pojedyncze, kolejne żądania health.
Po błędzie HTTP, timeout lub przekroczeniu progu zapisuje próbkę i żąda profilu.
Nie zabija ani nie restartuje serwera. Inspector może potrzebować czasu na
odblokowanie pętli; domyślny limit pobrania profilu wynosi 180 sekund.
Jeśli pobranie zawiedzie, próbki health pozostają w katalogu wynikowym.

## Uruchomienie na docelowym Linuksie

Użyj Node 24.18.0, pnpm 9.15.4, istniejącej konfiguracji testowej i osobnej bazy.
Zatrzymaj inne testy z modelami w tym samym drzewie. Sandbox bwrap pozostaje
włączony. Konta a/c/d są historyczne: na nowym hoście zaloguj oficjalnie własne
uprawnione konto Codex; nie kopiuj poświadczeń innych osób.

1. Uruchom testowy backend z Inspectorem na loopback. W istniejącej konfiguracji
   testowej ustaw port API 3199. Przykładowe polecenie uruchomienia procesu:

   ```sh
   pnpm --filter @paperclipai/server exec node --inspect=127.0.0.1:9229 --import tsx src/index.ts
   ```

   Inspector daje kontrolę nad procesem. Nie wystawiaj portu 9229 publicznie.
   Instancja `local_trusted` służy wyłącznie lokalnemu testowi, nie wdrożeniu dla
   dwóch osób. Trwałe dane wdrożenia Oracle muszą mieć oddzielną konfigurację.

2. W drugim terminalu, z katalogu repozytorium:

   ```sh
   node scripts/cosgral-profile-server.mjs \
     --inspector http://127.0.0.1:9229 \
     --health http://127.0.0.1:3199/api/health \
     --duration-sec 900 --stall-ms 2000 \
     --out test-results/cosgral-profile
   ```

   Zaczekaj na komunikat `CPU profiling active`. Brak poprawnego połączenia z
   Inspectorem jest błędem; nie uruchamiaj wtedy scenariusza odbioru.

3. W trzecim terminalu uruchom istniejący rzeczywisty scenariusz:

   ```sh
   node scripts/cosgral-e2e-approval.mjs \
     --api http://127.0.0.1:3199 --codex-home "$HOME/.codex"
   ```

4. Zachowaj log A/B/C i katalog `run-*` zawierający `health.jsonl` oraz
   `server.cpuprofile`. Kod wyjścia profilera 1 oznacza błąd health lub przerwanie;
   0 oznacza wyłącznie brak takiego błędu w zadanym oknie. Ani jeden wynik sam
   nie dowodzi poprawności approval. Po zapisaniu profilu można zakończyć serwer.

Profil otwórz w Chrome DevTools, panel Performance. Powiąż gorące stosy z czasem
próbek health i etapem testu approval. Dla powtarzalnego błędu wprowadź poprawkę
w module będącym przyczyną, a następnie ponów ten sam scenariusz z pomiarem.
Nie uznawaj timeoutu sieciowego za dowód blokady CPU bez profilu i logów.

Profile mogą ujawniać lokalne ścieżki i nazwy funkcji. Katalog `test-results/` jest
ignorowany przez Git. Nie publikuj surowych profili ani logów bez przeglądu.

## Weryfikacja narzędzia

```sh
node --test scripts/cosgral-profile-server.test.mjs
```

Testy uruchamiają rzeczywisty proces Node z Inspectorem: zdrowy HTTP, blokada CPU
z timeoutem health i zapisanym profilem oraz odmowa adresom spoza loopback.
Sprawdzają też, że profiler nie kończy procesu docelowego. Nie uruchamiają modelu,
nie odtwarzają pierwotnego P0 i nie potwierdzają zgodności izolacji na Oracle ARM.
