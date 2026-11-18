# KK-AI: lista „okno historii” kanału

Stan: 18.11.2026, gałąź `team/kk/w12-ai` z integracji `961ac2c3f` (zawiera BE-Z `53002be2b` i KK-AG). Bez push, bez Electrona i Storybooka.

## 1. Co jest

- Nowy `ChannelHistoryWindowSetting` (`ChannelHistoryWindow.tsx`): lista „History window” z wartościami 20 / 50 / 100 / 200 (z kontraktu `CHANNEL_HISTORY_WINDOWS`), domyślnie 200, gdy kanał nie ma zapisanej wartości. Pod listą podpowiedź: mniej wiadomości = krótszy kontekst, szybsze i tańsze zadania, prośba zadania zawsze dołączona, zmiana działa od następnego zadania.
- Zapis: `channels.update({ channelId, historyWindow })`. Sukces: „History window saved.”; odmowa programu: jego zdanie w `role=alert`, bez komunikatu o sukcesie.
- Miejsce: sekcja „Channel history” w widoku kanału, nad „Clear history”. Bez `channels.update` w buildzie listy nie ma.
- 5 kluczy PL/EN.

## 2. Błąd znaleziony przy okazji i naprawiony

`ChannelWorkspace` miał `<Show keyed>` po obiekcie kanału: każdy zapis ustawienia kanału podmieniał obiekt i **odtwarzał cały widok** (zamykał rozwinięte sekcje, kasował komunikat). Teraz klucz to `id` kanału, a obiekt idzie żywo przez wewnętrzny `Show`. Zmiana dotyczy też przyszłych ustawień kanału, nie tylko tego.

## 3. Testy (po jednym pliku)

| Plik | Wynik |
|---|---|
| `ChannelHistoryWindow.test.tsx` (nowy) | 4/4: opcje i domyślne 200, zapis liczby i komunikat, zdanie błędu bez „saved”, polski |
| `ChannelWorkspace.test.tsx` | 6/6, w tym nowy: zmiana na 50 przez `channels.update`, lista zostaje na 50, lista kanałów też ma 50 |
| `ChannelHistoryClear.test.tsx` | 3/3 bez zmian |
| `typecheck:renderer`, `typecheck:storybook` | zielone |
| Biome | czysto |
| `check:ui` | **czerwony wcześniej** (3 kolory, 7 font-size, 2 radius; UI-AJ-FIX), nie z tych zmian (zero CSS) |

## 4. Luki

1. Nic nie widziałem w prawdziwym oknie; Storybook i zrzuty nie biegły. Brak historyjki dla nowej listy (jest tylko test).
2. Czy silnik naprawdę ucina kontekst do wybranej liczby, sprawdza BE-Z (kontrakt i silnik), ja sprawdziłem tylko zapis i wyświetlanie.
3. Parytet: lista nie ma własnego wiersza w 77 funkcjach, więc procenty bez zmian; dopisana notatka przy „bez dowodu z okna”.
4. Pozostałe punkty KOLEJKI KK: 3 (parytet po następnym odbiorze Testera), 4 (PRZEWODNIK: ten wiersz dodany), 5 (luki z pytań do właściciela).
