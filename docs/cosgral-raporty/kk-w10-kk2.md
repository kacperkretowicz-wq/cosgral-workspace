# KK Fullstack W10-KK2: most do Telegrama (bot z BotFather, long polling)

Data: 17.11.2026. Gałąź `team/kk/w10-kk2`. Spec: `spec-w10.md` §1D, Q10. Tylko testy jednostkowe, **żadnego prawdziwego bota, tokenu ani wywołania na zewnątrz**. `agent-service.ts` nietknięty.

## Wynik w jednej linii

**Etap w toku: kontrakt + atrapa (commit `fe1d73e53`) i klient Bot API z testami są gotowe. Silnik (pętla pobierania, lista dozwolonych, limity, szyfrowany token, IPC) jeszcze NIE istnieje.**

## 1. Gotowe

1. Kontrakt `window.openbot.messengers` (`ipc-messengers.ts`): connect z tokenem tylko do zapisu, status, lista dozwolonych czatów (domyślnie nikt), disconnect, zdarzenie `messengers-changed`. Atrapa do Storybooka z testami.
2. Klient `src/backend/telegram-client.ts`: `getMe`, `deleteWebhook` (bez kasowania oczekujących), `getUpdates` (long polling, tylko `message`), `sendMessage` (zwykły tekst, bez trybu formatowania).
3. Token siedzi w adresie każdego zapytania Telegrama, więc **tekst błędu warstwy sieci nigdy nie jest używany**: każda porażka to `TelegramFailure` ze stałym zdaniem (`token-refused`, `conflict`, `rate-limited` z `retryAfterMs` 1-300 s, `network`, `rejected`). Nic tu nie loguje.

## 2. Testy (10, `src/backend/telegram-client.test.ts`, atrapa `fetch`, bez sieci)

Nazwa bota z `getMe`; odrzucenie odpowiedzi nie-bota; odczyt tylko znanych pól update'ów; offset; zwykły tekst z liczbowym `chat_id`; mapowanie 401/404/409/429/5xx/403; zepsute ciało i brak `ok:true`; **token nie wycieka** (komunikat, JSON, stos) mimo błędu sieci z adresem w tekście; przerwanie zewnętrzne; `deleteWebhook`.

Uruchomione: `vitest run src/backend/telegram-client.test.ts` (10/10), `biome check` obu plików (czysto), `tsc --noEmit -p tsconfig.node.json` (kod 0).

## 3. Jeszcze do zrobienia (kolejne kroki, jedna rzecz naraz)

1. Silnik: magazyn (token szyfrowany `SecretBox`, lista dozwolonych, nieznane czaty bez treści), pętla pobierania z backoffem, limit 10 wiadomości/min na czat, tylko czaty prywatne i zwykły tekst, podział odpowiedzi na części.
2. Podpięcie IPC (main + preload) i przekazanie wiadomości do wybranego agenta bez nowego narzędzia dla agenta.
3. Testy silnika na atrapie usługi Telegrama na `127.0.0.1`.

## 4. Czego nie sprawdzono

Prawdziwego Telegrama, Electrona, `sandbox:e2e`, Storybooka, buildu i pełnego `check` (brak świeżego znaku lidera). `getUpdates` z długim oczekiwaniem sprawdzono tylko na atrapie.
