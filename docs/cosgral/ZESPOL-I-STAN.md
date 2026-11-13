# COSGRAL Workspace: kto co robił i na jakim jesteśmy etapie

Stan na **13.11.2026**, spisał KAPI z historii git (`codex/cosgral-desktop` + gałęzie `team/*`), `PLAN.md`, `parytet-0.68.md` i raportów w `docs/cosgral-raporty/`. Zasady obowiązujące wszystkich: `docs/cosgral/ZASADY.md`.

## Etap (szacunek, nie wynik testów)

**Około 55–60% drogi do „totalnie wszystko”** (definicja: 44 wiersze z `parytet-0.68.md`, każdy „jest” z testem i dowodem).

| Fala | Wiersze | Szacunek KAPI | Dlaczego |
|---|---|---|---|
| W1 nawigacja, czat, kanały | 19 | ok. 80% | Silnik kanałów, karty (pytanie, zatwierdzenie, szkic, przejęcie), Needs you, Decyzja, foldery, Chat \| Zadania, stany wiersza: scalone. Braki: większość stron szyny (Zadania, Przepływy, Użycie… to „Coming soon”), pełne menu szyny serwerów, kolejka (steer/edycja po restarcie), osobne okienka panelu bocznego |
| W2 pamięć, skille, MCP, Vault, rutyny, tabele, pliki | 12 | ok. 65% | Cały backend scalony i odebrany w piaskownicy. Panele UI (Vault, rutyny, tabele, pliki) są na gałęzi `team/ui/w2-ui2`, **niescalone**. Brak: przepływy pracy (wiersz 28), szablony agentów (22), dok i żywy podgląd przeglądarki (31) |
| W3 dostawcy, Computer Use, głos, dok… | 10 | ok. 20% | Scalone: Computer Use na Windows (karta zgody, Stop). Backend dostawców (ACP, modele zapasowe, użycie) gotowy, ale **niescalony** i bez UI. Reszta: brak |
| M telefon | 3 | 0% | Nie zaczęte (po W1–W3) |

Metoda: waga równa na wiersz, ocena wiersza z raportów i tego, co scalono. **To szacunek.** Oficjalna liczba z `parytet-0.68.md` brzmi 1 „jest” / 32 „częściowo” / 11 „brak” i jest **nieaktualna** (stan W2-T4, sprzed scalenia W3-BE1 i przed UI W2). Lider powinien ją odświeżyć po scaleniu poniższych gałęzi.

## Niescalone do `codex/cosgral-desktop` (do decyzji lidera)

| Gałąź | Commity | Co zawiera |
|---|---|---|
| `team/kapi/w3-providers` | 7 | W3-K1: dostawcy ACP (Gemini CLI, OpenCode…), modele zapasowe (do 4), użycie i limity; backend, IPC, preload, bez UI |
| `team/ui/w2-ui2` | 3 | W2-UI2: panele Vault, rutyn, tabel i biblioteki plików, prośby Vault; plus raport i wpis w `COSGRAL-CHANGES.md` |
| `team/hydra/h3-second-instance` | 1 | H3: druga instancja programu kończy się natychmiast (< 3 s) przy konflikcie blokady |

Gałęzie `team/backend/p1-windows-run`, `team/tester/a1-gaps`, `team/tester/p1-openbot-parity`, `team/ui/a1-visual`, `team/ui/p1-shell-shape` są z wcześniejszej linii historii (od `main` repozytorium, przed importem bazy 0.1.11) i nie mają wspólnej historii z `codex/cosgral-desktop`. Zostają jako archiwum; nie scala się ich.

## Co zostało

1. **Scalić** trzy gałęzie z tabeli wyżej i odświeżyć liczby w `parytet-0.68.md`.
2. **UI dla W3-K1:** wybór dostawcy, lista modeli zapasowych, widok użycia i limitów.
3. **Przepływy pracy** (wiersz 28; płótno) i **szablony agentów** (22).
4. **W3 bez startu:** zdalny pulpit na Windows (33), głos (34), dok agentów (37), wyspa (38), macierz powiadomień i pełne ustawienia (39), onboarding z językiem i pierwszym agentem (40), marketplace i wtyczki (41), role i status maszyny hosta (36), konektory Vault (1Password / Bitwarden / Proton), publiczny przekaźnik webhooków.
5. **Strony szyny** (Zadania, Przepływy, Użycie, Biblioteka, Marketplace, Więcej) i menu szyny serwerów; kolejka wiadomości (steer, edycja, trwałość).
6. **Telefon (M, wiersze 42–44):** wybór technologii (natywna czy PWA), transport bez chmury OpenBota, zakres MVP (czat + Needs you + powiadomienia).
7. **Testy akceptacyjne** dla W3 i dla UI W2 w piaskownicy.

