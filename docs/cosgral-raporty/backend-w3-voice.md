# Backend W3-BE4: głos lokalnie (odczyt głosami Windows, mowa na tekst przez whisper.cpp)

Gałąź `team/backend/w3-be4` od integracji `ad61234c1`, bez push. Opis zachowania: `docs/cosgral/parytet-0.68.md` wiersz 34, `docs/cosgral/spec-w3.md` §3, decyzja lidera `PLAN.md` „Decyzje lidera do W3” pkt 2. Kodu OpenBota nowszego niż `a6fe240` nie czytałem. Usługi online nie ma (zgodnie z decyzją).

## Wynik

| Zachowanie (spec W3 §3) | Stan | Gdzie |
|---|---|---|
| 3.2 Tekst → mowa: odczyt odpowiedzi głosem systemowym, Stop | ✓ silnik + sterownik Windows; sprawdzone na prawdziwym Windows (synteza do pliku, bez dźwięku) | `voice-service.ts`, `voice-windows.ts` |
| 3.1 Mowa → tekst: nagranie → tekst szkicu, wysłanie osobno | ✓ silnik (`transcribe` zwraca tekst, nic nie wysyła); whisper.cpp tylko z atrapą procesu (niżej) | `VoiceService.transcribe`, `WhisperCliRunner` |
| Pobranie modelu na żądanie: rozmiar, postęp, anulowanie, usunięcie | ✓ | `downloadModel`, `cancelDownload`, `deleteModel`, `deleteRuntime` |
| Karta confirm w Needs you przed pierwszym pobraniem | ✓ (`confirmForPerson`) | `VoiceService.#consentCard` |
| 3.3 Osobne hosty: awaria jednego nie zabija okna | ✓ odczyt i transkrypcja to osobne procesy (PowerShell, whisper-cli); błąd wraca jako komunikat | `voice-windows.ts` |
| 3.5 Ustawienia: włącz/wyłącz, głos, prędkość, język, model, skrót, odczyt automatyczny | ✓ zapis w `voice/settings.json` | `updateSettings` |
| 3.4 Zgoda systemu na mikrofon | — to okno (UI): nagrywanie i komunikat odmowy są po stronie renderera | — |
| Ekrany | — praca UI według kontraktu niżej | — |

## Czy binarkę whisper.cpp da się pozyskać legalnie i bezpiecznie

Tak, i silnik to robi (po zgodzie osoby):

| Plik | Źródło | Licencja | Rozmiar | SHA-256 |
|---|---|---|---|---|
| whisper.cpp 1.9.2, `whisper-bin-x64.zip` (CPU, Windows x64) | wydanie GitHub `ggml-org/whisper.cpp` v1.9.2 | MIT | 8 194 445 B | `49dcc16d…674a` (skrót z GitHuba) |
| model Tiny `ggml-tiny-q5_1.bin` | Hugging Face `ggerganov/whisper.cpp`, rewizja `5359861c…` | MIT | 32 152 673 B | `81871056…c3d7` (LFS) |
| model Base `ggml-base-q5_1.bin` (domyślny) | jw. | MIT | 59 707 625 B | `422f1ae4…8898` |
| model Small `ggml-small-q5_1.bin` | jw. | MIT | 190 085 487 B | `ae85e4a9…11bb` |

- Wartości pochodzą z publicznych metadanych (API wydań GitHub, drzewo plików Hugging Face, licencja repozytorium), odczytanych 13.11. **Samych plików nie pobierałem**: ani binarki, ani modeli.
- Najnowsze wydania (v1.9.3–v1.9.5) nie mają plików Windows, a nowsze „b5xxx” to wydania wstępne. Dlatego v1.9.2 to najnowsza stabilna wersja z binarką Windows.
- Pełne wartości SHA-256 są w `src/backend/voice-catalog.ts`.

## Jak to działa i decyzje do oceny

