# Plan projektu układany przez agenta prowadzącego

Gdzie to jest w aplikacji: w widoku projektu, na pasku przycisków nad rozmową, przycisk „Plan projektu”.

## Jak to działa (po kolei)

1. Użytkownik opisuje projekt (pole jest wypełnione instrukcjami projektu, jeśli już są).
2. „Poproś agenta o plan” wysyła opis do agenta prowadzącego jako zwykłe zadanie projektu. Agent ma spojrzeć na projekt z dziewięciu stron:
   cel, zakres, ryzyka, kroki, zależności, jakość, testy, bezpieczeństwo, kolejność. Do tego proponuje najwyżej sześć skilli i wypisuje
   narzędzia, z których projekt będzie korzystał.
3. Gdy zadanie się kończy, program dzieli odpowiedź na sekcje (po nagłówkach `##`). Użytkownik czyta plan, zatwierdza go albo prosi
   o nową wersję z uwagą. Odpowiedź bez znanych nagłówków pokazuje się w całości.
4. Zatwierdzenie zapisuje krótkie podsumowanie planu w pamięci projektu. Niczego nie tworzy ani nie włącza.
5. Dopiero po zatwierdzeniu są dwa osobne pytania, każde z własnym „Tak” i „Nie teraz”:
   - **Skille.** „Tak” tworzy skille z planu w bibliotece i daje je wszystkim członkom projektu. Użytkownik widzi wcześniej opis
     i instrukcję każdego skilla.
   - **Pluginy i konektory.** „Tak” robi tylko listę propozycji (skille z Katalogu dodatków i pluginy z katalogu, które pasują do
     projektu lub są wymienione w planie). Każdą pozycję użytkownik włącza sam przyciskiem „Włącz” albo pomija.
6. Bez „Tak” nic nie powstaje. Odpowiedź „Nie teraz” można później zmienić.

## Gdzie jest kod

- Kontrakt, parser odpowiedzi agenta, tekst prośby: `packages/contracts/src/ipc-project-plans.ts` (testy obok).
- Usługa i zapis (tabela `projection_project_plans`): `src/backend/project-plans.ts`. Stan zadania agenta jest czytany na żywo,
  więc plan pojawia się też po ponownym uruchomieniu programu.
- IPC i preload: `src/main/project-plans-ipc.ts`, `src/preload/project-plans-api.ts` (`window.openbot.projectPlans`).
- Ekran: `src/renderer/src/components/ProjectPlanPanel.tsx` (przycisk w `ChannelView.tsx`), styl w `styles/channel-view.css`.
- Atrapa do Storybooka i testów: `src/renderer/stories/mock-project-plans.ts`.

## Czego jeszcze nie ma

- Dopasowanie propozycji jest proste (wspólne słowa i nazwy z planu), a katalog dodatków ma angielskie opisy, więc przy opisie po
  polsku najlepiej działają nazwy narzędzi wymienione w planie.
- Po zatwierdzeniu nie można poprosić o nową wersję planu z tego ekranu (zmiany idą przez czat projektu).
