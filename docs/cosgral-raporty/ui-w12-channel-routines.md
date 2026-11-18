# UI-AB: rutyny kanału (ekran)

Stan: kod, testy jednostkowe i typecheck zielone; nieoglądane w oknie.

## Co jest
- `ChannelRoutinesPanel.tsx`: lista rutyn kanału (stan, harmonogram, następny i ostatni start), Pauza/Wznów, Uruchom teraz, Historia (stan zadania na żywo lub powód pominięcia), Usuń z potwierdzeniem, formularz z walidacją z kontraktu (`channelRoutineProblem`).
- Zdarzenie `channel-routines-changed` zastępuje listę kanału; historia odświeża się razem z nią.
- Wejście: rozwijana sekcja „Rutyny kanału” w `ChannelView` (ładowana dopiero po otwarciu).
- Wszystkie teksty przez `t()`, 39 nowych kluczy PL/EN.

## Testy
- `ChannelRoutinesPanel.test.tsx` 4/4 (utworzenie + uruchom teraz + historia, walidacja bez wywołania `create`, pauza + usunięcie, polski).
- `ChannelView.test.tsx` 2/2, `i18n.test.tsx` 9/9, `typecheck:renderer` zielony.

## Luki
- „Otwórz zadanie” jest w panelu (`onOpenTask`), ale `ChannelView` go jeszcze nie podaje (brak nawigacji do szczegółów Zadania z tego miejsca).
- Edycja nazwy, instrukcji i harmonogramu istniejącej rutyny: tylko Pauza/Wznów (`update` z kontraktu jest gotowy).
- Teksty błędów walidacji pochodzą z kontraktu i są po angielsku.
- Nie ma Storybooka dla panelu (brak GO).

## UI-AC (dopiski, kod bez uruchomienia testów: okno ciche)
- Edycja istniejącej rutyny: przycisk „Edytuj” otwiera ten sam formularz w trybie edycji (nazwa, instrukcja, harmonogram, strefa, dni tygodnia); walidacja `updateChannelRoutineProblem`, zapis przez `channelRoutines.update`.
- Dni tygodnia w harmonogramie „codziennie” (pole wyboru pn–nd; bez zaznaczenia = codziennie). Lista dni jest też w opisie rutyny.
- Komunikaty walidacji z kontraktu i powody pominięć z silnika przechodzą przez `t()` (`problemText`); nieznany komunikat zostaje bez zmian.
- „Otwórz zadanie” w historii: `ChannelView` przełącza na kartę Zadania kanału, zaznacza zadanie (`aria-current`) i przewija do niego. Pełny widok szczegółów (`TasksViewScreen`) wymagałby nawigacji w `App.tsx` i nie jest podpięty.
- Storybook: `COSGRAL/Channel routines` (Dark, Light, EditingDark, EditingLight), nieuruchomiony.
- Nowe klucze PL/EN: 35.