1. **Odczyt (TTS):** Windows PowerShell 5.1 + `System.Speech`. Stały skrypt idzie przez `-EncodedCommand`, bez pliku `.ps1` i bez zmiany zasad uruchamiania (`-ExecutionPolicy` nie jest używane), więc działa też przy zablokowanych skryptach. Tekst idzie przez stdin jako JSON tylko ze znakami ASCII (polskie znaki jako `\uXXXX`), więc nigdy nie trafia do wiersza poleceń. Prędkość 0,5–2 przechodzi na stopnie SAPI −6…+6. Stop kończy proces od razu, a nowy odczyt zatrzymuje poprzedni.
2. **Głosy:** tylko włączone głosy SAPI (`GetInstalledVoices`), z pamięcią podręczną na 60 s. Na tym komputerze są dwa: Microsoft Paulina (pl-PL) i Microsoft Zira (en-US). Głosy OneCore (Windows.Media) nie są w tej wersji.
3. **Zgoda:** pierwsze `downloadModel` otwiera kartę confirm w Needs you. Karta podaje, co i skąd się pobierze, rozmiary, licencje, sprawdzenie SHA-256 i to, że dźwięk nie opuszcza komputera. Tylko „Approve” pobiera; odmowa nie zapisuje nic na dysku. Zgoda (`consentAt`) obejmuje pobieranie i uruchamianie whisper.cpp. `deleteRuntime` ją cofa, więc następne pobranie znów pyta. Kartę pokazuje `confirmForPerson`, więc bez żadnego agenta pobranie zwraca błąd „Create an agent first…”.
4. **Pobieranie:**
   - Tylko HTTPS (port 443, bez loginu w adresie) do hostów z listy w kodzie: `github.com`, `release-assets.githubusercontent.com`, `objects.githubusercontent.com`, `huggingface.co`, CDN-y Hugging Face (`*.cdn.hf.co`, `cdn-lfs*.huggingface.co`, `cas-bridge.xethub.hf.co`). Każde przekierowanie jest sprawdzane osobno, najwyżej 5.
   - Plik powstaje jako `.part` i jest liczony w locie. Staje się prawdziwym plikiem dopiero przy zgodnym rozmiarze (dokładnie przypiętym) i SHA-256. Inaczej nie zostaje nic.
   - Postęp idzie zdarzeniami co 250 ms. Naraz biegnie jedno pobieranie.
5. **Rozpakowanie** robi własny, ścisły czytnik zip (bez PowerShell i `tar`):
   - odrzuca całą paczkę przy ścieżce z `..`, ścieżce bezwzględnej, literze dysku albo dziwnych znakach;
   - sprawdza CRC-32, limit 64 MB i 200 plików;
   - zapisuje tylko `whisper-cli.exe`, pliki `.dll` i `LICENSE*`; reszty paczki (np. `whisper-server.exe`) nie zapisuje;
   - bez `whisper-cli.exe` instalacja kończy się błędem i nic nie zostaje.
6. **Uruchomienie whisper.cpp:** tylko w `transcribe`, tylko po zgodzie i tylko z `voice/runtime/<wersja>/`. Argumenty: `-m <model> -f <wav> -l <język> -t <wątki> -nt -np`.
   - Bez powłoki, katalogiem roboczym jest folder programu, a środowisko ograniczone do `SystemRoot` i `PATH` (folder programu + System32).
   - Wątki: połowa procesorów, od 1 do 4 (tu 2).
   - Limit czasu: 4× długość nagrania, co najmniej 60 s.
7. **Nagranie:** `transcribe` przyjmuje WAV 16 kHz mono 16-bit, od 0,1 do 120 s (najwyżej ok. 3,8 MB).
   - Kontrakt daje UI `encodeVoiceWav(Float32Array)` i `checkVoiceWav`.
   - Plik tymczasowy powstaje w `voice/tmp/` i jest usuwany po każdej próbie. Po starcie programu `tmp/` i `downloads/` są czyszczone.
   - Znaczniki whisper typu `[BLANK_AUDIO]` są usuwane; cisza daje pusty tekst.
8. **Ochrona przed zapisem poza katalogiem:** każda ścieżka przechodzi przez sprawdzenie „wewnątrz `<userData>/voice`”. Nazwy plików są z katalogu w kodzie, a `modelId` tylko z listy `tiny|base|small`.
9. **Gotowość po restarcie:** zestaw jest „ready”, gdy istnieje plik znacznika z przypiętym SHA-256 (zapisany dopiero po sprawdzeniu). Przy modelu musi się też zgadzać rozmiar. Przy starcie nie liczę SHA-256 ponownie, bo 60–190 MB to za długo.
10. **Tylko Windows x64:** na innych systemach odczyt i mowa na tekst zwracają czytelny powód niedostępności.
11. **Małe zmiany we wspólnych plikach** (same dodatki):

    | Plik | Zmiana |
    |---|---|
    | `main/index.ts` | +11 (import typu i funkcji, `let voiceService`, utworzenie w bloku startu, rejestracja IPC, zamknięcie przy wyjściu) |
    | `preload/index.ts` | +2 |
    | `ipc-channels.ts` / `ipc-conversation.ts` / `ipc-desktop-apis.ts` / `ipc.ts` | +10 / +5 / +3 / +1 |
    | `agent-service.ts` | bez zmian (używam istniejącego `confirmForPerson`) |

