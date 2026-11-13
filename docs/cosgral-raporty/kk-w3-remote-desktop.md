# W3-KK2: zdalny pulpit Windows↔Windows (wiersz 33)

Gałąź `team/kk/w3-remote-desktop` (z `codex/cosgral-desktop` @ `90d109c3b`), worktree `Shared\cosgral-wt\desktop-kk`.

**Stan: etap 1 z 3 gotowy (plan + kontrakt). Silnik hosta i klienta w toku.**

## Decyzja lidera (PLAN.md „Decyzje lidera do W3” pkt 1)

Własny protokół przez WebSocket z tokenem. Obraz z `desktopCapturer`, sterowanie przez sterownik Computer Use (`computer-driver-windows`). Bez VNC i RDP jako zależności. Dojście: loopback, sieć lokalna albo tunel osoby. Bez konta OpenBota. Zgoda osobna od Computer Use. Stop zawsze lokalny. Zachowanie: `spec-w3.md` §2 (włączenie, połączenie, rozłączenie bez zawieszenia, osobność od Computer Use).

## Plan

| Etap | Co | Gdzie |
|---|---|---|
| 1 ✓ | Kontrakt: typy, limity, wejścia, stany, API okna, zdarzenia | `packages/contracts/src/ipc-remote-desktop.ts` (+ test) |
| 2 | Protokół (czysta logika): wiadomości, dowód HMAC, ramka binarna | `src/backend/remote-desktop-protocol.ts` |
| 2 | Magazyn: token (zaszyfrowany), lista widzów, ustawienia | `src/backend/remote-desktop-store.ts` |
| 2 | Host: serwer WebSocket, uwierzytelnienie, zgoda, sesje, strumień klatek, odbiór wejścia, rozłączenie | `src/backend/remote-desktop-host.ts` |
| 2 | Klient: połączenie, klatki, wejście | `src/backend/remote-desktop-client.ts` |
| 3 | Electron: przechwytywanie ekranu, IPC, preload, wpięcie w `main` | `src/main/remote-desktop-*.ts`, `src/preload/remote-desktop-api.ts` |
| 3 | Testy, test integracyjny host↔klient na loopback, próba w piaskownicy (dwie instancje) | testy + `Shared\cosgral-data\desktop-kk` |

Ekranów nie robię (UI). Silnik da się w pełni sterować przez `window.openbot.remoteDesktop`.

## Model bezpieczeństwa

**Zasada naczelna:** sama znajomość tokenu nie daje pulpitu. Trzeba jeszcze zgody właściciela hosta.

| Warstwa | Jak działa |
|---|---|
| 1. Host słucha | Domyślnie tylko `127.0.0.1`. Sieć lokalna (`0.0.0.0`) tylko, gdy właściciel wybierze `exposure: "lan"`. Tunel osoby dochodzi do loopbacku. Wyłączony host nie słucha wcale. |
| 2. Nie z przeglądarki | Host odrzuca połączenie z nagłówkiem `Origin`. Strona w przeglądarce nie może się połączyć (ochrona przed przejęciem WebSocketu i DNS rebinding). |
| 3. Token | 24 losowe bajty, pokazane raz (`enable`, `regenerateToken`). Przechowywany zaszyfrowany `safeStorage` (jak Vault i MCP). Bez szyfrowania systemu host się nie włącza. |
| 4. Dowód zamiast hasła | Token **nie leci po sieci**. Host wysyła losowy `nonce`, klient odpowiada `HMAC-SHA256(token, wersja\|nonce\|clientId\|tryb)`. Host dowodzi tak samo klientowi (klient nie połączy się z fałszywym hostem). Porównanie w stałym czasie. |
| 5. Limit prób | 5 błędnych dowodów z jednego adresu = blokada na 60 s. Brak odpowiedzi na `hello` w 10 s = zamknięcie. |
| 6. Zgoda właściciela | Nowy widz (albo widz z polityką „ask”) = **karta confirm w Needs you** z nazwą widza, adresem i trybem (podgląd / sterowanie). Brak odpowiedzi w 60 s = odmowa. Polityka widza: `ask` (każdy raz), `allow` (zapamiętany), `block`. Zablokowany jest odrzucany bez karty. |
| 7. Jeden widz | Najwyżej jedna sesja naraz. Drugi widz dostaje „zajęte” i nie widzi nic. |
| 8. Stop lokalny | `host.stop()` kończy sesję natychmiast, także w trakcie wejścia. Dostępny tylko dla zaufanego okna programu. Widz nie ma jak go nacisnąć (zob. 9). |
| 9. Wejście zdalne ma granice | Nigdy do okien samego COSGRAL Workspace (karty, zgody, Stop zostają przy właścicielu). Nic przy zablokowanym ekranie, ekranie UAC i w oknach uruchomionych jako administrator. Te same klawisze i zablokowane kombinacje co Computer Use (bez Win+L, Ctrl+Alt+Del). Tekst do 500 znaków, 40 wejść na sekundę. |
| 10. Osobno od Computer Use | Zgoda zdalnego pulpitu nie włącza Computer Use i odwrotnie (spec 2.4). Osobny sterownik-instancja, osobny stan, osobne sesje. |

