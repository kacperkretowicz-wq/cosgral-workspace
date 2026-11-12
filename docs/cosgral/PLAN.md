# COSGRAL Workspace: plan (od 12.11.2026)

**Cel właściciela:** program tylko dla nas, który ma wszystkie funkcje OpenBota, wygląda podobnie, a działa lepiej. Najpierw program na Windows, potem na telefon. To platforma: każda funkcja jest dostępna dla człowieka, agenta i innych programów (API).
**Lider:** Okiestrator. **Gałąź integracyjna:** `codex/cosgral-desktop` (worktree `Shared\cosgral-desktop`, scala tylko lider).
**Baza:** OpenBot 0.1.11 (Apache-2.0), commit `a6fe240`. Pochodzenie i lista zmian: `COSGRAL-CHANGES.md`.

## Stan na start (zweryfikowany 12.11)

- Import bez zmian: `a04be4c22`. Izolacja od zainstalowanego OpenBota: `7ba807576`. Obejmuje nazwę, `appId` `pl.cosgral.workspace`, linki `cosgral://`, aktualizacje z naszego repo i dane w `~/COSGRAL Workspace`.
- Sprawdzone:
  - `bun install`, typecheck node i renderer, build: OK;
  - okno „COSGRAL Workspace” otwiera się w 3 s;
  - baza SQLite tworzy się w osobnym folderze.
- Znane braki:
  - Część funkcji wymaga zalogowania (lokalny serwer kont `127.0.0.1:3100` nie działa).
  - Testy backendu na Windows: 29/96 przechodzi. Przyczyny: atrapa CLI pod macOS i `EBUSY` przy sprzątaniu SQLite.
  - W UI zostało 197 napisów „OpenBot” i logo OpenBot.

## Stan po wznowieniu (12.11, po przerwie)

