# T19 — role firmowe i pokrycie OpenAPI

Cel i zakres zatwierdzony poleceniem t19: sześć brakujących operacji OpenAPI oraz spójny backend własnych ról, bez panelu UI i bez modelu.

Właściciel zachowania: serwis company-roles. Definicja zawiera nazwę, opis, wersję i listę istniejących PERMISSION_KEYS. Przypisanie stosuje konkretną wersję jako zestaw grantów przez accessService.setMemberPermissions; zapisuje pokwitowanie wersji. Edycja definicji nie rozszerza automatycznie praw wcześniejszych odbiorców. Ponowne przypisanie wymaga nowej kontroli nadającego. To bezpieczny, jawny etap przed dynamicznym dziedziczeniem i panelem UI.

Rozważone warianty: osobny silnik ACL (odrzucony: powielenie Paperclip), dynamiczne role w każdym konsumencie grantów (szersza migracja), wersjonowane zastosowanie istniejących grantów (wybrane dla tej tury). Rola nie zmienia AGENT_ROLES, zaufania, membershipRole ani ograniczeń projektu.

- [x] Odtworzyć RED pokrycia OpenAPI, dodać sześć operacji z rzeczywistymi kontraktami, sprawdzić GREEN bez wyłączeń.
- [x] Testy HTTP/DB: ścisły kontrakt, admin z manage_permissions, brak eskalacji z grantu scoped, przypisanie użytkownik/agent, izolacja firm, wersje i rollback audytu.
- [x] Implementacja shared + schema + migracja przez pnpm db:generate + serwis/trasy/mount/OpenAPI. Mutacje w transakcji; blokada firmy serializuje własne operacje, blokady członkostwa i grantów zabezpieczają autoryzację nadającego.
- [x] E2E z produkcyjnymi trasami i tymczasowym PostgreSQL, tylko 3197, cleanup finally, bez kont/modeli/sekretów.
- [x] Weryfikacja serwer/UI typecheck, właściwe testy, migracje, token gates, mapy, diff --check. Dokumentacja po polsku, wpis #19; bez commit/push.

Ryzyka do sprawdzenia: obca firma/nieaktywny członek; ograniczony zakres nadającego; edycja roli po utracie prawa; niespójna wersja; audyt odrzucony. Wbudowane owner/admin/viewer są chronione przed przypisaniem, aby nie udawać zmiany bazowej roli i nie naruszyć ostatniego właściciela. Historia zastosowania jest pokwitowaniem, nie deklaracją bieżących praw po późniejszej ręcznej edycji grantów.
