# Własne role firmy — etap API

Firma ma katalog nazwanych zestawów istniejących uprawnień Paperclip (`PERMISSION_KEYS`). Rola zawiera nazwę (1–100 znaków), opis (do 2000 znaków), unikalne klucze uprawnień i dodatnią wersję. To osobny katalog od specjalizacji agenta `AGENT_ROLES`, jego tytułu i bazowych ról członkostwa.

## API

Wszystkie operacje wymagają aktora board z aktywnym członkostwem zapisanym w danej firmie. Nawet flaga administratora instancji nie zastępuje członkostwa w tym API. Odpowiedzi mają `Cache-Control: private, no-store`.

| Metoda i ścieżka pod `/api` | Znaczenie |
| --- | --- |
| GET `/companies/:companyId/roles` | Lista definicji, również dla widza |
| POST `/companies/:companyId/roles` | Utworzenie `{name, description, permissions}`, wynik 201 |
| PUT `/companies/:companyId/roles/:roleId` | Pełna edycja `{name, description, permissions, version}` |
| PUT `/companies/:companyId/members/:memberId/custom-role` | Zastosowanie `{roleId, version}` do istniejącego członkostwa użytkownika lub agenta |

Przykład definicji: `{"name":"Rekruter","description":"Tworzy agentów","permissions":["agents:create"]}`. Nieznane pola/klucze, duplikaty i pusta nazwa dają 400. Brak dostępu do firmy lub obca rola/członkostwo daje 404; brak prawa mutacji 403; konflikt nazwy, wersji lub chronione członkostwo 409.

## Autoryzacja i skutki

Mutacja wymaga bazowej roli `owner` lub `admin` oraz istniejącego, nieograniczonego grantem zakresowym `users:manage_permissions`. Nadający musi posiadać każdy klucz roli jako grant firmowy i przejść istniejącą kontrolę `accessService.hasPermission`. Grant scoped (np. jeden projekt, także `tasks:assign_scope`) nie pozwala wydać uprawnienia na całą firmę. Edycja wymaga praw zarówno do starej, jak i nowej definicji; utrata uprawnień nie pozwala zarządzać dawną silniejszą rolą.

Zastosowanie **zastępuje** bezpośrednie granty odbiorcy przez istniejące `accessService.setMemberPermissions`. Pusty zestaw je odbiera. Nie dodaje praw poza definicją. Wbudowane członkostwa owner/admin/viewer oraz nieaktywne członkostwa są chronione przed takim zastąpieniem (409); ich zmianę nadal obsługuje istniejące zarządzanie członkostwem. Pozostają dotychczasowe bazowe prawa operatora, domyślne polityki, ograniczenia zasobów i przecięcie uprawnień agenta z osobą odpowiedzialną.

Wersja jest obowiązkowa przy edycji i zastosowaniu: nieaktualna daje 409. **Edycja definicji nie zmienia wcześniejszych przypisań.** Trzeba świadomie ponownie zastosować bieżącą wersję, z nową kontrolą uprawnień nadającego. Tabela `company_role_applications` zapisuje pokwitowanie ostatnio zastosowanej nazwy, wersji, kluczy i nadającego. Nie jest niezależnym źródłem ACL ani deklaracją aktualnych praw po późniejszej ręcznej zmianie grantów. Źródłem wykonawczym pozostają `principal_permission_grants` i autoryzacja Paperclip.

Mutacja definicji, grantów/pokwitowania oraz zapis audytu są jedną transakcją. Audyt nie kopiuje opisu roli. Blokada firmy serializuje operacje tego modułu; blokady członkostwa i istniejących grantów nadającego chronią kontrolę przed równoczesnym odebraniem praw. Brak workerów, pollingu i wywołań modelu. Migracja 0426 powstała przez `pnpm db:generate`; kolejność indeksów unikalnych przesunięto przed deklaracje zależnych FK, co sprawdzają testy na świeżym PostgreSQL. Standardowe prune pozostawia pięć najnowszych snapshotów.

## Granice i dalsza praca

To spójny etap kontrakt + API + ACL priorytetu c. Brak panelu katalogu i przypisywania w UI, usuwania ról, dynamicznego dziedziczenia po edycji oraz wspólnej migracji istniejących ręcznych grantów. Nie zmieniono pól agenta `role`, `permissions`, trustPreset, polityki sandboxa, budżetu ani dostępu do projektów. Brak tych elementów nie oznacza pełnego ukończenia §12 produktu.

Odbiór: `pnpm --filter @paperclipai/server exec vitest run src/__tests__/company-roles.test.ts src/__tests__/openapi-routes.test.ts` i `node scripts/cosgral-e2e-roles.mjs`. E2E używa produkcyjnego routera, rzeczywistej bazy tymczasowej i jawnych syntetycznych aktorów fixture wyłącznie na 3197; nie sprawdza logowania/przeglądarki/modelu. Nie tworzy kont użytkowników ani dostawców. Port zajęty powoduje odmowę startu; proces kończy się w finally, a końcowy bind potwierdza zwolnienie portu.
