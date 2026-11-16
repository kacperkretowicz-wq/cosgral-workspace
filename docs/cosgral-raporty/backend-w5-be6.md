# W5-BE6: chwiejny test Vaulta „vault-list-no-secrets”

**Następny krok dla lidera:** scalić `team/backend/w5-be6` razem z BE5 przed kolejnym pełnym `check`.

**Stan:** zrobione, tylko testy jednostkowe, bez Electrona.

## Werdykt: fałszywy alarm testu, nie wyciek w kodzie

- **Który sekret:** zawsze `CARD_CVC` = `"314"`. To jedyny krótki sekret w teście (3 cyfry).
- **Gdzie się „znajdował”:** w polach, które program generuje sam:
  - losowy `id` pozycji (UUID, cyfry szesnastkowe, np. `…-8314-…`);
  - milisekundy w `createdAt` / `updatedAt` (np. `…:31.314Z`).
- **Dlaczego tylko czasem:** to czysty przypadek, nie obciążenie ani wspólny stan. Test sprawdzał zwykłym `includes("314")` cały JSON listy. Pomiar na prawdziwym `VaultStore`, te same 4 zapisy, 1000 razy: stara kontrola padła **24 razy na 1000 (2,4 %)**, przy powtórce 23/1000. Trafienia: `id` 23, `createdAt`/`updatedAt` 2. Inne sekrety: 0. `items=4` z błędu lidera też to potwierdza: baza była świeża, bez śladów innych plików.
- **Podejrzenia lidera odrzucone:** `process.env` (test sam zapisuje i przywraca środowisko), `COSGRAL_ACCEPTANCE_ROOT` (folder jest czyszczony na starcie), zegar `NOW` (`VaultStore` używa prawdziwego czasu, `NOW` tylko w narzędziach) i `ApiKeyStore` ze slotami. Ten ostatni ma inną tabelę, a `VaultStore.list()` czyta tylko `projection_vault_items`.
- **Kod jest w porządku.** `summarize()` w `src/backend/vault-store.ts` (od linii 339) oddaje tylko: `id`, `kind`, `label`, `origin`, `username`, `hasTwoStepKey`, `cardLast4`, `cardExpiry`, `name`, `createdAt`, `updatedAt`. Brak CVC, pełnego numeru karty, hasła, klucza 2FA, wartości klucza API i e-maila kontaktu.

## Poprawka (tylko test i skrypt smoke)

1. `src/backend/w2-t4-vault-routines.acceptance.test.ts`: nowa funkcja `secretHits(text, secrets)`.
   - Przed szukaniem usuwa tekst generowany przez program: UUID, czasy ISO i czasy Unix (10 lub 13 cyfr).
   - Wszystko, co pochodzi z wejścia, nadal jest przeszukiwane, także etykieta, nazwa i cała reszta wiersza bazy.
   - Używają jej obie kontrole: `vault-list-no-secrets` i `scanDb` (`vault-secret-not-in-db`, `webhook-secret-not-in-db`). Ta druga miała ten sam ukryty problem.
   - Komunikat błędu podaje teraz nazwę znalezionego sekretu (`found=CARD_CVC`), a nie tylko `items=4`.
2. Nowy test w tym pliku sprawdza filtr w obie strony.
   - Zostaje pominięte: UUID z `314`, czas `.314Z` i liczba `1700000003140`.
   - Zostaje znalezione: CVC w etykiecie, pole `"cvc":"314"` i pełny numer karty (16 cyfr nie jest wycinany).
   - Przed dodaniem funkcji test był czerwony (`secretHits is not defined`).
3. `scripts/w2-t4-vault-routines-smoke.ts` to kopia tych samych kontroli z tą samą wadą. Dostał ten sam filtr.

## Dowód

| Co | Wynik |
|---|---|
| Pomiar 1000 przebiegów (plik tymczasowy, usunięty przed commitem) | stara kontrola: 23/1000 fałszywych alarmów; nowa: **0/1000** |
| Plik testu + sąsiedzi (`api-key-store`, `endpoint-client`, `endpoint-store`, `vault-store`, `vault-tools`), 3 razy z rzędu | 71/71, 71/71, 71/71 |
| `bun run lint` | zielony |
| `typecheck:node` (obejmuje `scripts/`) | zielony |

## Czego nie sprawdziłem

1. Pełnego `bun run check` i Electrona: chwiejność pod obciążeniem w pełnym przebiegu potwierdzi Twój `check`. Przyczyna nie zależy od obciążenia, więc wynik powinien być stały.
2. Nie uruchamiałem samego skryptu `scripts/w2-t4-vault-routines-smoke.ts`, tylko typecheck. Wymaga piaskownicy.
3. Innych testów akceptacyjnych, które szukają krótkich wartości w losowym tekście: przejrzałem tylko pliki z krótkim CVC (`vault-store.test.ts` z `"123"` sprawdza tekst stały, nie losowy).
