# KK-AM: `ChannelWorkspace` po polsku (luka wskazana przez KAPI-AH)

Stan: 19.11.2026, gałąź `team/kk/w12-ai`, integracja `2dfb55f09`. Bez Electrona i Storybooka.

1. **Co:** `ChannelWorkspace.tsx` miał 9 napisów bez `t()` (lista kanałów, „Edit channel”, „No channels yet.”, „Select a channel.” i komunikaty „niedostępne w tej wersji” przy wysyłaniu, odpowiedziach, czyszczeniu historii, zapisie okna historii i kanałach). Wszystkie przez `t()`, 9 kluczy PL/EN.
2. **Test:** `ChannelWorkspace.test.tsx` 7/7 (+1 po polsku: nagłówek „Kanały”, „Nowy kanał”, „Wybierz kanał.”, „Edytuj kanał”). `i18n.test` 8/8, `typecheck:renderer` zielony, Biome czysty.
3. **Dwie poprawki pod scalanie:**
   - Nowe klucze wstawiłem w środku katalogów (przy „Channel history”), nie na końcu, żeby nie dokładać konfliktów z dopiskami KAPI.
   - Etykieta trybu „View” na ekranie Zdalnego pulpitu dostała własny klucz „Screen view” (PL „Podgląd”). Klucz „View” miał u KAPI inne znaczenie („Pokaż”).
4. **Pułapka znaleziona przy próbie scalenia (naprawiona w podglądzie):** po scaleniu z KAPI klucz `"Edit channel"` powstawał dwa razy (ta sama wartość), co psuje TypeScript. `git merge-tree` tego nie wykrywa, bo to nie jest konflikt tekstu. W podglądzie jest usunięty.
5. **Luki:** nie widziałem tego w oknie. Zostają po angielsku teksty `ChannelEditor` i `MemorySettings` na tej gałęzi (KAPI-AC ma je na swojej).
