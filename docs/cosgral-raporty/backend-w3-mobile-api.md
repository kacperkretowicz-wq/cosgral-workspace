# Backend W3-BE6: API telefonu — czat, decyzje i agenci

Gałąź `team/backend/w3-be6` od integracji `5cedc4d7d`, bez push. Opis zachowania: `docs/cosgral/parytet-0.68.md` wiersze 43 (czat, „czeka na Ciebie”, odpowiedzi na pytania i zatwierdzenia) i 44 (tworzenie i edycja agentów z telefonu). To rozszerzenie serwera Mobile Connect z W3-BE5: ten sam token urządzenia i te same limity prób. Kodu OpenBota nowszego niż `a6fe240` nie czytałem. Ekrany telefonu (klient mobilny) to osobne zadanie z UI.

## Wynik

| Zachowanie | Stan | Gdzie |
|---|---|---|
| Lista wątków (jeden na agenta) | ✓ | `GET /v1/threads` |
| Wiadomości agenta ze stronicowaniem (od najstarszych, `before` + `limit`) | ✓ | `GET /v1/agents/:botId/messages` |
| Wysłanie wiadomości do agenta | ✓ (ta sama ścieżka co okno: `AgentService.sendMessage`) | `POST /v1/agents/:botId/messages` |
| Szczegóły karty Needs you, tylko to, co potrzebne do decyzji | ✓ | `GET /v1/needs-you/:id` |
| Odpowiedź: pytanie (opcja lub własne słowa), zatwierdzenie (Approve/Deny), szkic (Send/Edit/Keep draft) | ✓ (`respondToPrompt` / `respondToApproval` / `respondToDraftPreview`) | `POST /v1/needs-you/:id/answer` |
| Przejęcie przeglądarki, Vault, potwierdzenia, sekrety, uprawnienia: tylko informacja „wymaga komputera” | ✓ 403 z powodem, a w liście `answerOn: "computer"` z `computerReason` | `mobile-policy.ts` |
| Strumień zdarzeń „czeka na Ciebie” (SSE) | ✓ `needs-you`, `conversation`, `agents`; ping co 25 s | `GET /v1/events` |
| Tworzenie agenta przez kreator W3-BE2, z ostrzeżeniami kreatora | ✓ | `POST /v1/agents` |
| Edycja profilu (nazwa, rola, instrukcje, kolor) przez agentSettings | ✓ | `PATCH /v1/agents/:botId` |
| Telefon nie zmienia uprawnień, Computer Use, Vault, zdalnego pulpitu, MCP, głosu, urządzeń ani ustawień | ✓ 403 | `MOBILE_COMPUTER_ONLY` |
| Powiadomienie systemowe na telefonie | — po stronie klienta mobilnego (osobne zadanie) | — |

## API telefonu

Adres i token pochodzą z parowania (W3-BE5). Każde żądanie poza parowaniem wysyła nagłówek `Authorization: Bearer <token urządzenia>`. Odpowiedzi to JSON (`cache-control: no-store`); błąd ma postać `{"error": "…"}`. Typy żądań i odpowiedzi są w `packages/contracts/src/ipc-mobile.ts`: `MobileThread`, `MobileMessagePage`, `MobileSendMessageRequest`, `MobileNeedsYouDetail`, `MobileAnswerRequest`, `MobileStreamEvent`, `MobileCreateAgentRequest`, `MobileUpdateAgentRequest` i inne. Ścieżki: `MOBILE_PHONE_PATHS`, `mobilePhonePath.*`. Strumień: `parseMobileStreamEvents`.

Przykłady (adres z kodu QR, np. `http://127.0.0.1:47930`):

