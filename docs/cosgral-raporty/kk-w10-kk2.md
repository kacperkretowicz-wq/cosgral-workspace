# KK Fullstack W10-KK2: most do Telegrama (bot z BotFather, long polling)

Data: 17.11.2026. Gałąź `team/kk/w10-kk2` (od integracji `b59e6492e`). Spec: `spec-w10.md` §1D, Q10. Tylko testy jednostkowe na atrapie Telegrama na `127.0.0.1`; **żadnego prawdziwego bota, tokenu ani wywołania na zewnątrz**. `agent-service.ts` nietknięty.

## Wynik w jednej linii

**Gotowe: kontrakt + atrapa (osobny pierwszy commit `fe1d73e53`), klient Bot API, silnik (pętla long polling, lista dozwolonych czatów, limity, token zaszyfrowany w bazie przestrzeni), IPC tylko lokalne, przekazanie wiadomości do agenta i odpowiedzi z powrotem do czatu bez nowego narzędzia dla agenta. Czego nie widziałem: prawdziwego Telegrama, prawdziwej rozmowy z agentem w Electronie (patrz §6): to właściciel zakłada bota w BotFather i wkleja token.**

## 1. Co robi (po ludzku)

1. Właściciel zakłada bota w BotFather (aplikacja Telegram), wkleja token w ustawieniach. Token jest tylko do zapisu: nigdzie nie wraca.
2. Program sam pyta Telegram o nowe wiadomości (**long polling**: brak serwera, brak adresu, brak webhooka; przy łączeniu program wywołuje `deleteWebhook` bez kasowania oczekujących, bo bot z webhookiem nie daje long pollingu).
3. **Domyślnie nikt nie ma dostępu.** Wiadomość z czatu spoza listy jest ignorowana **bez słowa do nadawcy**; ustawienia dowiadują się tylko numeru i nazwy takiego czatu (do 10 ostatnich, bez treści), żeby właściciel mógł go dopisać do listy i wskazać agenta.
4. Wiadomość tekstowa z dozwolonego czatu prywatnego trafia do wskazanego agenta jako zwykła wiadomość z dopiskiem `[Telegram] ` (rozmowa pokazuje, skąd przyszła). Gdy agent skończy turę, odpowiedź wraca do **tego samego czatu**.
5. Agent **nie dostaje żadnego narzędzia** do Telegrama: jedyna droga na zewnątrz to odpowiedź na wiadomość, która przyszła, do czatu, z którego przyszła. Nie może napisać do innego czatu.

## 2. Zasady i limity

| Co | Zasada |
|---|---|
| Kto | tylko czaty **prywatne** z listy (do 20); grupy, kanały, zdjęcia, głos, pliki od obcych: ignorowane po cichu |
| Dozwolony czat, ale nie tekst | jedno stałe zdanie „I only read plain text for now.” |
| Długość | tekst dłuższy niż 4000 znaków nie idzie do agenta; czat dostaje stałe zdanie |
| Tempo | 10 wiadomości na minutę na czat; powyżej: ignorowane, jedno ostrzeżenie na minutę |
| Kolejka | do 5 czekających odpowiedzi na czat; szósta dostaje „poczekaj na odpowiedzi” |
| Odpowiedź | dzielona na części po 4000 znaków (po końcu linii, gdy się da), najwyżej 8 części, reszta ucięta z adnotacją |
| Czas | agent nie odpowiedział w 15 min: jedno zdanie „zajrzyj do aplikacji”, wiadomość wypada z kolejki |
| `/start` | powitanie, nie idzie do agenta |
| Zły agent | agent usunięty po dopisaniu czatu: stałe zdanie w czacie, nic nie idzie |
| Awaria sieci | status `failed` ze stałym zdaniem, ponawianie samo (2 s, podwajane do 60 s; 429 czeka tyle, ile każe Telegram) |
| Token odrzucony (401/404) | pętla się kończy, status `failed`, token zostaje do wymiany; **bez ponawiania** |
| Konflikt (409) | stałe zdanie, że inny program czyta tego bota |
| Zablokowany bot / zamknięty czat | odpowiedź wypada (bez ponawiania), pozostałe czaty działają dalej |

Zdania wysyłane do czatu są stałe: nigdy tekst błędu agenta, sieci ani Telegrama.

## 3. Token (najważniejsze)

- Wpisany raz, szyfrowany `SecretBox` (safeStorage/DPAPI w programie) w tabeli `projection_messengers` **bazy bieżącej przestrzeni** (W8-KK1): bot klienta A nie jest dostępny w przestrzeni klienta B (test dwóch baz).
- Telegram umieszcza token w adresie każdego zapytania, więc **tekst błędu warstwy sieci nie jest nigdy używany**: klient zamienia każdą awarię w `TelegramFailure` ze stałym zdaniem, silnik tylko je przekazuje. Test: sieć rzuca błąd z adresem w treści; token nie ma go w żadnym statusie, zdarzeniu, błędzie ani zdaniu do czatu.
- Przy łączeniu token jest sprawdzany w Telegramie (`getMe`); **zły token nie jest zapisywany**. Błąd parsera nie powtarza wpisanego tekstu.
- Token, którego sejf nie odczyta (inny komputer), jest po cichu usuwany przy starcie.
- Rozłączenie: usuwa token i offset, zatrzymuje pętlę, porzuca czekające; lista dozwolonych zostaje.
- Offset ostatniej wiadomości jest zapisywany po obsłużeniu: po restarcie ta sama wiadomość nie jest brana drugi raz.

