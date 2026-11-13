# W2-UI1 — pamięć, skille i MCP

- Ustawienia agenta pokazują pamięć, wyszukiwanie, edycję, usuwanie, limit i `essentialPromptBytes` z backendu wobec 8192 B. Pamięć kanału jest w szczegółach kanału, z limitem 500 znaków. Oba panele reagują na odpowiednie zdarzenia.
- Biblioteka skilli jest na stronie Library: podgląd `SKILL.md`, wersje, przywrócenie jako nowa wersja i usunięcie. Ustawienia agenta pozwalają instalować, aktualizować i odinstalowywać; aktualizacja lokalnie zmienionej kopii wymaga potwierdzenia.
- Serwery MCP programu są na stronie Library, z dodawaniem stdio/HTTP, polami sekretów typu password, stanami, narzędziami, ponownym połączeniem i usuwaniem. Ustawienia agenta zawierają przełączniki serwerów. Atrapa zwraca tylko nazwy sekretów i nie zapisuje ich wartości.
- Testy jednostkowe i integracyjne obejmują m.in. licznik budżetu, zapis pamięci i zdarzenia, ostrzeżenie o zmianach, przywrócenie wersji, maskowanie pól i przełącznik MCP. Stories w obu motywach uruchomiono w lokalnym Storybooku.
- Weryfikacja: `bun run test src/renderer` 370/370 (47 plików); po dodaniu testu wersjonowania i tajności atrapy ponowiono dwa pliki: 4/4. `typecheck:renderer`, `typecheck:storybook` i `build` zakończyły się kodem 0.
- Nie sprawdzono przebiegu w Electronie na prawdziwych danych ani rzeczywistych serwerach MCP; testy UI korzystają z atrapy. Po dodaniu nowego serwera pole sekretu jest czyszczone także po błędzie, więc przy ponowieniu trzeba go wpisać ponownie.