```bash
BASE=http://127.0.0.1:47930; TOKEN=...   # z odpowiedzi POST /v1/pair

# Wątki i wiadomości (30 ostatnich, potem starsze przez nextBefore)
curl -H "Authorization: Bearer $TOKEN" $BASE/v1/threads
curl -H "Authorization: Bearer $TOKEN" "$BASE/v1/agents/<botId>/messages?limit=30"
curl -H "Authorization: Bearer $TOKEN" "$BASE/v1/agents/<botId>/messages?limit=30&before=<nextBefore>"

# Wiadomość do agenta (202 {"messageId": "..."})
curl -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"text":"Znajdź trzy źródła o tym raporcie."}' $BASE/v1/agents/<botId>/messages

# Needs you: lista, szczegóły, odpowiedź
curl -H "Authorization: Bearer $TOKEN" $BASE/v1/needs-you
curl -H "Authorization: Bearer $TOKEN" $BASE/v1/needs-you/<id>
curl -X POST -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"kind":"prompt","answers":{"<questionId>":["200"]}}' $BASE/v1/needs-you/<id>/answer
curl -X POST ... -d '{"kind":"approval","decision":"accept"}' $BASE/v1/needs-you/<id>/answer
curl -X POST ... -d '{"kind":"draft-preview","decision":"edit","feedback":"Krócej."}' $BASE/v1/needs-you/<id>/answer

# Strumień zdarzeń (text/event-stream)
curl -N -H "Authorization: Bearer $TOKEN" $BASE/v1/events
# event: needs-you   data: {"type":"needs-you","items":[...]}
# event: conversation data: {"type":"conversation","botId":"..."}
# event: agents      data: {"type":"agents","agents":[...]}

# Agenci: szablony, nowy agent, profil, edycja
curl -H "Authorization: Bearer $TOKEN" $BASE/v1/templates
curl -X POST ... -d '{"templateId":"builtin:writer","name":"Ada","instructions":"Piszesz moje posty.","avatarHue":280}' $BASE/v1/agents
curl -H "Authorization: Bearer $TOKEN" $BASE/v1/agents/<botId>
curl -X PATCH ... -d '{"role":"Blog","instructions":"Krótkie posty."}' $BASE/v1/agents/<botId>
```

| Ścieżka | Metoda | Odpowiedź |
|---|---|---|
| `/v1/me`, `/v1/agents`, `/v1/needs-you` | GET | jak w W3-BE5; Needs you ma teraz `answerOn` i `computerReason` |
| `/v1/threads` | GET | `{threads: MobileThread[]}` |
| `/v1/agents/:botId/messages` | GET | `MobileMessagePage` (`limit` 1–100, domyślnie 30; `before` = id wiadomości) |
| `/v1/agents/:botId/messages` | POST | 202 `{messageId}` (tekst 1–20 000 znaków) |
| `/v1/needs-you/:id` | GET | `MobileNeedsYouDetail` |
| `/v1/needs-you/:id/answer` | POST | 200 `{ok: true}` |
| `/v1/events` | GET | strumień SSE |
| `/v1/templates` | GET | `{templates: MobileTemplateSummary[]}` |
| `/v1/agents` | POST | 201 `{agent, warnings}` |
| `/v1/agents/:botId` | GET / PATCH | `{agent: MobileAgentDetail}` |
| `/v1/agents/:botId` | DELETE | 403 (usuwanie na komputerze) |
| `/v1/computer-use…`, `/v1/vault…`, `/v1/remote-desktop…`, `/v1/devices…`, `/v1/settings…`, `/v1/permissions…`, `/v1/mcp…`, `/v1/voice…`, `/v1/mobile…` | każda | 403 „… is changed on the computer” |

Kody błędów:
- 400 — zła wartość;
- 401 — brak, zły albo odwołany token (liczy się do limitu 10 błędów na adres na minutę → 429);
- 403 — tylko na komputerze;
- 404 — nie ma agenta lub karty;
- 405 — zła metoda;
- 409 — karta innego rodzaju albo program odmówił, z jego komunikatem;
- 413 — za duże ciało (64 KB);
- 429 — za dużo zmian (30 na minutę na telefon), strumieni (2 na telefon, 20 razem) albo błędów.

## Co telefon może, a co zostaje na komputerze

| Karta | Telefon | Dlaczego |
|---|---|---|
| Pytanie bez sekretu | odpowiada (opcja lub własne słowa, do 8 odpowiedzi po 2000 znaków) | zwykła decyzja |
| Pytanie z polem sekretnym | tylko widzi | sekret nie idzie nieszyfrowanym połączeniem |
| Zatwierdzenie polecenia / zmian w plikach | Approve / Deny | wiersz 43; widzi polecenie (do 500 znaków) i powód, bez katalogu roboczego |
| Zatwierdzenie uprawnień, ekranu, kamery | tylko widzi | to zmiana uprawnień |
| Szkic (variant `draft`) | Send / Edit (uwagi lub nowy tekst) / Keep draft | wiersz 43; widzi tekst do 4000 znaków, odbiorcę i kanał |
| Potwierdzenie (variant `confirm`: płatność, Computer Use, parowanie, pobranie głosu, zgody programu) | tylko tytuł, bez treści | zgody programu i płatności są na komputerze |
| Przejęcie przeglądarki | tylko tytuł | wymaga ekranu komputera |
| Prośba Vault | tylko tytuł | Vault jest na komputerze |