## 4. Pliki

- `packages/contracts/src/ipc-messengers.ts` (kontrakt: typy, strażnicy, parsery, limity, reguły wspólne), kanały `messengers:*` (6), zdarzenie `messengers-changed`, pole `messengers?` w `OpenBotDesktopApi`, `src/preload/messengers-api.ts`, atrapa `src/renderer/stories/mock-messengers.ts` (+ test, 8) — **commit `fe1d73e53`**.
- `src/backend/telegram-client.ts` (+ test, 10): klient Bot API (getMe, deleteWebhook, getUpdates, sendMessage).
- `src/backend/messenger-bridge.ts` (+ test, 29): silnik i port agenta (`createAgentPort`), `src/backend/testing/telegram-mock.ts`: atrapa Telegrama na `127.0.0.1` (getUpdates z krótkim oczekiwaniem i offsetem).
- `src/main/messengers-ipc.ts`: IPC tylko lokalne (`serverId !== "local"` odmowa; parsery przed pracą). `src/main/index.ts`: 14 linii (import, zmienna, rejestracja, powołanie mostu po `useSecretBox`, `resume()`, `stop()` przy zamknięciu). `src/main/local-only-ipc.test.ts`: liczba kanałów (6), lista odmów dla zdalnych, złe żądania (token bez echa).

## 5. Jak wiadomość trafia do agenta bez zmiany `agent-service.ts`

Tylko publiczne metody: `AgentService.sendMessage({botId, text})` zwraca `messageId`; odpowiedź odczytuje `readConversation(botId)` co 1,5 s, **tylko gdy coś czeka**. Port `createAgentPort` łączy ją z wiadomością po `turnId` wiadomości użytkownika (nadawanym przy starcie tury z kolejki): odpowiedź to ukończone teksty asystenta tej samej tury, bez `commentary`, bez innych tur; tura aktywna lub ze strumieniem = czeka; `failed`/`interrupted` = jedno zdanie o porażce; tura bez tekstu (same narzędzia) = „odpowiedział bez tekstu, zajrzyj do aplikacji”.

**Szew, który podpowiadam Backendowi (nie robiłem):** zdarzenie z gotowym polem `finalText` w `turn-completed` (albo metoda `awaitReply(messageId)`) zastąpiłoby odpytywanie; teraz odpytywanie jest tanie (lokalny odczyt), ale zależy od założenia o `turnId` (§6).

## 6. Czego NIE sprawdzono (uczciwie)

1. **Prawdziwego Telegrama i BotFather**: właściciel zakłada bota i wkleja token; adres `https://api.telegram.org/bot<token>/<metoda>` i pola odpowiedzi pochodzą z publicznej dokumentacji Bot API, nie z wywołania.
2. **Electrona i prawdziwej rozmowy z agentem**: założenie, że wiadomość z kolejki dostaje `turnId` po starcie tury i że odpowiedzi tej tury niosą ten sam `turnId`, wynika z czytania `mailbox-store.ts`/`agent-service.ts`, a nie z uruchomienia. Testy używają udawanej rozmowy. Jeśli założenie nie trzyma, odpowiedź nie wróci i po 15 minutach czat dostanie zdanie „zajrzyj do aplikacji” (nic się nie psuje, ale most nie działa): to pierwsza rzecz do sprawdzenia w Electronie po `GO`.
3. Brak interfejsu ustawień (sama atrapa i kontrakt); `sandbox:e2e`, Storybook, build, pełne `check`: nie uruchamiane (lekkie zadanie, brak znaku lidera).
4. Most startuje razem z programem (`resume()`), zanim dostawca agenta jest gotowy: wiadomość w tym oknie dostaje zdanie „agent nie mógł przyjąć wiadomości”. Kosmetyka, do poprawy po sprawdzeniu w Electronie.
5. Odstęp 1 s na czat przy wysyłaniu wielu części odpowiedzi nie jest wymuszany (Telegram odpowie 429, silnik poczeka i ponowi; nie sprawdzone na prawdziwym Telegramie).
6. Zdarzenie `messengers-changed` przy każdej wiadomości od znanego już obcego czatu nie jest wysyłane (tylko przy nowym), licznik pojawia się przy następnej zmianie.

## 7. Uruchomione

`vitest run`: `messenger-bridge.test.ts` 29/29 (3 razy z rzędu, bez migotania), `telegram-client.test.ts` 10/10, `mock-messengers.test.ts` 8/8, `local-only-ipc.test.ts` zielony; `bun run typecheck:node` i `typecheck:renderer` kod 0; `bun run lint` czysto (jedno obce ostrzeżenie w `ipc-access.test.ts` Backendu, nie ruszałem).
