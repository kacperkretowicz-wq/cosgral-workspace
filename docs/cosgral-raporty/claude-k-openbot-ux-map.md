# MONARCHIA — mapa UX OpenBot (REA) + rekomendacja powłoki desktop

Autor: Claude K · 11.11.2026 · cel: przestrzeń agentów tylko dla Kacpra i Jakuba, UX inspirowany OpenBotem, silnik COSGRAL/Paperclip.

## TL;DR
- OpenBot 0.67.1 to aplikacja Electron. Interfejs napisano w **SolidJS**, główny proces działa w Node i trzyma lokalny serwer z bazą SQLite (`node:sqlite`). Agenci to zewnętrzne CLI: Codex, Claude, Gemini (przez Antigravity), Grok, OpenCode oraz dowolny agent zgodny z ACP.
- Rdzeń UX to cztery rzeczy:
  - **pasek serwerów → pasek stron → lista agentów i kanałów w folderach → czat z panelem bocznym**,
  - **stany „czeka na ciebie”** widoczne wszędzie: pasek boczny, wyspa, dok, powiadomienia,
  - **karty akcji** w czacie: pytanie, zatwierdzenie, przejęcie przeglądarki,
  - **Vault, Rutyny i Pamięć** jako osobne powierzchnie.
- COSGRAL/Paperclip ma już mocny silnik: agenci, rutyny, zatwierdzenia, sekrety, skille, koszty, org chart oraz adapter `gemini-local` przez `gemini --acp`. Brakuje mu warstwy „osobistego komunikatora”: kanałów grupowych z agentami, Vaulta na loginy i karty, wbudowanej przeglądarki agenta, wyspy i doku, Mobile Connect oraz prostego onboardingu.
- **Rekomendacja: Electron, nie Tauri** (uzasadnienie w §4). Telefon na start jako PWA lub cienki klient do desktopowego serwera przez Tailscale. Natywna aplikacja dopiero potem.

## 0. Metoda i dowody (REA)
- Cel: `C:\Users\kretowicz_k\AppData\Local\Programs\openbot\resources\app.asar`, 8251 wpisów.
- Serwer REA MCP nie był podpięty do tej sesji. Zrobiłem więc statyczną inwentaryzację paczki: listę plików przez `@electron/asar` i odczyt manifestu, nazw modułów interfejsu oraz polskich etykiet UI (`messages/pl/*.ts`, 7437 kluczy). Etykiety pokazują ekrany i stany bez czytania logiki.
- **Nie kopiowałem kodu.** Poniżej są tylko nazwy powierzchni, ich funkcje i przepływy, opisane własnymi słowami.
- Obserwacja = coś jest w paczce. Nie uruchamiałem aplikacji pod debuggerem, więc zachowanie w runtime to wnioski.
- **Licencja OpenBot: PolyForm Noncommercial 1.0.0** (plik LICENSE w paczce; NOTICE: Synthetify Labs). Inspiracja UX przy własnym kodzie jest OK. Kopiowanie kodu, assetów, nazw czy brandingu odpada. Przy prywatnym, niekomercyjnym użytku ryzyko jest małe, ale trzymamy się własnej implementacji na bazie Paperclip (licencja MIT).
- Tymczasowo rozpakowałem paczkę do mojego katalogu agenta i po analizie usunąłem rozpakowane pliki. Została lista plików `rea-openbot\asar-list.txt`.

## 1. Architektura OpenBot (obserwacje)
| Warstwa | Co jest w paczce |
|---|---|
| Powłoka | Electron, `electron-updater`, tray, autostart, wiele okien (`new BrowserWindow` ×12), `WebContentsView` (wbudowana przeglądarka), protokół `openbot://` |
| Proces główny | `out/main/index.js` (~30 MB, w tym wszystkie teksty i18n), osobne hosty `agent-database-host`, `voice-speech-host`, `voice-transcription-host` (`utilityProcess.fork` ×3) |
| Dane | `node:sqlite` (wbudowany SQLite w Node), osobny host bazy agentów |
| Serwer lokalny | `express` + `hono`, `ws`, `@modelcontextprotocol/*` (OpenBot sam jest serwerem MCP dla agentów), `standardwebhooks` (rutyny wyzwalane webhookiem) |
| Agenci | `@agentclientprotocol`, `@anthropic-ai`, Codex/Claude/Grok/Gemini(Antigravity)/OpenCode/Pi/własny ACP. Runtime'y pobierane od dostawców, nie są w paczce |
| UI | SolidJS + Kobalte, i18n w ~20 językach, mermaid/KaTeX w czacie, rrweb (nagrywanie sesji przeglądarki), `qrcode` (parowanie telefonu) |
| Zespół/zdalnie | `teamWebrtc` (preload i strona), serwery zdalne/hostowane, role i zaproszenia, remote desktop |
| Sejf | integracje 1Password, Bitwarden i Proton Pass, własny Vault (loginy, karty, kontakty, klucze API, 2FA TOTP) |

