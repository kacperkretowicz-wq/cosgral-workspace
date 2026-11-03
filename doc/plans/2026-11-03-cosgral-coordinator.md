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

- [ ] Testy serwera: wybór, trwałość, audyt/komentarz, izolacja, viewer/member,
  ochrona bocznej zmiany przez issue PATCH, powiadomienie rodzica.
- [ ] Minimalny endpoint i instrukcje wspólnej rozmowy.
- [ ] UI: selektor, polskie stany, aktywność i testy.
- [ ] Skrypt e2e z niezależnymi asercjami i mockowanym przepływem do wake.
- [ ] Celowane vitest, typecheck UI i serwera, token gates; zapis rzeczywistych
  wyników i ograniczeń do przekazania. Pełne nested Codex e2e wykonuje nadzorca.
