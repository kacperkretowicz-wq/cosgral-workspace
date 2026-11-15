# PLAN W4–W10 (od 15.11.2026)

Źródło: dokument „COSGRAL Workspace — luki wobec OpenBot 0.70 i plan dla agentów” (tekst: `Shared\cosgral-docs\luki-070.txt`, poza repo). Ten plik to skrót decyzji lidera i podział zadań. Kolejność ważniejsza niż terminy.

## Decyzje lidera (14–15.11)
1. **„Wszystkie funkcje”** = bez komunikatorów, katalogu 200+ aplikacji, serwera na Linuksie, klienta webowego i SSO (rekomendacja dokumentu; do potwierdzenia przez właścicieli przed W10).
2. **Budujemy dalej COSGRAL** (decyzja właściciela z 12.11: bez licencji).
3. **Dostawcy:** Codex i Claude natywnie, endpointy OpenAI-compatible i Ollama; reszta przez ACP.
4. **Rozdział ról (limit sprzętu: 2 agentów naraz, 1,3 GB wolnego RAM):** Backend Expert = ciężkie, KAPI = mechaniczne i zadania z listy „Hydra”, KK = odbiór i piaskownica, UI Designer = kod UI z testami (nie ogląda pulpitu; zrzuty robi KK/Backend skryptem), Tester = spec clean room, gdy zacznie odpowiadać.
5. **Bramka G1 potwierdza właściciel.** Nie zaczynamy W5, dopóki nie potwierdzi.

## Zasady (obowiązkowe)
- Gotowe = backend + UI podpięte w preload i App + test + krok w `sandbox:e2e` lub w `scripts/sandbox-acceptance.ts` + zrzut (poza repo, bo zawiera nazwę konta) + wpis w tabeli parytetu. Bez któregoś = „częściowo”.
- Raport w `docs/cosgral-raporty/` z sekcją „czego nie sprawdziłem”.
- Scalanie tylko po zielonym `bun run check` i `sandbox:e2e`; lider uruchamia aplikację przed scaleniem.
- Status (README_URUCHOMIENIE.md, parytet, COSGRAL-CHANGES.md) aktualizowany w tym samym scaleniu.
- Żadnych ścieżek z konkretnego komputera w kodzie i testach.
- Clean room: implementujący nie czytają kodu OpenBota nowszego niż 0.1.11 (a6fe240).
- Push tylko na `team/*`; na `codex/cosgral-desktop` scala lider. Sekrety nigdy w repo.
- Kod nigdy nie zabija wszystkich procesów `bun`; tylko własny PID.

## Krok 1 · W4 (bramka G1: `bun run check` zielony, `sandbox:e2e` 19/19, raport T2 bez blokerów)

**Stan bramki G1 (15.11.2026): `bun run check` ZIELONY** — jedno polecenie, exit 0, 709 s, kod @ `8bbaf2175` (gałąź `team/kk/w4-g1c`, nie wypchnięta; dalsze commity tylko dokumentacja). Raport: `docs/cosgral-raporty/kk-w4-g1c.md`. Potwierdzenie bramki przez właściciela (decyzja 5) nadal czeka.

| Etap | Wynik | Co |
|---|---|---|
| `check:ui` | zielony | dług natywnych kontrolek 0/0 |
| `lint` (Biome) | zielony | |
| `typecheck` (node + renderer) | zielony | |
| `test` | zielony | 212 plików, 1343 testy (359 s) |
| `test:storybook` | zielony | 50 plików, 209 testów (97 s) |
| `test:visual` | zielony | 4 testy (8,5 s), obrazy Windows z W4-T3 |
| `test:api` | zielony | 6 plików, 29 testów |
| `test:browser` | zielony | smoke BrowserHost w Electronie |
| `api:build` | zielony | |
| `build-storybook` | zielony | |
| `build` | zielony | |

Nie objęte bramką `check`: `sandbox:e2e` i skrypt odbioru (w prawdziwym oknie; ostatnio 24/24 u lidera i 38/38 u KK na wcześniejszych SHA, po W4-T4 nie powtarzane), instalator na czystym koncie.
| ID | Kto | Zadanie | Stan 15.11 |
|---|---|---|---|
| W4-L1 | Okiestrator | tabela dla 0.70 w miejsce parytet-0.68, poprawić README_URUCHOMIENIE | w toku (parytet 0.68 zaktualizowany do 34,5/44 przez KK) |
| W4-L2 | Okiestrator | domknąć przerwane gałęzie | W3-UI6 odrzucona, W3-T3 scalona, W3-BE10 przejęta przez W4-BE2 |
| W4-H1 | KAPI | ścieżki z testów W2-T3/T4, 78 błędów biome, martwy ChannelTasksPanel | do przydzielenia |
| W4-BE1 | Backend | jedno źródło stanu dostawcy (Claude „Not installed” wszędzie) | do przydzielenia |
| W4-BE2 | Backend | atrapa kanału: lider deleguje, zadanie kończy „Done”; start Codex nie wisi na „Thinking” (blocked); „disk I/O error” po awarii | do przydzielenia |
| W4-UI1 | UI Designer | okno „Nowy kanał”, edycja kanału, flaga supportsMessageReplies w preload | po BE2 |
| W4-UI2 | UI Designer | ostylować dolną część ustawień agenta, przejrzeć strony pod gołym HTML | po UI1 |
| W4-T1 | KK | skrypt odbioru na Windows, każdy wiersz z wynikiem | skrypt jest (37/37) |
| W4-T2 | Backend + właściciel | pierwszy przebieg na prawdziwym Codex i Claude | wersja lekka: test połączeń Codex (jedna krótka tura) |
| W4-H2 | KAPI | instalator na czystym koncie Windows | po H1 |

## Dalej (skrót; pełne tabele w dokumencie źródłowym)
W5 subskrypcje bez terminala (CLI zarządzane, logowanie, klucze w safeStorage, wiele kont, endpointy/Ollama, 8 modeli zapasowych) · W6 wątki, kontekst, plan, subagenci, akcje na wiadomościach · W7 motyw jasny, polski, ustawienia w jednym oknie, kierunek wyglądu OpenBot + Grok Bot (nie Paperclip) · W8 poziomy dostępu, piaskownica Windows, profile przeglądarki, przestrzenie klientów, budżety · W9 telefon poza domem (Tailscale), push, PIN · W10 integracje.
