# Odbiór G5 — test ucieczki izolacji (dla właściciela)

**Cel:** sprawdzić, czy host izolacji (Job Object + AppContainer) na **Twoim** Windows blokuje wyjście poza nadany folder. To kryterium **W8-12** (skrypt). **W8-14** (prawdziwy Claude/Codex) to osobny krok — ten skrypt tego nie robi.

**Wymagania:** Windows, `csc.exe` (.NET Framework — zwykle jest), `bun` w PATH (jak w repo), gałąź z W8-BE2 (np. integracja `codex/cosgral-desktop`).

## Kroki

1. Wybierz **nowy, pusty** folder tylko do tego testu, np. `D:\cosgral-g5-test` (nie dysk główny, nie katalog domowy, nie folder z plikami).
2. W katalogu repozytorium desktopu:
   ```text
   bun scripts/isolation-escape-check.ts --root D:\cosgral-g5-test
   ```
   Opcja `--keep` zostawia folder po teście (domyślnie skrypt go usuwa).
3. Skrypt sam: tworzy w `--root` foldery `granted` / `outside` z atrapami tekstowymi, buduje host, odpala `cmd.exe` w AppContainer, na końcu sprząta profil kontenera.
4. Czytaj linie w konsoli: każda to `PASS …` albo `FAIL …: powód`. Na dole: `G5 ESCAPE TEST: PASS (N checks)` albo `FAIL (k z N)`.
5. Kod wyjścia: **0** = same PASS; **1** = co najmniej jeden FAIL; **2** = zły `--root` / nie Windows / brak użycia.

## Czego oczekiwać (kontrole + odmowy)

- **Kontrole (muszą przejść):** odczyt wydanego folderu, zapis przy prawie zapisu, „widać wyciek” gdy `outside` celowo nadany.
- **Ucieczki (muszą być odmówione):** odczyt niewydanego folderu, `..`, inna wielkość liter, listing, zapis na zewnątrz, zapis do folderu tylko-do-odczytu, odczyt przez **junction**, przekroczenie limitu procesów, kill-on-close, „nie startuje gdy izolacja się nie uda” (exit **125**), sprzątanie kontenera.

Na maszynie Backendu (16.11, atrapy): zgłoszono **PASS (15 checks)**. U Ciebie wynik może się różnić (edycja Windows, AV, brak junction).

## PASS / FAIL

| Wynik | Znaczenie |
|---|---|
| **PASS** | Na atrapach `cmd.exe` host + AppContainer trzymają granice z listy powyżej. G5 skryptowe = OK. |
| **FAIL** | Znaleziono obejście albo kontrola nie działa — izolacja **nie** jest gotowa na G5. Nie ignoruj pojedynczego FAIL. |
| Zły root / brak `csc` | Skrypt odmawia albo FAIL helper — najpierw napraw środowisko, nie oceniaj izolacji agentów. |

## Czego skrypt **NIE** dowodzi

1. Że **Claude Code / Codex / MCP** działają w izolacji (dziś Job Object tylko dla Claude; AppContainer przy agentach **wyłączony**).
2. Że agent w programie nie czyta cudzego folderu konta (**W8-14** — osobna próba z prawdziwym CLI).
3. Że Job Object sam chroni pliki (chroni liczbę procesów i sprzątanie; pliki = AppContainer).
4. Antywirusa, Win11/Home, limitu 512 przy prawdziwym buildzie, ani obejścia UAC.
5. Profile przeglądarki, budżetów ani UI.

**Po PASS:** możesz uznać W8-12 (skrypt) za zielony na tej maszynie. Do pełnego muru agentów potrzeba jeszcze włączenia AppContainer wokół CLI i odbioru W8-14.