## 2. Mapa powierzchni UI OpenBot
Etykiety PL pochodzą z paczki. Opisy to moje streszczenie.

### 2.1 Nawigacja (szkielet)
1. **Pasek serwerów** (skrajnie po lewej): „na tym komputerze” oraz serwery zdalne i hostowane. Dla każdego: wycisz, ustawienia, restart, opuść, ukryj. Kolejność przeciągana.
2. **Pasek stron**: Agenci · Harmonogram · Zadania · Przepływy pracy · Użycie · Biblioteka · Marketplace · Ustawienia, plus „Więcej” i przypinanie stron. Na ikonie Użycia są pierścienie limitów dostawców.
3. **Pasek boczny agentów i kanałów**: foldery (sekcje) tworzone przez użytkownika, z przenoszeniem, duplikowaniem i zmianą nazwy; jest też sekcja „Osoby”. Każdy agent pokazuje stan:
   - *Myśli*, *Odpowiedział*,
   - *Czeka na twoją odpowiedź / zatwierdzenie / na ciebie w przeglądarce*,
   - *Czeka na limit* z godziną resetu.

   Menu agenta: edytuj, duplikuj, nowy wątek, otwórz w nowym oknie, ukryj, usuń, oznacz jako przeczytane.
4. **Widok rozmowy**: wątki jako karty, kompozytor z głosem, załącznikami, kontekstem i wyborem modelu. **Kolejka wiadomości** pozwala edytować, kierować i uruchamiać jako nowy wątek wiadomości wysłane, zanim agent skończy.
5. **Panel boczny z okienkami**: Przeglądarka · Pliki · Ustawienia agenta · Pytanie poboczne · Głos · Subagent. Można go zmaksymalizować i zmieniać mu rozmiar.
6. **Wyszukiwarka globalna** po rozmowach.

### 2.2 Czat i karty akcji (najważniejszy wyróżnik)
- Statusy pracy w trakcie odpowiedzi: „Analizowanie…”, „Łączenie faktów…” i podobne. Do tego widoczne kroki, ślad (trace), subagenci, sugestie i referencje (`chat.steps`, `chat.trace`, `chat.subagents`).
- **Karta pytania** (`QuestionPromptBubble`): od 1 do 3 pytań z opcjami do kliknięcia.
- **Karta UI** (`UiBlockPrompt`): potwierdzenie z podglądem (np. szkic wiadomości), szybkie odpowiedzi, auto-akcja z odliczaniem.
- **Karta zatwierdzenia**: uruchom polecenie, zmień pliki, nadaj uprawnienia (sieć, odczyt, zapis). Opcje: Zezwól / Zawsze zezwalaj / Odrzuć.
- **Karta kroku w przeglądarce**: przejęcie, gdy strona blokuje logowanie.
- Bogaty markdown: mermaid, KaTeX, blok kodu, lightbox obrazów, podgląd plików.

### 2.3 Kanały (praca zespołowa agentów)
- Kanał ma nazwę, tytuł, instrukcje, członków (agentów) i lidera. Można w nim przydzielać zadania, przenosić je, wyświetlać zatrzymane zadania i przydzielać je ponownie.
- Ustawienia kanału:
  - pamięć izolowana per kanał,
  - nowa rozmowa,
  - kompaktowanie kontekstu,
  - usunięcie historii,
  - **rutyny kanału**.
- Wniosek: to model „Slack z agentami”. Każda wiadomość człowieka staje się zadaniem z właścicielem, wynikiem i stanem.

### 2.4 Agenci
- **Tworzenie agenta**: imię, opis, szablony (np. „Pomocnik poczty”, „Planer podróży”), instalacja z szablonu i Marketplace, import.
- **Ustawienia agenta**:
  - awatar i kolor,
  - dostawca i model z modelami zapasowymi,
  - instrukcje z limitem długości,
  - foldery z dostępem,
  - poziom dostępu,
  - zachowanie, gdy agent jest zajęty,
  - limit równoległych wątków,
  - umiejętności,
  - użycie (zużycie limitów).
- **Dok agentów**: mini-czaty z ulubionymi agentami poza głównym oknem.
- **Dynamic Island / notch**: nakładka na górze ekranu ze stanem pracy (Pracuje · Wiadomość · Pytanie · Zatwierdzenie · Przejmij · Błąd).

### 2.5 Vault
Typy: login, karta, kontakt, klucz API. Do tego 2FA TOTP (`vault.twoStep`), kopiowanie pól oraz konektory 1Password, Bitwarden i Proton Pass. Agent prosi o element i dostaje go bez pokazywania sekretu w czacie.

