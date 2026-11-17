# KK W11 (f): komunikatory poza Telegramem, ocena kosztu i kolejność

Data: 17.11.2026. Tylko ocena (bez kodu). Wzór: most Telegrama z W10-KK2 (`docs/cosgral-raporty/kk-w10-kk2.md`): tylko prywatne rozmowy z listy dozwolonych, domyślnie nikt, token tylko do zapisu i szyfrowany, agent nie dostaje narzędzia, tylko odpowiedź w tym samym czacie, stałe zdania, limity.

## Wniosek

**Kolejność: 1. Slack, 2. Discord, 3. WhatsApp (tylko za zgodą właściciela).** Przed Slackiem jedno wspólne przygotowanie (4 h): most Telegrama ma dziś klienta Telegrama wpisanego na stałe; trzeba go zamienić na sterownik na rodzaj komunikatora.

| # | Komunikator | Jak odbiera wiadomości (bez serwera i adresu) | Co wkleja właściciel | Koszt (kontrakt+atrapa+silnik+testy) | Ryzyko |
|---|---|---|---|---|---|
| 0 | wspólny sterownik | j.w. | – | 4 h | niskie: rozszerza kontrakt `messengers` o rodzaje `slack`/`discord`/`whatsapp`, token drugi (opcjonalny) i regułę formatu numeru czatu per rodzaj |
| 1 | **Slack** | Socket Mode (WebSocket wychodzący; bez adresu publicznego) | token bota `xoxb-…` i token aplikacji `xapp-…` | ok. 10 h | średnie: WebSocket z ponawianiem; tylko wiadomości prywatne (DM, numery `D…`) |
| 2 | **Discord** | Gateway (WebSocket wychodzący) + REST do odpowiedzi | token bota | ok. 12 h | średnie: wymaga zgody „Message Content Intent” w panelu dewelopera; wiadomości prywatne (DM) |
| 3 | **WhatsApp** | brak oficjalnej drogi bez serwera: Cloud API wymaga publicznego webhooka; reszta to nieoficjalne biblioteki (kod QR, sesja jak WhatsApp Web) | skan kodu QR | ok. 20 h + nowa zależność | **wysokie**: nieoficjalne API może zablokować numer; rozbija zasadę „bez serwera”; osobna decyzja właściciela |

## Zasady wspólne dla nowych (bez zmian względem Telegrama)

1. Domyślnie nikt; wiadomość z niedozwolonego czatu jest ignorowana bez słowa, ustawienia dowiadują się tylko numeru i nazwy.
2. Tylko tekst z rozmowy prywatnej; grupy, kanały, pliki, głos: ignorowane po cichu.
3. Token (i drugi token Slacka) tylko do zapisu, szyfrowane w bazie przestrzeni, nigdy w statusie, zdarzeniu, błędzie, logu; błędy sieci zamieniane na stałe zdania.
4. Agent nie dostaje narzędzia: odpowiedź idzie tylko do czatu, z którego przyszła wiadomość.
5. Testy tylko na atrapie serwera na `127.0.0.1` (WebSocket dla Slacka i Discorda); żadnych prawdziwych kont.

## Czego nie wiem

1. Dokładnych limitów i kodów błędów Slacka i Discorda wprost z ich dokumentacji (nie sprawdzałem w sieci; kształt zdarzeń znam z opisu 0.71 i ogólnej wiedzy): przy implementacji potwierdzić na dokumentacji dostawcy.
2. Czy właściciel chce Slacka i Discorda dla jednej osoby (jedna lista dozwolonych) czy też „role access” z 0.71 (Discord: role); zakładam jedną listę dozwolonych, bez ról.
3. Czy właściciel chce WhatsApp mimo ryzyka blokady numeru.

## Do decyzji lidera

Zaczynam od kroku 0 (sterownik) i Slacka, gdy lider potwierdzi kolejność; WhatsApp tylko po wyraźnej zgodzie właściciela.