Agent z telefonu:
- Tworzenie: szablon, nazwa, rola, instrukcje i kolor (`BOT_AVATAR_HUES`). Obraz awatara nie jest w tym zadaniu.
- Edycja: tylko te pola profilu.
- Pola `tools`, `model`, `reasoningEffort`, `skills`, `memories`, `mcp`, `notifications` i podobne dają 403; nieznane pola dają 400.
- Szablon może wyłączyć grupy narzędzi i doinstalować skille z biblioteki. To szablon osoby lub wbudowany, a szablony tylko wyłączają narzędzia, więc nie daje to nowych uprawnień.

## Zmiany w modelu zagrożeń (względem W3-BE5)

1. **Telefon może teraz działać, nie tylko czytać.** Wysyła wiadomości (agent rusza z turą), zatwierdza polecenia powłoki i zmiany plików, wysyła szkice. Tak chce wiersz 43. Górna granica to 30 zmian na minutę na telefon.
2. **Ruch nadal nie jest szyfrowany.** W trybie LAN bez tunelu token urządzenia idzie otwartym tekstem w każdym żądaniu. Ktoś, kto podsłucha sieć, może więc działać jak telefon: czytać czaty, pisać do agentów, zatwierdzać polecenia i wysyłać szkice. Tego nie da się zatrzymać bez szyfrowania. Zalecam: tylko zaufana sieć albo tunel (VPN). Następny krok: TLS z odciskiem certyfikatu w kodzie QR (do decyzji lidera).
3. **Czego telefon nie dostaje:**
   - strumień nie przenosi tekstu wiadomości ani kart, tylko „coś się zmieniło” i krótkie tytuły;
   - szczegóły kart mają tylko to, co potrzebne do decyzji: bez katalogu roboczego, z przyciętym poleceniem i szkicem, bez treści potwierdzeń;
   - sekretów telefon nie wpisuje i nie dostaje.
4. **Odwołanie** zamyka od razu także otwarte strumienie urządzenia, a następne żądanie dostaje 401.
5. **Długie połączenia** (SSE) mają limit: 2 na telefon, 20 razem. Ping co 25 s.
6. **Logi:** nic nie loguje tokenów ani treści. Błędy programu przechodzą do telefonu jako jego komunikat (409, do 300 znaków).

## Jak to działa

- **Kod:**
  - `src/backend/mobile-phone-api.ts` to router API telefonu. Dostaje `MobilePhoneHost` (w programie: `mobilePhoneHost(AgentService)` w `src/main/mobile-ipc.ts`), czyli te same wywołania, których używa okno.
  - `src/backend/mobile-policy.ts` decyduje, co telefon może odpowiedzieć.
  - `src/backend/mobile-http.ts` to wspólne pomocniki HTTP (wydzielone z W3-BE5).
- **Kolejność w serwerze:** najpierw limit błędów na adres, potem token, potem ścieżki „tylko komputer” (403), potem API.
- **Zdarzenia:**
  - zmiany kart (pytanie, zatwierdzenie, szkic, przejęcie, Vault i ich zamknięcie) zbieram przez 200 ms w jedno `needs-you` z pełną listą;
  - zmiany rozmowy (`conversation`, `conversation-delta`, `turn-*`) najwyżej raz na 500 ms na agenta dają `conversation {botId}`, a telefon sam dobiera wiadomości;
  - `bots-changed` daje `agents`.
- **Stronicowanie:** strona to ostatnie `limit` wiadomości przed `before`, od najstarszej. `nextBefore` to id pierwszej z nich albo `null`. Puste wiadomości bez tekstu i bez załączników są pomijane.
- **Kreator:** `POST /v1/agents` woła `agentTemplates.createAgent` (te same kontrole i ostrzeżenia co okno), potem `updateBot` z kolorem. Nieudany kolor dokłada ostrzeżenie, a agent i tak powstaje.
- **Małe zmiany we wspólnych plikach:**

  | Plik | Zmiana |
  |---|---|
  | `main/index.ts` | +2/−1 (import `mobilePhoneHost`, jedna linia `phone: mobilePhoneHost(service)`) |
  | `ipc-mobile.ts` (mój z W3-BE5) | +276/−1 (typy API telefonu, `answerOn` w Needs you) |
  | `mobile-connect.ts` (mój z W3-BE5) | +29/−58 (pomocniki HTTP do `mobile-http.ts`, przekazanie do API telefonu, zamykanie strumieni) |
  | `mobile-connect.test.ts` | oczekiwana lista Needs you ma dwa nowe pola |
  | `agent-service.ts`, `preload`, okno | bez zmian (to API dla telefonu, nie dla okna) |

## Testy i dowód

Polecenia uruchamiane bezpośrednio, po jednym (bez `heavy.ps1`, bez pełnego `bun run test`):

