# KK-AG: „Clear history” w kanale, martwe okno ustawień usunięte

Stan: 18.11.2026, gałąź `team/kk/w12-ag` z integracji `78d908540` (zawiera parytet z `w12-ah` i BE-Y). Bez push, bez Electrona i Storybooka (typecheck storybook zielony; same historyjki nie biegły).

## 1. „Clear history” w widoku kanału

- Nowy `ChannelHistoryClear` (sekcja „Channel history” w `ChannelView`): przycisk „Clear history” → pytanie „Clear the whole history of this channel? This cannot be undone.” → „Yes, clear” / „Keep”. Po sukcesie: „Removed N messages and M tasks.”, po odmowie programu zdanie z silnika bez zmian (np. „This channel has 1 task in progress or paused. Stop or archive it first.”).
- `ChannelWorkspace`: wywołuje `channels.clearHistory`, czyści wiadomości i zadania otwartego kanału także po zdarzeniu `channel-history-cleared`. `ChannelView` dostał opcjonalny `onClearHistory` (bez niego przycisku nie ma).
- 8 nowych kluczy PL/EN.
- Atrapa w Storybooku: `mock-openbot` (BE-Y) ma `clearHistory` z tymi samymi regułami; nowa historyjka `ChannelHistoryClear.stories.tsx` (Dark, Light, pytanie otwarte w obu motywach, odmowa).

## 2. Martwe okno `SettingsModal` usunięte

Usunięte: `SettingsModal.tsx`, jego test i historyjka oraz `LanguageSettings.tsx` (język jest już w „Application settings” na ekranie „Settings”) i 4 klucze PL/EN użyte tylko tam.

Żadne prawdziwe ustawienie nie zniknęło. Mapa (okno → ekran „Settings”):

| W oknie | Teraz na ekranie „Settings” |
|---|---|
| App behavior (autostart, praca w tle, przywracanie, linki) | `AppBehaviorSection` (KK-AD, KK-AE) |
| Appearance (motyw) | `AppearanceSettings` (KK-AC) |
| Voice | `VoiceOverviewPanel` (KK-AC) |
| Updates | `UpdatesPanel` (KK-AC) |
| Context | `ContextSettingsSection` (KK-AD) |
| **Budget** (cała przestrzeń) | **`BudgetSettings` dodany teraz** (był tylko w oknie) |
| Language | „Application settings” (`AppSettingsW3`, to samo zapisywanie) |
| Notifications (atrapy) | usunięte w KK-AF; prawdziwa macierz w „Application settings” |

- `Themes.stories` (Settings Dark/Light, kontrast pod strażą) pokazuje teraz ekran „Settings” (`InitialSetup`, tryb przeglądu) zamiast okna.
- Test zastępczy: po usunięciu `LanguageSettings` test „język stosuje się dopiero po zapisie” wrócił jako test `AppSettingsW3` (zapis się nie udaje: komunikat i język bez zmian).

## Testy (po jednym pliku)

| Plik | Wynik |
|---|---|
| `ChannelHistoryClear.test` (nowy: pytanie przed czyszczeniem, sukces z liczbami, odmowa) | 3/3 |
| `ChannelWorkspace.test` (+ test: odmowa przy trwającym zadaniu, czyszczenie przez zdarzenie) | 5/5 |
| `ChannelView.test` | 2/2 |
| `AppSettingsW3.test` (+ test zapisu, który się nie udaje) | 3/3 |
| `InitialSetup.settings.test`, `InitialSetup.onboarding.test` | 4/4, 5/5 |
| `i18n.test` (bez usuniętych plików) | 8/8 |
| `App.test`, `App.eyes.test` | 97/97, 8/8 |
| `typecheck:renderer`, `typecheck:storybook`, `check:ui` | EXIT 0, EXIT 0, zielone |
| Biome (zmienione pliki) | czysto |

## Luki

1. Historyjki (`ChannelHistoryClear`, `Themes` z ekranem Settings) nie biegły: Storybook tylko lider. Ekran „Settings” jest dłuższy (doszedł Budget), więc kontrast i axe sprawdzi dopiero Storybook.
2. W atrapie demo (`mock-openbot`) nie da się zatrzymać zadania, więc sukces czyszczenia w teście `ChannelWorkspace` jest podstawiony (`mockImplementationOnce` z zdarzeniem); realne reguły są w testach silnika BE-Y.
3. Skrypty Testera szukają `.settings-modal-nav` (okna już nie ma); od T-AD są dopasowane do ekranu „Settings”, ale `sandbox-shots-w12.ts` warto przejrzeć pod kątem nagłówków `settings-*`.
4. „Okno historii” (BE-Z) czeka na kontrakt `historyWindow`; lista wyboru w ustawieniach kanału po jego oddaniu.
5. Nie oglądane w oknie.
