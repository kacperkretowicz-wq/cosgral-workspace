# W4-UI1: kanały

Stan: częściowo — kod i testy gotowe; odbiór prawdziwego okna oczekuje.
Gałąź: team/ui/w4-ui1. Baza: 9f49c4ad2. Pierwszy commit: a227429de.

## Zrobione

- New channel w pasku bocznym oraz ChannelWorkspace; Browse channels otwiera listę.
- Dialog: krótka nazwa, tytuł wyświetlany, członkowie (do 20), lider spośród członków, instrukcje. Walidacja nazwy i lidera, limity długości. Błąd zachowuje dane, zapis blokuje kolejne wysłanie i zamknięcie.
- Edycja przez istniejące update/addMember/setLead/removeMember. Najpierw dodanie członków, potem wybór lidera, potem usunięcie starych członków. Ponowienie odczytuje aktualny skład.
- Ograniczenie: operacje nie są atomowe. Wcześniejsze udane zmiany mogą pozostać po błędzie późniejszej operacji.
- Dokładny brak kontraktu: UpdateWorkspaceChannelInput nie ma pola name. Krótka nazwa jest niezmienna; można edytować title, czyli tytuł widoczny na liście. UI to wyjaśnia. Nie dodawałem silnika ani nowego IPC.
- Preload wystawia supportsMessageReplies: true; kontrakt ma opcjonalną flagę. Istniejące Reply i przesyłanie replyToMessageId są teraz dostępne w aplikacji.
- Nowe kontrolki tylko z components/ui. Także dotychczasowe kontrolki ChannelView i ChannelWorkspace zastąpione przez Button/NativeSelect/Textarea. Dialog Kobalte, istniejące style i tokeny COSGRAL.
- Brak istniejącego katalogu tłumaczeń w rendererze. Nowe teksty angielskie zgodnie z obecnym interfejsem; pełna lokalizacja pozostaje w W7.
- Stories COSGRAL/Channel editor: NewChannel, EditChannel, SaveError. Dane demo.

## Sprawdzone

- ChannelEditor.test.tsx: 2/2 — walidacja i zachowanie danych po błędzie.
- ChannelWorkspace.test.tsx: 4/4 — dotychczasowe odpowiedzi i zadania, tworzenie przez kontrakt, kolejność zmiany lidera, żądanie z paska bocznego.
- ChannelView.test.tsx: 2/2 — istniejące zachowanie po migracji kontrolek.
- Testy osobno, --maxWorkers=1, bez pełnego bun run test.
- typecheck:renderer oraz typecheck:storybook: exit 0.
- Biome na 12 własnych plikach: exit 0.
- check:ui: exit 1 na zastanym długu. Lista zmalała z 24 do 22 plików (ubyły ChannelView i ChannelWorkspace). Budżety ARIA 5, kolorów 12, font-size 7, border-radius 7 bez wzrostu. Sidebar zachowuje wcześniejszy dług poza dodanym przyciskiem.

## Krok odbioru dla KK/Backend

W scripts/sandbox-e2e.ts: nowy krok `channel UI: create, edit and reply`, przed delegowaniem. Tworzy kanał przez UI, edytuje tytuł, wysyła wiadomość i odpowiedź, sprawdza replyToMessageId w silniku oraz zapisuje zrzut channel-ui poza repo. Po zbudowaniu uruchomić `bun run sandbox:e2e` w standardowej piaskownicy. Nie uruchomiłem tego kroku.

## czego nie sprawdziłem

- Nie uruchomiłem sandbox:e2e, build ani aplikacji. Nie mam dowodu działania nowego UI w prawdziwym oknie. Odbiór i zrzuty wykonuje KK/Backend zgodnie z przydziałem.
- Nie oglądałem renderu Storybooka. Fokus klawiatury, małe okno, przewijanie dużej listy agentów i wygląd wymagają odbioru.
- Nie wykonałem pełnego bun run check/test, instalatora, typecheck:node ani tur z prawdziwym modelem.
- Nie sprawdziłem równoległej edycji przez dwie osoby; kontrakt nie udostępnia transakcji.
- Nie implementowałem zmiany krótkiej nazwy ani pełnej lokalizacji (powody wyżej).

## Bezpieczeństwo i dokumentacja

Początkowy status worktree czysty. W3-UI6 nietknięta. Bez push, bez zmian danych OpenBota, bez zabijania procesów. Zmiany wyłącznie w repo, brak nowych plików tymczasowych i zrzutów. README_URUCHOMIENIE, parytet i COSGRAL-CHANGES mają status oczekującego odbioru.