## Kontrakt dla UI

Plik `packages/contracts/src/ipc-voice.ts`. Głos działa zawsze na tym komputerze (głośniki, mikrofon, pliki), niezależnie od wybranego serwera.

`window.openbot.voice?`:

| Metoda | Wejście | Wynik |
|---|---|---|
| `getState` | — | `VoiceState` |
| `listVoices` | — | `VoiceInfo[]` (`id`, `name`, `culture`, `gender`) |
| `speak` | `{ text, voiceId?, rate? }` (do 5000 znaków, prędkość 0,5–2) | `{ status: "done" \| "stopped" }` po zakończeniu odczytu |
| `stop` | — | `VoiceState` |
| `downloadModel` | `{ modelId: "tiny" \| "base" \| "small" }` | `{ status: "started" \| "ready" \| "declined" }`; pierwszy raz czeka na kartę w Needs you |
| `cancelDownload` / `deleteModel` | `{ modelId }` | `VoiceState` |
| `deleteRuntime` | — | `VoiceState` (cofa też zgodę) |
| `transcribe` | `{ audio: Uint8Array (WAV 16 kHz mono 16-bit), language?: "auto" \| "en" \| "pl" }` | `{ text, durationMs, language, modelId }` — tekst do szkicu, bez wysyłania |
| `updateSettings` | dowolne pola `VoiceSettings` | `VoiceSettings` |

`VoiceState`:
- `speech`: `available`, `unavailableReason`, `speaking`.
- `transcription`: `available`, `unavailableReason` (gotowy tekst do pokazania), `consent`, `busy`, `runtime` (whisper.cpp: `version`, `license`, `sourceUrl`, `sizeBytes`, `state`, `progress`, `error`), `models[]` (`id`, `label`, `description`, `sizeBytes`, `recommended`, `state`, `progress {receivedBytes, totalBytes}`, `error`).
- `settings`: `enabled`, `voiceId` (null = domyślny), `rate`, `autoRead`, `language`, `modelId`, `shortcut`.

`state` zestawu: `absent` → przycisk „Download” z rozmiarem; `downloading` → pasek z `progress` i „Cancel”; `ready` → „Delete”; `error` → `error` i „Try again”.

Ustawienia domyślne: włączone, głos systemowy, prędkość 1, bez odczytu automatycznego, język `auto`, model `base`, skrót `CommandOrControl+Shift+Space`.

Zdarzenie: `voice-changed { state }` przychodzi przy każdej zmianie (odczyt, postęp co ok. 250 ms, model, ustawienia). Zastąp cały stan.

Wskazówki dla ekranu:
1. **Nagrywanie:** `getUserMedia` + `MediaRecorder` albo Web Audio. Potem zamiana na 16 kHz mono (np. `OfflineAudioContext` 16000 Hz, 1 kanał) i `encodeVoiceWav(próbki)`. Przed wysłaniem można sprawdzić nagranie przez `checkVoiceWav`.
2. **Odmowa mikrofonu (spec 3.4):** komunikat w oknie, bez błędu w konsoli.
3. **Skrót** to akcelerator Electron, ważny w oknie programu: obsłuż go w rendererze; nie rejestruję go globalnie w systemie. Sprawdzaj go przez `isVoiceShortcut`.
4. **Wyłączony głos** (`settings.enabled = false`): ukryj przycisk nagrywania i odczytu (spec 3.5). Silnik też wtedy odmawia.
5. **Odczyt automatyczny** (`autoRead`): to UI woła `speak` przy nowej odpowiedzi agenta.

Limity: `VOICE_LIMITS` (`speakText` 5000, `audioSeconds` 120, `audioMinMs` 100, `audioBytes`, `rateMin` 0,5, `rateMax` 2).

## Testy i dowód

Polecenia uruchamiane bezpośrednio, po jednym (bez `heavy.ps1`, bez pełnego `bun run test`):

