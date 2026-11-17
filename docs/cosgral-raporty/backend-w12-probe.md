# Backend W12 – probe naszej aplikacji i różnice z OpenBotem 0.71 (BE-F, krok 1)

Gałąź `team/backend/w12-probe-cards` (z integracji 4b07fe914). Pliki wynikowe (zrzuty, aria, style) są POZA repo: `Shared\cosgral-docs\porownanie-ui\cosgral-w12c\` (nasza aplikacja), `...\porownanie-w12\` (porównanie), mapa parowania `...\map-w12.json`. Aplikacja uruchomiona w piaskownicy z atrapą CLI, w czystym środowisku, po GO; zatrzymana, GO usunięty.

## Co zrobiono i co poprawiłem w narzędziu
1. `launch-cosgral.ts` + `first-run.ts` (nowy): start naszej aplikacji z atrapą Codex i przejście ekranów startowych (Where will it run? > Use this computer > Set up > Continue with Codex). Aplikacja potrafi sama się zrestartować po kroku, więc skrypt łączy się od nowa i działa na ekranie, który zobaczy. Okno główne z agentem „Assistant” pojawiło się.
2. Polityka kliknięć probe: dla naszej aplikacji dozwolony jest wyłącznie przycisk „Continue with Codex” atrapy (reszta słów związanych z logowaniem nadal zabroniona); test `policy.test.ts` 10/10, `launch*.test.ts` zielone.
3. Pierwsze podejście (probe od razu na ekranie startowym) zatrzymało się na 3 ekranach, bo polityka zabraniała „Continue with”; stąd osobny `first-run.ts`.

## Wynik probe głównego okna
13 ekranów, 76 kliknięć, 504 s; zatrzymanie: „nic więcej do otwarcia”. Wszystkie 13 ekranów to jedna strona „Channels” z jej wariantami (panel wątków, menu przestrzeni, szczegóły przestrzeni, biblioteka, kompakt, model Luna, nowy wątek). Probe NIE doszedł do: ekranu Nowy agent, ustawień serwera, ustawień agenta, Marketplace, zadań, Vault. Powód: wchodzi w głąb czatu (breadth-first po przyciskach), a wejścia do tych ekranów są za przyciskami, które polityka pomija (słowa: delete, send, login, connect) albo których nie wybrał w limicie 70 ekranów. Nie uznaję tego za dowód, że tych ekranów nie ma (Tester ma zrzuty kart, ustawień serwera i Marketplace).

## Różnice cosgral vs 0.71 (tylko na parze, którą dało się wiarygodnie zmapować)
Parowanie nazw nie działa samo: referencja jest po polsku i nazwana „new-agent-…”, nasze ekrany „channels-…”. Ręczna mapa: `new-agent` ↔ `channels`, `new-agent-agenci` ↔ `agent-threads-collapse-sidebar`. To NIE są równoważne ekrany (referencyjny „new-agent” to formularz Nowy agent z awatarem; nasz „channels” to czat), więc liczby poniżej są orientacyjne.

| Obszar | Różnica | Dowód |
| --- | --- | --- |
| Motyw | Referencja jest ciemna (tła `#1a1a1a`, `#212121`, `#0d0d0d`, `#2a2a2a`, akcent `#007cf7`); w naszym oknie widać jasny motyw. Brakuje 106 wartości tokenów referencji (m.in. 20 kolorów tła/obramowań, paleta awatarów: `#8b5cf6`, `#e8483f`, `#f08a24`, promienie `100px`, szerokość `680px`). | `INDEX.md` porównania; zgodne z uwagą lidera o jasnym motywie |
| Ekran Nowy agent | W naszym oknie startowym brak formularza z polami: Kolor agenta, Twarz agenta, Nazwa, „W czym ten agent ma pomagać?”, Model/Wysiłek, sekcji Sugestie (6 kart: pomocnik poczty, planer podróży, organizer, doradca zakupowy, partner do pisania, trener nauki). U nas po starcie otwiera się czat agenta „Assistant”. | `new-agent.md`: 24 teksty tylko w referencji |
| Chrome czatu | U nas są elementy, których referencja nie ma w tym miejscu: „Threads: New thread; 0 running, 0 waiting”, nagłówek „Context”-like paski, wiersz modelu Luna z poziomami Low…Max, „Space: Main”, „Show hidden”. Referencyjny pasek ma kolor agenta i twarz. | `new-agent.md`, `new-agent-agenci.md` |
| Tekst mieszany PL/EN | W oknie ustawienia pierwszego uruchomienia (język English) panel „Narzędzia CLI” ma polskie napisy: „Połącz dostawcę”, „Pobierz i przejdź dalej”, „Sprawdź”, „Aktualizuj automatycznie”, „Przypnij”, „Własna ścieżka do CLI”. To brak tłumaczenia (UI/i18n). | `03-set-up-this-computer-sprawdz/aria.yml` w wynikach probe |
| Prywatność zrzutów | Stopka paska bocznego pokazuje nazwę użytkownika Windows; ekran konfiguracji pokazuje lokalne konto piaskownicy z domeną `.local`. Wyniki są poza repo; przed wysłaniem poza komputer trzeba zamazać stopkę. | wyniki probe |

## Czego nie sprawdziłem
- Ekrany poza „Channels” (patrz wyżej); animacje i ruch; wygląd po ostatnich zmianach UI-F (ciemny motyw domyślny jest w toku u UI Designera).
- Porównanie zrzut-do-zrzutu pikseli (to robi Tester po swoim GO).
- Pary ekranów inne niż dwie ręcznie zmapowane; 62 ekrany referencji bez pary.

## Wniosek dla UI
Największe różnice to (1) motyw jasny zamiast ciemnego, (2) brak ekranu Nowy agent z awatarem i sugestiami jako ekranu startowego, (3) napisy po polsku w panelu CLI przy języku English. Zgadza się to z diagnozą lidera ze zrzutów Testera.
