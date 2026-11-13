# W1-UI3b — kanały i zadania

- Kanały są dostępne z paska rozmów. Widok pokazuje lidera, członków, instrukcje i wiadomości wraz z autorem, wersją wyniku oraz znacznikiem zastąpienia. Odpowiedź wskazuje wiadomość źródłową; kliknięcie przewija do niej, jeśli znajduje się w załadowanej stronie historii.
- Wysłanie tworzy nową wiadomość do lidera i zadanie. Zgodnie z decyzją lidera nie ma przycisku odpowiedzi osoby: obecny kontrakt nie ma pola `replyToMessageId`.
- Zakładka Tasks pokazuje stany kontraktu, Resume dla `paused` i wybór nowego wykonawcy. Dane pochodzą z `channels.list`, `listMessages`, `listTasks`, `sendMessage`, `actOnTask` i `reassignTask`, z aktualizacjami zdarzeniami. Zdarzenia podczas ładowania są ponownie nakładane na pobraną listę.
- Atrapa zawiera kanał dwóch agentów i zadania w różnych stanach. Stories pokazują jasny i ciemny wariant; testy obejmują wiadomość, zmianę istniejącej notatki, wznowienie i przekazanie zadania.
- Weryfikacja: `bun run test src/renderer` 363/363 (43 pliki); po dodaniu testu wersji wyniku ponownie uruchomiono dwa pliki kanałów: 3/3. `typecheck:renderer`, `typecheck:storybook` oraz `build` zakończyły się kodem 0. Obie stories otwarto w lokalnym Storybooku.
- Ograniczenia: historia ładuje ostatnią stronę API, bez pobierania starszych stron. Nie sprawdzono pełnej interakcji w Electronie z prawdziwym backendem; testy renderera używają atrapy.
