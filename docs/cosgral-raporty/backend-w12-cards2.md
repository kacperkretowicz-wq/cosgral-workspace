# Backend W12 – karty agenta bez silnika (BE-G, krok 1)

Gałąź `team/backend/w12-cards2` (z integracji 57a747515).

## Kontrakt (osobny commit `b7c60e32d`)
`window.openbot.agentCards` dostało trzy wywołania, lista kart (`overview`) została jedna:
- `details({botId, card})`: co pokazuje otwarta karta: **files** (pliki zapisane przez agenta w bibliotece, do 50, `total`, `truncated`), **folders** (własny folder, poziom dostępu, dodane i wykluczone), **usage** (licznik i budżet agenta: `BudgetStatus`), **publish**, **advanced** (preferencje, czy jest sesja, liczba wiadomości), **notifications** (poziom, wyciszenie, macierz aplikacji).
- `publishTemplate({botId, name?, summary?, includeMemories?})`, `unpublishTemplate({botId})`: "publikacja" = zapis agenta jako szablonu kreatora agenta na tym komputerze (nic nie wychodzi poza komputer).
- Karty bez osobnych danych (instrukcje, pamięć, skille, tabele, rutyny, uprawnienia, zapasowe modele) mają już własne API; `overview` daje im licznik i linię.

## Silnik
- Każda karta pyta usługę, która ma dane (biblioteka, dostęp, budżet, szablony, ustawienia aplikacji): silnik niczego nie kopiuje; port bez usługi = "niedostępne tutaj" (zwykłe zdanie).
- Publikacja: zapisuje szablon przez istniejący `saveFromAgent`; powtórna publikacja zastępuje stary szablon tego agenta; cofnięcie usuwa szablon; powiązanie agent → szablon w pliku `agent-published-templates.json`; szablon usunięty gdzie indziej = "nieopublikowany" (powiązanie czyszczone); błąd zapisu (np. limit 100 szablonów) nie zostawia powiązania.
- Lista kart: karta Publikacja jest dostępna i mówi "Saved as a template: <nazwa>" albo "Not saved as a template".
- IPC: 3 nowe kanały lokalne (razem 7 `agent-cards:*`), w `local-only-ipc.test.ts`.
- Szew w `agent-service.ts`: jedna metoda `hasProviderSession` (4 linie).

## Testy
`ipc-agent-card-details` 4, `mock-agent-cards` 2, `agent-cards-details` 6, `agent-cards` 12, `agent-card-counts` 3, `local-only-ipc` 6/6; typecheck contracts, node, renderer, storybook; Biome.
`local-only-ipc.test.ts` raz padł w `beforeAll` przy dużym obciążeniu maszyny (limit czasu), po ponownym uruchomieniu zielony.

## Nie sprawdzone / luki
- W oknie (Electron): nic; UI rysuje karty na tym kontrakcie.
- Karta Użycie pokazuje stan z licznika budżetu (okres dzień/miesiąc jak w W8), bez historii dziennej (wykresy 7–90 dni to krok 3, Biblioteka/Użycie/Harmonogram).
- Karta Pliki pokazuje pliki zapisane przez agenta (nie załączniki czatu); lista do 50, reszta w `total`.
