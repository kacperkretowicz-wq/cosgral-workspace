# KK-AE: „Open external links in” i „Restore the last workspace” naprawdę działają

Stan: 18.11.2026, gałąź `team/kk/w12-ae` z integracji `544a6869c` plus scalone `team/backend/w12-x` (silnik BE-X). Bez push. Bez Electrona (GO ma Tester); testy jednostkowe po jednym pliku.

## Wynik

Dwie atrapy z martwego okna ustawień stały się działającymi ustawieniami na ekranie „Settings” (po zębatce) i w oknie `SettingsModal`:

1. **Open external links in** (Default browser / COSGRAL): link z wiadomości otwiera się w domyślnej przeglądarce (jak dotąd) albo w panelu przeglądarki programu. Zachowanie: `Conversation.openMessageLink` czyta `behavior.externalLinks` przy każdym kliknięciu.
2. **Restore the last workspace on launch**: po załadowaniu agentów okno otwiera zapamiętaną stronę i agenta, a potem zapisuje zmiany strony lub agenta po ok. 500 ms. Nowy hook `useRestoreWorkspace`, w `App.tsx` 10 linii.

## Zmiany

| Plik | Co |
|---|---|
| `AppBehaviorSection.tsx` | + przełącznik „Restore…” (`workspace.restore`) i lista „Open external links in” (`behavior.externalLinks`); cofnięcie po odmowie programu |
| `useRestoreWorkspace.ts` (nowy) | odczyt i zapis miejsca (strona + agent); agent, którego nie ma, jest pomijany (strona zostaje) |
| `Conversation.tsx` | `openMessageLink`: tryb „app” otwiera panel przeglądarki, domyślnie bez zmian |
| `App.tsx` | wywołanie `useRestoreWorkspace` (10 linii) |
| `SettingsModal.tsx` | usunięta atrapowa grupa „Workspace” (oba wiersze są teraz w `AppBehaviorSection`) |
| `locales/*` | 1 nowy klucz PL/EN (opis przełącznika) |

Opis przełącznika jest uczciwy: „Otwórz **stronę i agenta** z poprzedniej sesji”. Poprzednia atrapa obiecywała „workspace i zadania”, a **wątek nie jest jeszcze zapamiętywany**.

## Testy (po jednym pliku)

| Plik | Wynik |
|---|---|
| `useRestoreWorkspace.test` (nowy: otwarcie miejsca; ustawienie wyłączone; usunięty agent; zapis po zmianie, ale nie przed przywróceniem) | 4/4 |
| `AppBehaviorSection.test` (+ test zapisu linków i restore) | 3/3 |
| `App.test` (+ test: link w programie otwiera się w jego przeglądarce, gdy tak ustawiono; reszta bez zmian) | 96/96 |
| `SettingsModal.test`, `InitialSetup.settings.test`, `i18n.test`, `App.eyes.test` | 2/2, 4/4, 9/9, 8/8 |
| `typecheck:renderer`, `check:ui` | EXIT 0, zielone |
| Biome (zmienione pliki) | czysto |

## Luki

1. **Wątek nie jest zapamiętywany** (zapisujemy `threadId: null`): silnik to dopuszcza, ale okno nie zna wątku na poziomie `App`. Wymaga zmiany w `Conversation`/`ThreadPanel` (osobne zadanie UI).
2. Miejsce jest jedno, nie osobne na każdy serwer (ograniczenie BE-X).
3. Przy zerowej liczbie agentów miejsce nie jest zapisywane (nie ma czego odtwarzać) i zaczyna się zapisywać po pierwszym agencie.
4. **Nie oglądane w oknie**: czy odtworzenie nie „miga” (okno startuje na `agents`, potem skacze na zapamiętaną stronę) i prawdziwy restart programu. To sonda dla Testera: otwórz stronę Library i agenta B, zamknij, uruchom, sprawdź.
5. Zostają atrapy tylko w martwym oknie: dwa przełączniki „Notifications” (prawdziwa macierz powiadomień jest na ekranie „Settings”). Rekomendacja: usunąć.