| Polecenie | Wynik |
|---|---|
| `vitest run packages/contracts/src/ipc-voice.test.ts` | 6/6 (stan, ustawienia, WAV koduj/czytaj, odmowy formatu i długości, skrót, zdarzenie) |
| `vitest run src/backend/voice-zip.test.ts` | 4/4 (CRC-32, wybór plików, `..` / ścieżki bezwzględne / litera dysku, uszkodzenie, limity) |
| `vitest run src/backend/voice-download.test.ts` | 5/5 (przypięte źródła, lista hostów, SHA-256, rozmiar, anulowanie bez resztek) |
| `vitest run src/backend/voice-service.test.ts` | 13/13 (karta przed pierwszym pobraniem, odmowa = nic na dysku, instalacja i pliki, błędny SHA-256, paczka bez exe, anulowanie, usuwanie i cofnięcie zgody, tylko Windows x64, transkrypcja z plikiem tymczasowym, odczyt i Stop) |
| `vitest run src/backend/voice-windows.test.ts` | 6/6 (`-EncodedCommand` bez `-File` i `-ExecutionPolicy`, tekst tylko na stdin, Stop, lista głosów, brak głosu, argumenty whisper-cli bez powłoki) |
| `vitest run src/main/ipc/voice-inputs.test.ts` | 2/2 |
| `bun run typecheck:node` | kod 0 |
| `bun run typecheck:renderer` | kod 0 |
| `biome check` na 23 dotkniętych plikach | 0 błędów |
| `bun scripts/voice-speech-smoke.ts` (prawdziwy Windows, bez dźwięku) | 2 głosy (Paulina pl-PL, Zira en-US); synteza „COSGRAL voice check. Zażółć gęślą jaźń.” do WAV: 147 652 B, 22 050 Hz, 3,3 s, ok. 1,2 s pracy; plik usunięty |

TDD: testy kontraktu, zip, silnika, sterowników i wejść najpierw padały (brak modułu), potem przeszły. **Wyjątek:** test pobierania (`voice-download.test.ts`) napisałem razem z kodem, bez osobnego czerwonego przebiegu.

## Czego nie sprawdziłem

- **Prawdziwego pobrania i uruchomienia whisper.cpp:** nie pobierałem binarki ani modeli. Nie mam na to zgody właściciela, a chodzi o dziesiątki–setki MB i uruchomienie pobranego programu na tym komputerze. Wszystkie ścieżki pobierania, rozpakowania i uruchamiania są sprawdzone na atrapach. Dlatego nie wiem, czy:
  - układ paczki v1.9.2 zawiera `whisper-cli.exe` (czytnik szuka go w dowolnym podfolderze, do 6 poziomów);
  - zestaw DLL wystarcza na tym komputerze (np. brak Visual C++ Redistributable dałby błąd uruchomienia z komunikatem);
  - `-np` / `-nt` zachowują się w 1.9.2 tak samo jak w starszych wersjach;
  - jakość i czas transkrypcji po polsku są wystarczające.
- **Prawdziwego klienta HTTPS** (`HttpsDownloadSource`, przekierowania GitHub → `release-assets…`, Hugging Face → `us.aws.cdn.hf.co`): sprawdziłem tylko nagłówki przekierowań (HEAD), bez pobrania. Program nie używa systemowego proxy (moduł `https` Node).
- **Odczytu na głośnikach:** próba szła do pliku, żeby nie hałasować. Dźwięku z głośników nie słyszałem.
- **IPC i preload w uruchomionym programie** (piaskownica Electron): sprawdzone tylko typecheckiem i testem parserów.
- **Karta zgody:** `confirmForPerson` oznacza karty wątkiem „remote-desktop”. Gdy zdalny pulpit zamyka swoje karty, może zamknąć też kartę głosu (wtedy wynik to „declined”). Nie sprawdzałem tego.
- Pełnego `bun run test` i budowy paczki.

## Pliki

- Nowe:
  - kontrakt: `packages/contracts/src/ipc-voice.ts` (+ test);
  - silnik: `src/backend/voice-service.ts` (+ test), `src/backend/voice-catalog.ts`, `src/backend/voice-download.ts` (+ test), `src/backend/voice-zip.ts` (+ test), `src/backend/voice-windows.ts` (+ test);
  - pomocnik testów: `src/backend/testing/zip-writer.ts`;
  - IPC i okno: `src/main/voice-ipc.ts`, `src/main/ipc/voice-inputs.ts` (+ test), `src/preload/voice-api.ts`;
  - próba: `scripts/voice-speech-smoke.ts`.
- Zmienione: `packages/contracts/src/{ipc,ipc-channels,ipc-conversation,ipc-desktop-apis}.ts`, `src/main/index.ts`, `src/preload/index.ts`, `COSGRAL-CHANGES.md`.