| Polecenie | Wynik |
|---|---|
| `vitest run packages/contracts/src/ipc-mobile-phone.test.ts` (nowy) | 3/3 (ścieżki, zapis i odczyt strumienia z uciętym zdarzeniem, strażniki) |
| `vitest run src/backend/mobile-phone-api.test.ts` (nowy) | 9/9 — prawdziwy serwer HTTP na `127.0.0.1`, `fetch` i SSE (opis niżej) |
| `vitest run packages/contracts/src/ipc-mobile.test.ts` | 4/4 |
| `vitest run src/backend/mobile-connect.test.ts` | 10/10 (po dopisaniu dwóch nowych pól w oczekiwaniu) |
| `vitest run src/main/ipc/mobile-inputs.test.ts` | 1/1 |
| `bun run typecheck:node` | kod 0 |
| `bun run typecheck:renderer` | kod 0 |
| `biome check` na 10 dotkniętych plikach | 0 błędów |

Co sprawdza test API telefonu:
1. Wątki i trzy strony wiadomości; nieznany agent 404, zły `before` 400, brak tokenu 401.
2. Wysłanie wiadomości: tekst przycięty, odpowiedź na wiadomość, pusta 400, za długa 400.
3. Odpowiedzi: pytanie z własnymi słowami (oryginalne liczbowe `requestId` trafia do programu), odmowa polecenia, „Edit” szkicu z uwagami; zły rodzaj 409, nieistniejąca karta 404, nieznane pytanie 400. Szczegóły polecenia nie mają katalogu roboczego.
4. 403 dla pytania z sekretem, zatwierdzenia uprawnień, potwierdzenia (bez treści w szczegółach) i przejęcia. Lista ma właściwe `answerOn` dla 7 kart i nic nie dociera do programu.
5. Strumień: lista na start, nowa lista po zmianie kart, `conversation` bez tekstu z `delta`. Odwołanie telefonu kończy strumień, a subskrypcja programu znika.
6. Kreator z ostrzeżeniami i kolorem; edycja profilu; odczyt agenta.
7. 403 dla `tools` i `model`, DELETE i ścieżek komputera; 400 dla złego koloru, nieznanego szablonu i pustej zmiany; 404 dla nieznanego agenta.
8. Limit zmian: 30 przechodzi, 31. dostaje 429. Limit strumieni: 2 przechodzą, 3. dostaje 429.

TDD: oba nowe testy najpierw padały (brak modułu lub funkcji), potem przeszły. Po drodze 3 testy dawały 500 przez zły import `INPUT_LIMITS`; poprawione i sprawdzone.

## Czego nie sprawdziłem

- **Prawdziwego telefonu** i prawdziwej sieci: testy idą z `fetch` na loopbacku. Strumienia przez sieć komórkową, proxy, uśpienie telefonu i ponowne połączenia nie badałem. Strumień nie ma numerów zdarzeń (`Last-Event-ID`); po ponownym połączeniu telefon dostaje świeżą listę Needs you i sam dobiera wiadomości.
- **Prawdziwego `AgentService`:** API testowałem na atrapie hosta. Opakowanie `mobilePhoneHost(service)` sprawdził tylko typecheck. Nie uruchamiałem tury agenta wywołanej z telefonu ani odpowiedzi z telefonu na prawdziwą kartę w programie (Electron).
- **Wyścig:** gdy karta zamknie się między odczytem szczegółów a odpowiedzią, program zwraca błąd, a telefon dostaje 409 z komunikatem. Sprawdzone tylko dla karty, której już nie ma (404).
- **Wątki kanałów** (W1) nie są w API telefonu: tylko rozmowy z agentami. Załączników nie da się pobrać (jest tylko ich liczba).
- **Szyfrowanie:** go nie ma (zob. model zagrożeń); to świadoma luka do decyzji.
- **Wydajność:** strona wiadomości czyta całą rozmowę z bazy do pamięci. Przy bardzo długich rozmowach to może być wolne; nie mierzyłem.
- Pełnego `bun run test` i budowy paczki.

## Pliki

- Nowe:
  - `src/backend/mobile-phone-api.ts` (+ test), `src/backend/mobile-policy.ts`, `src/backend/mobile-http.ts`;
  - `packages/contracts/src/ipc-mobile-phone.test.ts`;
  - ten raport.
- Zmienione: `packages/contracts/src/ipc-mobile.ts`, `src/backend/mobile-connect.ts` (+ test), `src/main/mobile-ipc.ts`, `src/main/index.ts`, `COSGRAL-CHANGES.md`.