- Scalone: decyzja o silniku (`f083b4cb1`, `docs/cosgral/silnik.md`: silnikiem jest 0.1.11, Paperclip tylko jako wzorce MIT) oraz marka COSGRAL i makiety W1 (`2df7acb45`).
- Po scaleniu sprawdzone: `bun install`, `typecheck:node`, `typecheck:renderer`, `build` OK. Testy komponentów UI i `src/main` (wybrane): 145/146. Pada `app-icon.test.ts`, bo oczekuje ścieżek macOS (`/`), a na Windows są `\`. To ten sam problem co reszta testów Windows (B1).
- Makiety W1 przyjęte jako układ. Do poprawy w kodzie: polskie znaki w tekstach, karty w czacie jedną kolumną na osi rozmowy.
- W toku: B1 (Backend), B2 (Tester; szkic 6 wierszy), B4-UI. Potem A1 (oczy agenta).

## Narzędzia

```powershell
$env:PATH = "C:\Users\x1 Yoga\OpenBot\Shared\tools\bun;C:\Users\x1 Yoga\OpenBot\Shared\tools\node;C:\Users\x1 Yoga\OpenBot\Shared\tools\git\cmd;$env:PATH"
bun install; bun run typecheck:node; bun run build
```

Uruchamianie na próbę zawsze z osobnymi `USERPROFILE`, `APPDATA` i `LOCALAPPDATA` (piaskownica). Nie wolno uruchamiać na prawdziwym profilu, dopóki Backend nie potwierdzi izolacji.

## Etapy

| Etap | Kto | Zakres | Gotowe, gdy |
|---|---|---|---|
| **B0** ✓ | Lider | Baza i izolacja | Okno startuje, dane osobno |
| **B1** | Backend Expert | Rdzeń na Windows: konta lokalne (bez logowania do cudzej chmury), naprawa testów Windows, pełny przebieg agenta Codex i Claude, instalator `dist:win` | Agent odpowiada w czacie, `.exe` instaluje się i startuje |
| **B2** | Tester | Pełny spis funkcji OpenBota 0.68: każda funkcja → czy jest w 0.1.11 → fala → test akceptacyjny | `docs/cosgral/parytet-0.68.md` |
| **B3-UI** ✓ | UI Designer | Marka COSGRAL (napisy, logo, ikony), potem makiety fali W1 w stylu bazy, w jasnym i ciemnym motywie | Zero „OpenBot” w UI; makiety zaakceptowane |
| **B4-UI** | UI Designer | Kod „Lepszy” A+B+C na komponentach bazy: Needs you w pasku agentów, przyklejona Decyzja nad kompozytorem, Chat / Zadania w kanale; jasny i ciemny motyw | Testy i Storybook, zrzuty z piaskownicy |
| **A1** | Backend Expert | Oczy agenta: narzędzia MCP do podglądu okna, ekranu i kamery (za zgodą, tylko loopback) | Agent opisuje zrzut okna testowego |
| **W1** | Backend + UI | Nawigacja jak w OpenBocie 0.68: szyna serwerów i stron, foldery agentów ze stanami (myśli, czeka na Ciebie, limit), kanały z liderem i zadaniami, karty w czacie (pytanie, zatwierdzenie, podgląd szkicu, przejęcie przeglądarki), panel boczny | Testy z B2 dla W1 przechodzą |
| **W2** | Backend + UI | Pamięć (zawsze / w razie potrzeby), skille i kreator skilli, serwery MCP, Vault (loginy, karty, kontakty, klucze, TOTP) na `safeStorage`, rutyny (harmonogram, webhooki), tabele, biblioteka plików | Testy W2 |
| **W3** | Zespół | Więcej dostawców (Gemini, Grok, OpenCode, własny ACP; wzorce z adapterów Paperclip, MIT), użycie i limity, modele zapasowe, głos, Computer Use na Windows, zdalny pulpit, telefon (QR), dok i wyspa, przepływy pracy, marketplace | Testy W3 |
| **Lepszy** | Zespół | „Needs you” w pasku agentów, przyklejona Decyzja nad kompozytorem, Chat / Zadania w kanale (UI A+B+C, zaakceptowane), wspólna sesja na żywo, oczy agenta (MCP od Backendu), Plugin Studio | Każdy wyróżnik ma test i dowód |
| **M** | Zespół | Telefon, po W1–W3 na Windows: aplikacja na telefon połączona z programem na Windows (czat, Needs you, decyzje, powiadomienia, głos). Na start Backend + UI wybierają technologię i opisują decyzję | Testy M z listy B2 |

## Współpraca w zespole

1. Przed każdym zadaniem scal `codex/cosgral-desktop` do swojej gałęzi (`git merge`, bez rebase).
2. Tester jest jedynym źródłem opisu zachowania wersji 0.68. Pytania o zachowanie kierujemy do niego w kanale.
3. Backend najpierw publikuje kontrakt (typy w `packages/contracts`, IPC, API), potem UI go używa. UI zgłasza Backendowi, jakich danych potrzebuje.
4. Prośba do innej roli idzie przez kanał, żeby lider ją widział. Nie zmieniamy cudzego worktree.
5. Spory i decyzje między rolami rozstrzyga lider.

## Kiedy jest „totalnie wszystko” (wymóg właściciela z 12.11)

1. **Lista:** spis funkcji OpenBota 0.68 od Testera (`docs/cosgral/parytet-0.68.md`, etap B2) to umowa. Funkcji spoza tej listy nie uznajemy za zrobione „na słowo”. Gdy OpenBot doda nową funkcję, dopisujemy ją do listy.
2. **Gotowe:** program jest gotowy, gdy każdy wiersz listy ma stan „jest” i przechodzący test akceptacyjny z dowodem. Wiersza nie wolno usunąć ani oznaczyć „pomijamy” bez decyzji właściciela.
3. **Obszary, których nie może zabraknąć:**
   - nawigacja i stany agentów;
   - czat i karty akcji;
   - kanały i zadania;
   - agenci, szablony, pamięć, skille, MCP;
   - Vault, rutyny i webhooki, przepływy pracy, tabele, pliki;
   - przeglądarka z przejęciem, Computer Use i zdalny pulpit;
   - głos, dostawcy i limity, zespół i serwery;
   - telefon, dok i wyspa;
   - ustawienia i powiadomienia, onboarding, marketplace i wtyczki.
4. **Postęp:** lider po każdej fali podaje właścicielowi liczbę funkcji „jest / częściowo / brak”.

## Zasady

1. Każdy pracuje w swoim worktree, na gałęzi `team/<rola>/<temat>` od `codex/cosgral-desktop`. Scala lider po przeglądzie.
2. Nowe funkcje budujemy na podstawie opisu zachowania (analiza REA, używanie aplikacji, publiczne opisy funkcji). Osoby implementujące nie otwierają kodu OpenBota nowszego niż `a6fe240` ani zdekompilowanej paczki 0.68. Tester opisuje zachowanie własnymi słowami, bez fragmentów kodu.
3. Wygląd ma być podobny do OpenBota: system wizualny bazy 0.1.11 jest nasz. Logo, ikony i grafiki nowych ekranów robimy sami.
4. Każdą zmianę pliku z bazy dopisujemy do tabeli w `COSGRAL-CHANGES.md`.
5. Gotowe = testy + dowód (log lub zrzut) + raport w `docs/cosgral-raporty/<rola>-<temat>.md`. Commit z trailerem `Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>`. Bez push, dopóki właściciel nie da tokenu.
6. Serwery tylko na loopback, sekrety poza repo i czatem.