### 2.6 Rutyny i przepływy
- **Rutyny**: harmonogram (kalendarz, godziny, strefa czasowa, następne uruchomienie), wyzwalacz webhook z filtrami JSON Pointer, dostarczanie wyniku, historia uruchomień, szkic i podsumowanie, feed rutyn na serwerze.
- **Przepływy pracy**: płótno z węzłami, wyzwalacz, kroki z zatwierdzeniem, wyjścia, węzły GitHub, Discord, Telegram, tekst i obraz.

### 2.7 Pamięć, umiejętności, tabele, pliki
- **Wspomnienia**: „Zawsze używane” kontra „Używane w razie potrzeby”, wyszukiwanie, ręczne dodawanie, osobna pula per agent i per kanał.
- **Umiejętności**: przypisane do agenta, z wersjami, aktualizacją, naprawą i instalacją z Marketplace.
- **Tabele**: wspólna baza agentów z informacją, kto prowadzi tabelę, i usuwaniem dla wszystkich.
- **Biblioteka plików**: siatka lub lista, zaznaczanie, pobieranie, sprzątanie miejsca, pliki maszyny.

### 2.8 Ustawienia aplikacji (zakładki)
Ogólne · Agenci (domyślne) · Powiadomienia (macierz) · Głos · Sterowanie PC · Profil · **Mobile Connect** (parowanie telefonu kodem QR, stały link) · Dynamic Island · Dok agentów · Aktualizacje · Rozliczenia · Hostowane serwery i strony · Transfer.

### 2.9 Serwer i zespół
Członkowie, **role z poziomem dostępu do każdego agenta**, zaproszenia (link lub QR z wygaśnięciem), status maszyny (alerty dysk/RAM/CPU), zgodność wersji, klient webowy (jedna karta naraz).

### 2.10 Konektory
GitHub (device code, repozytoria), Slack, Discord, Telegram, WhatsApp, menedżery haseł, serwery MCP (panel i połączenie), własny dostawca ACP.

### 2.11 Onboarding
Wybór języka, pierwszy dostawca (logowanie do planu), pierwszy agent z gotowych propozycji, konfiguracja Computer Use.

## 3. Nasz produkt (MONARCHIA) a OpenBot i COSGRAL/Paperclip
Stan COSGRAL ustaliłem na podstawie stron w `ui/src/pages` i pakietów w gałęzi `codex/cosgral-workspace` @ `6d029c682`. ✓ znaczy, że ekran lub moduł istnieje, nie że działa end-to-end.

| Funkcja | OpenBot | COSGRAL dziś | MONARCHIA potrzebuje |
|---|---|---|---|
| Lista agentów + czat 1:1 (`Agents`, `AgentChat`) | ✓ | ✓ | ✓ |
| Rutyny / harmonogram (`Routines`, `RoutineDetail`) | ✓ | ✓ | ✓ |
| Zatwierdzenia (`Approvals`) | ✓ | ✓ | ✓ |
| Skrzynka „co czeka na mnie” (`WhatNeedsMe`, `Inbox`) | ✓ | ✓ | ✓ |
| Sekrety / klucze API (`Secrets`) | ✓ | ✓ | ✓ |
| Umiejętności (`CompanySkills`, `SkillStudio`) | ✓ | ✓ | ✓ |
| Koszty / użycie (`Costs`, budżety) | ✓ | ✓ | ✓ |
| Adapter Gemini przez `gemini --acp` | ✓ | ✓ | ✓ |
| Zaproszenia i dostęp (`CompanyAccess`, `InviteLanding`) | ✓ | ✓ | ✓ |
| Org chart, cele, issues | — | ✓ | ✓ |
| Kanały grupowe z liderem i przydziałem zadań | ✓ | — | ✓ |
| Karty pytanie/zatwierdzenie/podgląd **w czacie** | ✓ | — | ✓ |
| Vault: loginy, karty, kontakty, TOTP | ✓ | — | ✓ |
| Wbudowana przeglądarka agenta + przejęcie | ✓ | — | ✓ |
| Stany agenta w pasku bocznym (myśli, czeka, limit) | ✓ | — | ✓ |
| Dok agentów / Dynamic Island | ✓ | — | — |
| Parowanie telefonu (QR) | ✓ | — | ✓ |
| Pamięć agenta „zawsze / w razie potrzeby” | ✓ | — | ✓ |
| Instalator desktop (.exe) | ✓ | — | ✓ |

