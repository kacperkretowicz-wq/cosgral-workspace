# KK-AC: MISSy Testera z zrzutów 17-11-g (Updates, Voice, menu wiadomości)

Stan: 18.11.2026, gałąź `team/kk/w12-ac` z integracji `1e5f2bd70` (scalone `team/ui/w12-af`). Bez push. Programu w oknie nie uruchamiałem (Electron czeka na GO); wnioski z kodu, zrzutów Testera i testów jednostkowych.

## Wynik

| MISS (vs-071, 17-11-g) | Przyczyna | Stan |
|---|---|---|
| 2. Settings → Updates: brak nagłówka i toru | **Błąd produktu.** Okno ustawień aplikacji (`SettingsModal`, w którym są Updates, Voice, Appearance i „Launch at login”) **nie jest nigdzie otwierane** w programie (poza testami i Storybookiem). Zębatka na pasku stron otwiera ekran „Settings” (`InitialSetup` w trybie `reviewing`), który tych sekcji nie miał | **Zamknięty:** sekcje Updates, Voice i Appearance (motyw) są teraz na ekranie „Settings” |
| 3. Settings → Voice: brak nagłówka i mikrofonu | Ta sama przyczyna. Ekran miał stary `VoiceSettings`, bez przeglądu i mikrofonu | **Zamknięty:** `VoiceOverviewPanel` (nagłówek Voice, Microphone, uprawnienie, czytanie i dyktowanie) |
| 1. Menu wiadomości: tylko React | **Skrypt, nie produkt** (hipoteza, patrz niżej). Kod menu ma wszystkie sześć akcji | **Produkt potwierdzony testem**, skrypt do poprawki u Testera |

## Zmiany w kodzie

1. `InitialSetup.tsx` (tryb `reviewing`, 4 linie + importy): po „Application settings” dochodzą `AppearanceSettings`, `UpdatesPanel` i `VoiceOverviewPanel` (ten ostatni zawiera dotychczasowe `VoiceSettings`, więc nic nie ginie).
2. `docs/cosgral/PRZEWODNIK.md`: wiersze „Aktualizacje” i „Głos” opisują teraz prawdziwą drogę (zębatka → Settings → przewiń).

## Testy (po jednym pliku)

| Plik | Wynik |
|---|---|
| `InitialSetup.settings.test.tsx` (nowy: Updates + nagłówek, Voice + Microphone, motyw) | 3/3 |
| `MessageHistoryActions.menu.test.tsx` (nowy: sześć akcji w jednym menu; wyłączona akcja z powodem) | 2/2 |
| `MessageHistoryActions.test` | 4/4 |
| `InitialSetup.onboarding.test` | 5/5 |
| `AppearanceSettings.test`, `SettingsModal.test` | 2/2, 2/2 |
| `PageRail.test`, `App.eyes.test`, `i18n.test` | 6/6, 8/8, 9/9 |
| `App.test` | 95/95 |
| `typecheck:renderer`, `check:ui` | EXIT 0, zielone |
| Biome (zmienione pliki) | czysto |

## Menu wiadomości (MISS 1)

- `MessageHistoryActions` już dziś wypisuje: Copy, Branch from here, Retry, Edit message, Pin message, Delete message. Każda akcja bez zgody silnika jest **wyłączona z powodem** w tekście obok (`messageMenu`), nie ukryta i nie atrapa. Test pokazuje oba przypadki.
- Na zrzucie `09d-message-menu.png` przycisk „…” jest zaznaczony, ale menu jest zamknięte. Skrypt (`scripts/sandbox-shots-w12.ts`, ok. linii 770–776) robi `pointerdown`, `pointerup` i `click({force:true})` pod rząd. **Hipoteza, niepotwierdzona w oknie:** ten ciąg otwiera menu i zaraz je zamyka. W teście jednostkowym (jsdom) kliknięcie po otwarciu menu NIE zamyka, więc hipotezy nie potwierdziłem. Radzę Testerowi: jedno `click()` na „More message actions”, a przy szukaniu pozycji użyć wyrażeń regularnych (`/^Retry/`), bo nazwa wyłączonej pozycji ma dopisany powód.
- Nazwy pozycji: tekst „Copy” (nie „Copy message”), „Pin message” / „Unpin message”, „Branch from here”, „Retry”, „Edit message”, „Delete message”.
- Edycja i ponowienie są dostępne tylko na własnych wiadomościach osoby; na odpowiedzi agenta „Edit message” jest wyłączone z powodem (stąd w pierwszym podejściu testu nie było pozycji o dokładnej nazwie).

## Luki i decyzja dla lidera

1. **Okno `SettingsModal` jest martwe.** Poza tym, co przeniosłem (Updates, Voice, Appearance), zostają w nim sekcje, do których nikt nie dojdzie: **„Launch at login”** (KAPI, `behavior.launchAtLogin`), Notifications i Advanced. Decyzja: (a) przenieść „Launch at login” na ekran „Settings” (osobny komponent, ok. 1 h), czy (b) otworzyć `SettingsModal` z zębatki i przenieść ekran dostawców do niego (większa zmiana, rusza W5). Rekomenduję (a).
2. Skrypt Testera szuka `.settings-modal-nav` i `getByRole("dialog")`. Na ekranie „Settings” nie ma bocznej nawigacji: sekcje są jedna pod drugą, a nagłówki mają `id="settings-updates"`, `id="settings-voice"`, `id="settings-voice-microphone"`. Lokatory trzeba zmienić (Tester, T-AD).
3. Nie oglądałem tego w oknie ani w Storybooku.
