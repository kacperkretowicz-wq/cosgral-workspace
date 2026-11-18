# KK-AK: odbiór moich paneli po zrzutach Testera 17-11-i i 17-11-j (kolejka KK #7 i #11)

Stan: 18.11.2026, gałąź `team/kk/w12-ai` z integracji `8da9dfd32`. Zrzuty poza repo: `Shared\cosgral-docs\zrzuty-cosgral-17-11-i` i `-j` (obejrzałem PNG, nie tylko `notes.tsv`). Bez Electrona, bez uruchamiania czegokolwiek.

## Wynik

**Z 8 paneli na PNG widać prawidłowo 4. Updates i Voice na zrzutach pokazują zupełnie inne ekrany, a „OK” w `notes.tsv` dla nich jest fałszywe. Integracji, logowania MCP i Podagenci na zrzutach nie ma wcale.**

| Panel | Zrzut | Co widać na PNG | Ocena |
|---|---|---|---|
| Mobile Connect (Phone) | `20` | Baner „Encrypted (TLS)”, „Connection” z listą „Who can reach this computer”, „Turn on and pair a phone”, „Paired phones”, „Certificate” z „Rotate certificate…”, „How phones reach this computer” | **OK** |
| Komunikatory | `17` | Karty Telegram i Slack („Not connected”, pole „Bot token”, podpowiedź skąd go wziąć, „Connect”, „How to set it up”, „Who may talk to an agent”) | **OK** |
| Zdalny pulpit | `21` | „Who may come in” (Sharing Off, „Ask on this computer every time”, Unattended access Not available), „Share this computer”, „Connect to another computer” | **OK** |
| Vault i menedżery haseł | `13` | Vault (0 items, „Add item”), 1Password / Bitwarden / Proton Pass „Not connected” z „Check the tool” i „Connect” | **OK** |
| Aktualizacje (Updates) | `16` (i, j, a także h) | **Workflows → Versions.** Ekran Settings nie widać | **NIE widziane** |
| Głos (Voice) | `19` (i, j) | **Server settings → MCP „Open”.** Ekran Settings nie widać | **NIE widziane** |
| Logowanie MCP | `18` | Server settings → MCP z przyciskiem „Open”; samego panelu logowania nie ma | **NIE widziane** |
| Integracje kont (GitHub, Google, Notion, Meta) | brak | Zrzut `13` kończy się na menedżerach haseł, sekcja „Connect accounts” jest niżej | **brak zrzutu** |
| Podagenci | brak | żaden zrzut nie rozwija „Threads: …” | **brak zrzutu** |

## Dlaczego „OK” w notatkach nie wystarcza

`notes.tsv` pisze „OK:heading OK:track” dla 16, „OK:voice OK:mic” dla 19 i „OK:mcp OK:servers” dla 18, a PNG tego nie pokazują. Znaczy to, że lokatory w `sandbox-shots-w12.ts` łapią tekst, którego nie ma na widocznym ekranie (np. „Updates” w innym miejscu DOM), więc lista kontrolna nie dowodzi widoczności. **Nie ufaj „OK” bez obejrzenia PNG.**

## Co za to jest dowodem, że Settings działa w prawdziwym oknie

W5, krok 39 (`sandbox-acceptance.ts`): otwiera „Settings”, w sekcji „Application settings” zmienia język i macierz powiadomień, zapisuje i czyta ustawienia z programu; wszystko przeszło (W5 33/33 w T-AI). Czyli ekran Settings otwiera się i zapisuje. Nie dowodzi to, że **Updates** i **Voice** się na nim rysują (to inne sekcje tej samej strony).

## Czego nie wiem

1. Czemu skrypt zrzutów nie pokazuje Settings w 16 i 19. Hipotezy do sprawdzenia przez Testera: (a) ekran Settings jest `position: absolute` w przewiniętym kontenerze i leży poza kadrem; (b) kliknięcie bramki otwiera i od razu zamyka ekran; (c) zrzut jest robiony z innego okna niż to, w którym działa lokator. Bez uruchomienia nie rozstrzygnę.
2. Czy Updates i Voice wyglądają dobrze: nie widziałem ich ani razu w oknie, tylko w testach jednego pliku (`UpdatesPanel`, `VoiceOverviewPanel`).

## Prośba do Testera (przy następnym GO, nie ruszam jego skryptu w trakcie T-AJ)

1. Kroki 16 i 19: otwórz Settings tak jak krok 39 (`openPage("Settings")`), przewiń do sekcji i **sprawdź, że sekcja mieści się w oknie** (`boundingBox` w obrębie widoku) zanim zrobisz zrzut; bez tego zapisz FAIL zamiast OK.
2. Dodaj zrzuty: „Connect accounts” (Biblioteka przewinięta niżej), panel logowania MCP (po „Open”), Podagenci (agent → „Threads: …” rozwinięte).
3. Sprawdź w `Updates` przycisk „Check for updates” i w `Voice` zgodę na mikrofon.
