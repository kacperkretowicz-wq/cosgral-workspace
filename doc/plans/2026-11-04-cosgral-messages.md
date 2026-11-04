# t14 — historia rozmowy i komunikacja agentów

Zakres zatwierdzony poleceniem t14. Bez modeli, loginów, portu 3199, commit/push.

1. Wspólny kontrakt wpisu i czysta klasyfikacja: błędy/system, zadania/zgody,
   komunikacja adresowana, koordynator, ludzie. Testy reguł i pierwszeństwa.
2. Istniejący komentarz do zadania przypisanego innemu agentowi jest wiadomością
   do tego agenta. Serwis komentarzy zapisuje snapshot adresata; klient nie może
   go podrobić. Istniejące autoryzacje komentarzy pozostają właścicielem zapisu.
   Wake po odpowiedzi z runu wybudzonego komentarzem agenta jest tłumiony w obu
   ścieżkach HTTP (POST komentarza i PATCH zadania z komentarzem).
3. Endpoint odczytu dodatkowej historii: tylko bezpośrednie dzieci rozmowy w tej
   samej firmie/projekcie, ponowna autoryzacja każdego zadania oraz runu. Stronicuje
   komentarze dzieci, utworzenia/zmiany statusu i błędy runów. Bez kopiowania treści
   i bez nowego silnika. Komentarze główne zachowują istniejącą paginację.
4. UI scala dostępne strony i karty zgód po czasie/ID; filtry działają na wczytanej
   historii, mają liczniki, pusty stan i natywną obsługę klawiatury. Szczegóły
   wiadomości agentów są zwinięte. Realtime unieważnia także dodatkową historię.
5. RED→GREEN serwer/UI/skrypt. Skrypt żywego API na podstawie istniejącego e2e
   delegowania/zgód: rzeczywiści wykonawcy, adresowany komentarz, ograniczone runy,
   brak retry. Uruchomienie z modelem pozostaje nadzorcy.
6. Weryfikacja: Vitest, TypeScript server/UI, token gates, maps, diff --check;
   aktualizacja map i przekazania po polsku. Bez deklaracji pełnej gotowości PR.
