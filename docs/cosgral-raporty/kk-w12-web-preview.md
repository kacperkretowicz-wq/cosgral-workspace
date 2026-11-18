# KK-V: odświeżenie podglądu w przeglądarce (przed pushem)

**Wynik:** instrukcja gotowa, grep prywatności czysty. Niczego nie budowałem (ciche okno, `GO-lead-check.txt`). Baza: integracja `fb6a09a6d`, gałąź `team/kk/w12-preview`, bez push.

`<Shared>` = katalog Shared na tej maszynie (nie wpisuję jego pełnej ścieżki, bo zawiera nazwę profilu Windows).

## 1. Kroki dla lidera (po zielonym checku i push)

Czas: budowa ok. 1–3 min, publikacja ok. 1 min. **Czasu budowy nie mierzyłem**, to szacunek. Zmierz przy pierwszym biegu.

1. Ustaw PATH i wejdź na zielony tip integracji:
   ```powershell
   $env:PATH = "<Shared>\tools\bun;<Shared>\tools\node;<Shared>\tools\git\cmd;$env:PATH"
   cd <Shared>\cosgral-desktop      # gałąź codex/cosgral-desktop, po scaleniu i checku
   ```
2. Zbuduj (katalog wyjściowy domyślnie `out/web-preview`, w `.gitignore`):
   ```powershell
   bun x vite build --config scripts/web-preview/vite.config.ts
   ```
   Inny katalog: `$env:COSGRAL_PREVIEW_OUT = "<ścieżka>"` przed budową.
3. Skan prywatności wyniku (ma dać 0 trafień):
   ```powershell
   Select-String out\web-preview\assets\*.js -Pattern "norbert|openbot\.run"
   Select-String out\web-preview\assets\*.js,out\web-preview\index.html -Pattern "<nazwa-profilu>|<imię-właściciela>|<domena-e-maila-właściciela>|openbot-0\.71"
   ```
4. Sprawdź limity hostingu: `Get-ChildItem out\web-preview -Recurse -File | Measure-Object Length -Sum` oraz liczba plików.
   - każdy plik < 1 MB, razem < 2 MB, najwyżej 20 plików;
   - dozwolone typy: HTML, CSS, JS, JSON, SVG, WebP, PNG, JPEG, ICO, WOFF2, TXT;
   - zakazane: mapy źródeł (`sourcemap: false` jest w configu), archiwa, `.env`.
5. Obejrzyj lokalnie (opcjonalnie):
   ```powershell
   bun x vite preview --config scripts/web-preview/vite.config.ts --host 127.0.0.1 --port 4799
   ```
   Uwaga: `bun run preview` to inne polecenie (`scripts/preview.ts`), nie podgląd w przeglądarce.
6. Publikacja: `openbot.replace_site` na site `719c8813-2101-48c4-9b82-cd2fd968d983`, katalog `out/web-preview`. Adres zostaje, nowe 30 dni wygaśnięcia liczone od podmiany. Wymaga jawnego polecenia właściciela lub rutyny (samo „zbuduj” nie wystarcza).
7. Sprawdź adres po podmianie: `index.html`, ładują się 3 pliki JS i 2 CSS, widać plakietkę „Podgląd · dane demo, bez silnika”, sekcję „Needs you” i wskaźnik oczu.

## 2. Co zmienić w repo przed budową

**Nic.** Konfiguracja jest gotowa:
- `scripts/web-preview/vite.config.ts` podmienia w plikach z `src/renderer/stories/`: `Norbert` → `Owner`, `"norbert"` → `"owner"`, `https://openbot.run/docs` → `https://example.com/docs`.
- `main.tsx` uruchamia prawdziwy `App` na atrapie `createMockOpenBot` (wersja 0.2.0, platforma win32) i po 800 ms wysyła dwie karty „Needs you” oraz sesję oczu.
- `index.html` ma `noindex, nofollow` i plakietkę demo.

Ryzyko do pilnowania: po ostatniej budowie (15.11, 6 plików, 1,17 MB; największy plik `index-*.js` 510 KB) doszło wiele ekranów i 40 plików `mock-*.ts`. Rozmiar sprawdź po budowie (pkt 4). Limit pliku to 1 MB, a `vendor` jest już wydzielony; przy przekroczeniu rozbij `manualChunks` w `vite.config.ts`.

## 3. Czego NIE publikować

1. Zrzutów z nazwą konta lub paskiem systemu (podgląd ma tylko PNG, SVG i ikony z `build/`, bez zrzutów).
2. Ścieżek z nazwą profilu Windows oraz e-maili właściciela.
3. Kodu, tekstów, ikon i zrzutów z `openbot-0.71*` (PolyForm Noncommercial, materiały leżą poza repo w `cosgral-docs`). Do katalogu wyjściowego nic stamtąd nie kopiuj.
4. Danych prawdziwego silnika (`AppData\Roaming\OpenBot`, tokeny, klucze). Podgląd ich nie czyta, bo działa na atrapie.
5. Plików `.map`, archiwów, `.env`, `out/` innych niż `web-preview`.
6. Danych testowych poza wbudowaną atrapą (np. eksportów z sandboxa).

## 4. Grep prywatności kodu podglądu (stan `fb6a09a6d`)

Zakres: `scripts/web-preview/`, `src/renderer/stories/` (cała atrapa), `src/renderer/src/`.

| Szukane | Wynik |
|---|---|
| Nazwa profilu Windows, `C:\Users`, `AppData`, imię i nazwisko oraz e-mail właściciela (wzorce trzymam poza repo) w `scripts/web-preview` | **0 trafień** |
| To samo w `src/renderer` | tylko identyfikator kodu `appData` (DataWipeSection) i jeden **test** (`mock-acp-presets.test.ts`) z ogólną ścieżką `C:\Users\demo\AppData\…`; testy nie wchodzą do bundla |
| Ścieżki w atrapie | tylko `/mock/COSGRAL/...`; brak liter dysków, `/home`, `/Users` |
| E-maile w kodzie bez testów | wyłącznie przykłady: `person@example.com` (19×), `alice/jon/maya/new-person@example.com`, `demo@example.test`, `you@example.com`, `Person@Example.com`, placeholder `person@company.com` (HostPanel) |
| `norbert` / `openbot.run` | 10 trafień, wszystkie w `src/renderer/stories/` (fixtures, mock-openbot, 3 stories), czyli w zakresie podmiany z `vite.config.ts`; poza stories i testami brak |
| `openbot-0.71`, `PolyForm`, `cosgral-docs` | 0 trafień w `src/renderer` i `scripts/web-preview` |
| Odniesienie „0.71” | jeden **komentarz** w `styles/cosgral.css:1190` (`shaped after the 0.71 reference measurements`); minifikacja usuwa komentarze, ale dla pewności sprawdź wynik krokiem 3 |

Uwagi:
- `person@company.com` to domena realna, użyta jako placeholder. Zamiana na `example.com` jest opcjonalna i osobna.
- Plugin podmiany działa tylko dla plików w `stories/`; nowe pliki z danymi poza tym katalogiem nie byłyby oczyszczone. Dziś takich nie ma w zakresie grepa.
- Grep dotyczy źródeł. **Wyniku budowy nie skanowałem** (nie budowałem). Pkt 3 z sekcji 1 zamyka tę lukę.

## 5. Luki

1. Czas budowy i rozmiar po budowie: niezmierzone.
2. Wygląd podglądu po ostatnich scaleniach (karty agenta, edytor Workflows, kafle paska): nieoglądany.
3. Publikacja (`replace_site`): nie wykonana, to krok lidera.
