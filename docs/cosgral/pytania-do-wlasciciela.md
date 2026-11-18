# Pytania do właściciela: co robimy dalej (z kosztem)

Stan: 18.11.2026. Parytet kodowy 75% (ostrożnie 56,9%, w oknie 45,1%). Godziny to moja ocena (kontrakt + silnik + ekran + testy na atrapach), nie pomiar. Szczegóły i powody: `docs/cosgral/parytet-0.71.md` → „Decyzje” oraz `luki-silnika-071.md`.

## Wynik w jednej linii

**Pięć decyzji, razem ok. 47 godzin pracy. Moja rada: Tak dla „Rutyn kanału” i „LLM w przepływach”, Nie dla Discorda i sterowników innych dostawców, dopóki nie obejrzymy w oknie tego, co już mamy.**

| # | Pytanie | Koszt | Co zyskujesz | Ryzyko | Moja rada |
|---|---|---|---|---|---|
| 1 | **Discord** (tylko rozmowy prywatne, jak Telegram i Slack)? | ok. 9 h silnik + ok. 3 h ekran | Trzeci komunikator; +0,7 pp parytetu (+1,4 pp z ekranem) | Prawdziwy test wymaga tokenu bota Discorda; bez niego tylko testy na atrapie | **Nie teraz.** Najpierw obejrzyj w oknie Telegram i Slack; jeśli ich używasz, Discord dołożymy w jeden dzień |
| 2 | **Rutyny kanału** (zadanie cykliczne dla całego zespołu, nie tylko jednego agenta)? | ok. 6 h | Kanał sam startuje pracę o stałej porze; +0,7 pp | Lekkie; dotyka silnika kanałów | **Tak, jeśli pracujesz kanałami.** Rutyny pojedynczego agenta już działają |
| 3 | **Sterowniki innych dostawców** (Grok, Cursor, OpenRouter…)? | ok. 8 h na jednego dostawcę | Więcej modeli bez ACP; +0,7 pp | Ciężkie: potrzebne ich narzędzia CLI, a polecenia nie są zweryfikowane; pobieranie CLI wymaga Twojej zgody | **Nie bez Twojej zgody na pobranie CLI.** Katalog 18 dostawców i klucze już są |
| 4 | **LLM i Asset w przepływach** (krok „zapytaj model”, krok z plikiem) i adnotacje na płótnie? | ok. 13 h (5 + 5 + 3) | Przepływy zbliżone do 0.71; +1,4 pp | Lekkie; edytor Workflows musi być najpierw zrobiony (robi UI Designer) | **Tak, ale po edytorze.** LLM najpierw (5 h) |
| 5 | **Instalacja skilla z linku GitHub** w Marketplace? | ok. 8 h | Własne skille z internetu | Ściąga cudzy kod: każdy skill wymaga przeglądu; tylko z kartą zgody | **Nie.** Katalog własny ma już 14 skilli i 9 agentów |

Do tego kategorycznie poza zakresem (decyzja jest, nie pytam): stały link do parowania telefonu, trasa przez chmurę, zdalny pulpit bez nadzoru, Image/Video w przepływach (12 h+ każde, ciężkie).

## Czego nie sprawdziłem

1. Koszty to szacunek z wielkości podobnych ekranów i silników, nie pomiar.
2. Nie sprawdzałem, czy Discord, Grok lub OpenRouter zmieniły swoje zasady dostępu od ostatniej analizy.
3. „+ pp” liczę regułą z parytetu (wiersz „częściowo” → „jest” to +0,7 pp).