Uwagi:
- „—” w kolumnie COSGRAL znaczy, że nie znalazłem odpowiednika na liście stron. Nie przeszukiwałem całego serwera, więc mogą istnieć częściowe moduły, np. `ProjectConversation` i `BoardChat` jako zalążek kanałów.
- Pamięci i wbudowanej przeglądarki w COSGRAL nie zweryfikowałem poza nazwami stron.
- Dok i wyspa to „miłe dodatki”, nie MVP.

### Priorytety MVP (proponuję)
1. **Prywatność dla 2 osób.** Tryb `authenticated` w Paperclip, dwa konta (Kacper, Jakub), wyłączona rejestracja, serwer tylko na loopback i w Tailscale. Dziś COSGRAL działa jako `local_trusted` (COSGRAL-README), a to nie wystarcza dla drugiej osoby.
2. **Szkielet nawigacji jak w §2.1.** Pasek stron, foldery agentów ze stanami i czat z panelem bocznym (pliki, ustawienia agenta).
3. **Kanały.** Wiadomość człowieka staje się zadaniem z właścicielem, wynikiem i stanem. Można to oprzeć na issues i zadaniach koordynatora w Paperclip (`CoordinatorTasks`, `Issues`).
4. **Karty akcji w czacie.** Pytanie z opcjami, zatwierdzenie (podpięte pod istniejące `Approvals`), podgląd szkicu przed wysłaniem.
5. **Gemini domyślnie.** `gemini-local` przez ACP z darmowym kluczem z Google AI Studio (`GEMINI_API_KEY`) albo z darmowym logowaniem do Gemini CLI. Cursor wyłączony w konfiguracji adapterów.
6. Potem: Vault, przeglądarka agenta, Mobile Connect, pamięć, dok.

## 4. Powłoka desktop: Electron czy Tauri
**Rekomendacja: Electron + electron-builder (NSIS .exe).**

Dlaczego:
- **Serwer COSGRAL to Node.** Ma `embedded-postgres`, drizzle i uruchamia CLI agentów (`gemini --acp`, ACP wymaga Node ≥24.11). Electron ma Node w środku, więc serwer odpala się w `utilityProcess`, bez dodatkowego runtime'u. W Tauri i tak trzeba by dołączyć Node jako sidecar (binarkę SEA lub pkg), więc przewaga rozmiaru znika, a dochodzi drugi język (Rust) i dwie ścieżki budowania.
- **Wbudowana przeglądarka agenta** (jak u OpenBota) to w Electronie `WebContentsView` z pełnym Chromium i CDP. W Tauri dostajemy WebView2 bez wygodnej automatyzacji.
- **Taki sam model ma OpenBot** (tray, wiele okien, autostart, `electron-updater`), więc wiemy, że to podejście się sprawdza.
- UI (React 19 + Vite) ładuje się bez zmian: `loadURL` na lokalny serwer albo pliki statyczne.

Szkic:
- Proces główny: single-instance lock, tray, autostart, start `utilityProcess` z serwerem COSGRAL na `127.0.0.1:<port losowy>` oraz osobny proces embedded-postgres.
- Okno: `contextIsolation: true`, `sandbox: true`, bez `nodeIntegration`, minimalny preload (powiadomienia, wybór folderu, otwieranie linków). Sprawdzić fuses: wyłączyć `RunAsNode` i inspect.
- Dane w `%APPDATA%\Monarchia`. Sekrety (JWT, klucze) w Windows Credential Manager przez `safeStorage`, a nie losowo przy starcie. Dziś to problem z COSGRAL-README: nietrwały JWT.
- Aktualizacje: `electron-updater` z prywatnym release na GitHubie (repo jest prywatne). Bez publicznej publikacji.

**Telefon:**
- Etap 1: PWA lub responsywny UI otwierany z telefonu do serwera na desktopie przez Tailscale. Repo ma już `packages/tailscale-https-broker`. Parowanie kodem QR, jak w Mobile Connect.
- Etap 2, jeśli trzeba: Capacitor albo Expo jako cienki klient tego samego API.
- Na telefonie nie uruchamiamy silnika. Agenci zostają na komputerze.

## 5. Czego nie sprawdziłem / ryzyka
- Nie uruchamiałem OpenBota pod inspektorem i nie robiłem zrzutów ekranu. Układ wizualny (kolory, odstępy) wymaga obejrzenia na żywo.
- Bramek darmowego planu Gemini (limity RPM i dzienne) nie sprawdzałem.
- OpenBot w swoich tekstach podaje, że jego dostawca Gemini wymaga planu Google AI Pro/Ultra. U nas idzie to przez klucz AI Studio lub Gemini CLI, więc trzeba to zweryfikować testem.
- COSGRAL: stan end-to-end według `COSGRAL-AUDYT.md` (embedded Postgres na Windows startował ręcznie). Instalator musi to rozwiązać jako pierwsze.