**Karta confirm i agent.** Karty w Needs you należą do agentów, a zdalny pulpit nie ma tury agenta. Karta idzie więc do wiersza agenta wskazanego w ustawieniu `approvalBotId` (domyślnie pierwszy agent). Zero nowych typów kart w UI. *Decyzja do zatwierdzenia (1).*

**Rozbieg zegara.** Protokół nie używa zegara ani znaczników czasu. Dowód opiera się na `nonce` hosta, więc różnica godzin na komputerach niczego nie psuje. Żywotność łącza to ping hosta co 5 s i pong w 15 s, też bez porównywania czasu.

**Rozbieg sieci.** Klatki mają numer. Host wysyła następną klatkę dopiero, gdy poprzednia opuściła bufor (bez kolejki, wolny widz dostaje mniej klatek, nie opóźniony obraz). Brak pongu = host zamyka sesję i wraca do normalnego stanu. Klient po zerwaniu pokazuje `failed` z powodem, bez ponownego łączenia na ślepo.

**Czego protokół nie robi.** Nie szyfruje ruchu (ramki i wejście idą otwartym tekstem po WebSocket). Poza loopbackiem używaj tunelu (VPN, SSH). Nie przesyła schowka ani plików. Nie obsługuje przeciągania (sterownik ma tylko klik, przewijanie, tekst i klawisze). Wiele monitorów: w W3 tylko ekran główny.

## Protokół (skrót)

- Adres `ws://host:port/remote-desktop`, tekst JSON do 4 KB, ramki obrazu binarne: `seq u32 | szerokość u16 | wysokość u16 | JPEG`.
- Host → klient: `hello {version, nonce}` → po `auth`: `waiting` / `accepted {sessionId, mode, screen, hostProof}` / `denied {reason}`; potem klatki, `paused {reason}`, `ended {reason}`.
- Klient → host: `auth {clientId, label, mode, proof}`, `input {…}`, `bye`.
- Współrzędne wejścia są ułamkami klatki (0–1), więc nie zależą od rozdzielczości.

## Decyzje do zatwierdzenia (lider)

1. **Karta zgody idzie do wskazanego agenta** (`approvalBotId`, domyślnie pierwszy). Alternatywa: nowy, szósty typ karty w Needs you (więcej pracy dla UI i kontraktu `PendingAgentRequest`).
2. **Jeden widz naraz.**
3. **Widz „allow” łączy się bez karty,** ale tylko z poprawnym tokenem. „ask” pyta za każdym razem. Nowy widz zawsze dostaje kartę.
4. **Host domyślnie tylko na loopback;** sieć lokalna wymaga świadomego wyboru.
5. **Bez szyfrowania w W3** (tunel osoby). TLS z własnym certyfikatem to osobne zadanie.
6. **Tylko ekran główny** w W3.

## Kontrakt dla UI

Plik `packages/contracts/src/ipc-remote-desktop.ts`, opisy w kodzie. Skrót:

- `window.openbot.remoteDesktop?.host`: `getState`, `enable({exposure?, port?, approvalBotId?})` → `{state, token}` (token raz), `disable`, `regenerateToken`, `setPeerPolicy`, `removePeer`, `setSessionMode`, `stop`.
- `.client`: `getState`, `connect({address, token, mode, label?})`, `disconnect`, `sendInput(click | scroll | text | keys)`.
- `.onFrame(listener)`: klatki `{seq, width, height, jpegBase64}` (osobny kanał, nie przez `agent.onEvent`).
- Zdarzenia `remote-desktop-host-changed {state}` i `remote-desktop-client-changed {state}`.
- Ekran hosta: przełącznik, adres z `listening.urls`, token (raz), lista widzów z polityką, aktywna sesja z „Stop” i „Tylko podgląd”. Ekran klienta: adres + token + tryb, widok klatki, klik i klawisze jako `sendInput` (pozycja = ułamek klatki). Wskaźnik „ktoś steruje tym komputerem” z przyciskiem Stop ma być stale widoczny na hoście.

## Czego jeszcze nie sprawdziłem

Silnik, klient, testy integracyjne i próba w piaskownicy są w etapach 2–3.
