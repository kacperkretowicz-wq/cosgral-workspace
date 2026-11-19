# KAPI-AU (poz. 37): skan prywatności całego repo

Baza: `978195fbd`. Gałąź `team/kapi/w12-au`. Zakres po stopie właściciela: tylko poz. 37 (38 i 39 nie ruszone).

## Wynik: CZYSTE (po 3 poprawkach w danych testowych)

| Wzorzec | Wynik |
|---|---|
| Nazwa profilu Windows właściciela, `C:\Users\<prawdziwa>` | brak |
| E-mail właściciela, domeny prywatne (outlook, gmail, hotmail) | brak |
| Klucze: `sk-`, `ghp_`, `github_pat_`, `AKIA`, `xox*`, PRIVATE KEY, `AIza` | brak |
| Hasła/tokeny jako literały | brak |
| Śledzone pliki sekretów (`.pem`, `.kdbx`, `id_rsa`, `.env*`) | tylko `apps/auth-api/.env.production` (patrz niżej) |
| Autor commitów | tylko `OpenBot Team <...@users.noreply.github.com>` |
| Ścieżki `Shared\cosgral...`, `OpenBot\Agents` w kodzie | brak |

## Poprawione
1. `src/backend/messenger-bridge.test.ts`: imię „Kacper” w danych testowych -> „Anna”.
2. `src/backend/provider-accounts.test.ts`: `maskAccount("Kacper")` -> `("Anna")` / `"A***"`.
3. `src/renderer/src/App.test.tsx:2866`: ścieżka z nazwiskiem autora bazy (`/Users/<nazwisko>/projects/openbot`) -> `/Users/example/projects/demo`.

## Zostawione (świadomie)
- Login GitHub właściciela `kacperkretowicz-wq` w `package.json` i `electron-builder.yml`: to publiczny adres repo, potrzebny.
- `C:\Users\me`, `owner`, `tester`, `Jane Doe`, `Example`, `demo` w testach: dane zmyślone.
- `hello@openbot.run` (`apps/auth-api`): adres usługi z bazy OpenBot 0.1.11, nie właściciela.
- `norbertbodziony` w `scripts/cosgral-rebrand-visible.mjs`, `src/main/index.ts:420`, `skills-lock.json`: autor i konto bazy OpenBot (publiczne, atrybucja Apache-2.0 / adres do przepisania przy rebrandzie). Do decyzji lidera, czy przepisać link x.com.
- `apps/auth-api/.env.production`: plik z bazy, wartości zaszyfrowane (dotenvx). Nie nasz sekret; do rozważenia usunięcie z naszego repo, bo auth-api nie jest używane przez COSGRAL.
- Przykładowe e-maile `@example.test`, `@example.invalid`, `fixture@cosgral.local`: zmyślone.

## Testy
- `provider-accounts.test.ts` 19/19, `messenger-bridge.test.ts` 29/29, `App.test.tsx` 97/97.
- Biome na 3 plikach czysty.

## Luki
- Skan to `git grep` po aktualnym drzewie. Historii commitów (poprzednie wersje plików) nie skanowałem; autor commitów jest czysty.
- Obrazy, PDF i archiwa (treść binarna) nie przeszukane.
- Brak narzędzia gitleaks/trufflehog (nie ma w PATH).
