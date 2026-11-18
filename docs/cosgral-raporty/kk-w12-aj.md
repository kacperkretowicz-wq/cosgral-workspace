# KK-AJ: PRZEWODNIK po scaleniach (kolejka KK #4)

Stan: 18.11.2026, gałąź `team/kk/w12-ai` z integracji `b2f7189aa`. Zmiana tylko w dokumencie; fakty z kodu na tym tipie.

## Co dopisane lub poprawione w `PRZEWODNIK.md`

1. **„Motyw” → „Wygląd i pisanie”** (5a): lista z kodu `AppearanceSettings.tsx`: Theme, Interface scale, Font, Accent, **Send message with**, **Agent steps** (BE-Z2). Sekcja „Wygląd”, pkt 6.
2. **„Zadania” → tablica** (5a): przełącznik Active/Archived, wyszukiwanie, pięć kolumn z licznikami (UI-AS, `tasksView.board`), „Open as chat”.
3. **Nowy wiersz „Podstrony kart agenta”** (5a): Instructions, Memory, Skills, Backup models, Chat color jako pełne strony z „Back to agent settings” (UI-AN).
4. **„Zachowanie programu”**: usunięte „wątek jeszcze nie wraca” (UI-AH, potwierdzone w oknie przez T-AI); dopisane, co Tester sprawdził, a co nie.

## Czego celowo nie opisałem

1. **„Unread first”**: silnik i pasek są (BE-AC), ale przełącznika w „Appearance” na tym tipie jeszcze nie ma (UI-AT czeka na scalenie). Opiszę po scaleniu.
2. **Kanały w telefonie, strumień zdarzeń, miejsce przywracania per serwer** (BE-AB/AD): to API bez ekranu, więc nie ma czego klikać.
3. Nic z tego nie widziałem w oknie; kroki wynikają z kodu i raportów Testera.
