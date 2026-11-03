# Koordynator wspólnej rozmowy projektu

Cel: wybór dowolnego agenta firmy oraz zwykłe delegowanie przez zadania Paperclip.
Zakres i kryteria odbioru: zadanie użytkownika „ZADANIE 5”. Bez commit/push.

Architektura: wspólny wątek zachowuje originKind=project_conversation. Koordynator
jest jego assigneeAgentId; conversationAgentId pozostaje puste, ponieważ oznacza
prywatny chat z jednym właścicielem. Bez migracji i nowego silnika wykonawczego.
Wybór: istniejące uprawnienie właściciela projektu lub administratora, po kontroli
odczytu projektu. Zapis, komentarz i audyt atomowe. Agent tej samej firmy musi mieć
dostęp do projektu; nie dodajemy uprawnień automatycznie. Delegowanie: parentId
rozmowy + projectId + assigneeAgentId wykonawcy + idempotencyKey. Istniejące wake
po komentarzu oraz zakończeniu dzieci. Skill opisuje trwały kanał i raportowanie.

- [x] Testy serwera: wybór, trwałość, audyt/komentarz, izolacja, viewer/member,
  ochrona bocznej zmiany przez issue PATCH, powiadomienie rodzica.
- [x] Minimalny endpoint i instrukcje wspólnej rozmowy.
- [x] UI: selektor, polskie stany, aktywność i testy.
- [x] Skrypt e2e z niezależnymi asercjami i mockowanym przepływem do wake.
- [x] Celowane vitest, typecheck UI i serwera, token gates; zapis rzeczywistych
  wyników i ograniczeń do przekazania. Pełne nested Codex e2e wykonuje nadzorca.

Dowody: COSGRAL-PRZEKAZANIE.md, sekcja Codex #5. Pełny cykl dwóch modeli
pozostaje odbiorem nadzorcy poza sandboxem; checkbox skryptu oznacza mockowane
asercje i testy API do granicy wake, nie zaliczony rzeczywisty run.

Kontynuacja po żywym FAIL (3 XI): kanał nie ma dyspozycji zadania. Właściciel
polityki: project-conversation-policy; zamknięcie tury: heartbeat/project-conversation-turn.
Recovery dyspozycji pomija kanały, kolejka zachowuje osobne wake z kontekstem
zakończonego dziecka, również gdy pozostałe dzieci są otwarte. Błąd lub brak
odpowiedzi zostaje komentarzem systemowym. Bez restartowania serwera nadzorcy.

Weryfikacja poprawki po żywym FAIL: 9 plików serwera / 252 PASS;
regresje 4 pliki / 88 PASS; native 3 PASS; UI 21 PASS; Node 30 PASS.
Rzeczywista kolejka PostgreSQL zachowuje deferred child-completion wake
i promuje osobny run bez modelu. Pełny żywy odbiór pozostaje do powtórzenia
przez nadzorcę po restarcie 3199; wcześniejszy modelowy FAIL nie został zaliczony.
