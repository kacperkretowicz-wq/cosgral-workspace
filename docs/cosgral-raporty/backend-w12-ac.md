# Backend W12 BE-AC: „nieprzeczytane najpierw” działa w pasku

## Co jest
- `appearance.unreadFirst` (ustawienie z BE-U) przestało być martwe. Gdy jest włączone, agenci z nieprzeczytanymi odpowiedziami są na górze **swojego poziomu** paska:
  - bez folderów lub w trybie zwiniętym: na górze listy;
  - z folderami: na górze w obrębie folderu albo najwyższego poziomu. Foldery i ręczna kolejność zostają, a przesuwają się tylko nieprzeczytani; obie grupy zachowują swoją kolejność.
- Wyłączone (domyślnie) = jak dotąd, bez zmiany kolejności.
- Efekt od razu po zmianie ustawienia i po nowej odpowiedzi (stan „unread” pochodzi z tych samych `agentStates` co plakietka).

## Jak
- `sidebar-tree.ts`: `sortUnreadFirst` i opcja `unreadFirst` w `buildSidebarRows`.
- `appearance.ts`: reaktywny sygnał `unreadFirst`, ustawiany w `applyAppearanceDom`.
- `Sidebar.tsx`: +9 linii w `listRows`. App.tsx bez zmian.

## Dla UI/KK
Przełącznik „Unread first” w `AppearanceSettings` obok „Send message with”: `window.openbot.appSettings.update({ appearance: { unreadFirst } })`. Silnik i pasek są gotowe.

## Testy (jeden plik naraz)
`sidebar-tree` 16/16 (+3), `appearance` 3/3 (+1), `Sidebar.activity` 6/6 (+2, najpierw czerwony), `Sidebar.folders` 25/25, `Sidebar.needs-you` i `Sidebar.eyes-local` zielone. Biome czysty, `typecheck:renderer` zielone.

## Uwaga
Solid 2.0 odkłada zapis sygnału do `flush()`; testy sygnałów wołają `flush()` z `solid-js`.

## Luki
Nie sprawdzone w oknie (brak GO); brak animacji przeskoku wiersza; nie dotyczy listy osób (direct) ani kanałów.