## Czego nikt jeszcze nie sprawdził (z raportów)

- Instalacja NSIS (pisze do rejestru prawdziwego profilu).
- Agent Claude (brak logowania), prawdziwa kamera, prawdziwy Codex z wznowieniem pamięci.
- Serwery MCP przez HTTP na żywo (zablokowane przez antywirus).
- Pełny przebieg W2-UI2 w Electronie z prawdziwym magazynem (UI testowane na atrapie). Przycisk odpowiedzi osoby w kanale jest w aplikacji ukryty, bo obecny preload nie wystawia flagi `supportsMessageReplies`.
- Wypełnianie formularzy z Vault w Electronie: jest tylko dowód Backendu.

## Kto czym się zajmował

Wszyscy commitują jako „OpenBot Team”, więc podział poniżej pochodzi z nazw gałęzi i raportów.

| Rola (agent) | Zadania | Gałęzie |
|---|---|---|
| **Okiestrator** (lider) | Plan, decyzje, scalanie na `codex/cosgral-desktop`, przeglądy, podgląd w przeglądarce | `codex/cosgral-desktop` |
| **Backend Expert** | P1 uruchomienie na Windows; B1 rdzeń lokalny (konto lokalne, testy Windows, instalator); A1 oczy agenta; W1-BE1 kontrakt i foldery; W1-BE2/BE3 silnik kanałów, karty szkicu i przejęcia, paczka bez `claude.exe`; W2-BE1 skille; W2-BE2 Vault + TOTP; W2-BE3 tabele i biblioteka plików; W3-BE1 Computer Use na Windows | `team/backend/*` (10) |
| **UI Designer** | P1 kształt powłoki; A1 wizualna poprzeczka; B3 marka COSGRAL i makiety; B4 „Lepszy” (Needs you, Decyzja, Chat \| Zadania); W1-UI1 wskaźnik „agent patrzy”, szyna stron, profil lokalny; W1-UI2 trwały Needs you, stany wiersza, foldery; W1-UI3a/3b karty i widok kanału; W2-UI1 ustawienia pamięci/skilli/MCP; W2-UI2 Vault, rutyny, tabele, pliki | `team/ui/*` (10) |
| **Tester** | P1 plan parytetu i plan zespołu; A1 luki; B2 lista 44 funkcji 0.68; W1-T1/W2-T1 opisy zachowania (specyfikacje); W1-T2/T3 i W2-T2/T3/T4 odbiory w piaskownicy (kanały, karty, pamięć, skille, MCP, Vault, rutyny) | `team/tester/*` (10) |
| **KAPI** | K1 sprawdzenie paska agentów; W2-H1 pamięć agentów (przejęte od Hydry po wstrzymaniu); W2-K2 serwery MCP; W2-K3 rutyny i webhooki; W3-K1 dostawcy, modele zapasowe, użycie; ten dokument | `team/kapi/*` (5 + `zasady-projektu`) |
| **Hydra Nakurwiacz 1** | Lekkie zadania i weryfikacja: H2/H4 kontrola paczki Windows (także po W2), H3 szybkie zamykanie drugiej instancji, H5 (gałąź `h5-ui-electron`, bez własnego raportu w repo; z nazwy: UI w Electronie), W2-H1 początek pamięci (przekazane KAPI) | `team/hydra/*` (5) |
| **Tester Hydrant**, **KK Spajacz** | W repozytorium nie ma ich gałęzi ani raportów (są członkami kanału; ich praca, jeśli jest, nie trafiła do git) | — |

## Gdzie szukać szczegółów

- Plan, etapy i decyzje lidera: `docs/cosgral/PLAN.md`
- Lista 44 funkcji i testy odbioru: `docs/cosgral/parytet-0.68.md`
- Specyfikacje zachowania: `docs/cosgral/spec-w1-kanaly.md`, `docs/cosgral/spec-w2.md`
- Raporty zadań: `docs/cosgral-raporty/<rola>-<temat>.md`
- Pochodzenie i lista zmian względem bazy: `COSGRAL-CHANGES.md`
