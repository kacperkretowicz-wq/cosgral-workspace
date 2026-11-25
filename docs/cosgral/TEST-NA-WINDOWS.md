# Lista do ręcznego testu na Windows

Dla Kacpra. Te rzeczy działają tylko na Windows albo potrzebują prawdziwego konta lub telefonu, więc nie dało się ich sprawdzić w środowisku z Linuksem, w którym pracują wątki. Reszta aplikacji jest sprawdzana w prawdziwym oknie (Electron) w tamtym środowisku.

Stan: 25.11.2026. Jak używać: uruchom aplikację (`start-cosgral.cmd`), przejdź po punktach i zaznacz. Jeśli coś nie działa, napisz w wątku, które to było. Pełniejszy odbiór na czystym koncie jest w `T2-odbior-czysty-windows.md`.

## 1. Zdalny pulpit (Więcej › Zdalny pulpit)

- [ ] Przycisk „Udostępnij ten komputer” działa i pokazuje kod lub adres.
- [ ] Gdy ktoś chce wejść, na tym komputerze pojawia się pytanie o zgodę. Po 60 s bez odpowiedzi widz zostaje odrzucony.
- [ ] „Pytaj na tym komputerze za każdym razem” zostaje włączone także dla widza, któremu wcześniej pozwolono.
- [ ] „Dostęp bez nadzoru”: po włączeniu widz nadal czeka na zgodę, gdy nikt nie siedzi przy komputerze (nikt nie przejmie pustego komputera).
- [ ] Zamknięcie udostępniania („Zamknij zdalny pulpit”) kończy połączenie od razu.

## 2. Computer Use (agent steruje pulpitem)

- [ ] Agent może zrobić zrzut ekranu i kliknąć po Twojej zgodzie.
- [ ] Przycisk Stop przerywa sterowanie natychmiast.
- [ ] Odmowa zgody naprawdę blokuje klikanie.

## 3. Sejf i sekrety (Biblioteka › Sejf, Serwery MCP)

Na Linuksie „Szyfrowanie systemowe niedostępne”, więc zapisywanie jest tam wyłączone. Na Windows ma działać.

- [ ] „Dodaj pozycję” w Sejfie zapisuje login lub sekret, a wartość nie pokazuje się ponownie.
- [ ] Agent może użyć pozycji, nie widząc jej wartości.
- [ ] Serwer MCP z polem sekretu zapisuje sekret i działa po restarcie aplikacji.
- [ ] „Usuń moje dane…” pokazuje listę po polsku i po zatwierdzeniu naprawdę czyści dane programu (zrób to na końcu testów).

## 4. Izolacja procesu agenta (Ustawienia agenta › Izolacja procesu)

- [ ] Stan pokazuje „Izolacja: włączona” albo „wyłączona” (nie „niedostępna”, jak na Linuksie).
- [ ] Włączenie i wyłączenie pyta o zgodę w „Czeka na Ciebie”.
- [ ] Narzędzia plików agenta z izolacją nie wychodzą poza jego folder.

## 5. Zachowanie programu

- [ ] Autostart: przełącznik „Uruchom przy logowaniu” działa, a po restarcie Windows aplikacja startuje.
- [ ] Praca w tle: zamknięcie okna chowa program do ikony przy zegarze, a kliknięcie ikony przywraca okno (menu „Otwórz” i „Zakończ”).
- [ ] Powiadomienia systemowe (toast) pojawiają się, gdy agent czeka na Ciebie.
- [ ] Aktualizacje: „Sprawdź”, „Pobierz” i instalacja działają (potrzebna nowa wersja do pobrania).
- [ ] Instalator: czysta instalacja na koncie bez Node i Bun, aplikacja się uruchamia.

## 6. Telefon (Więcej › Telefon)

Potrzebny prawdziwy telefon.

- [ ] „Włącz i sparuj telefon” pokazuje kod QR i link. Skan kodem aparatu otwiera aplikację telefonu.
- [ ] Parowanie przez sieć lokalną (LAN) działa, a telefon widzi agentów i może odpowiadać na pytania „Czeka na Ciebie”.
- [ ] Parowanie przez Tailscale (poza domem) działa według kroków na stronie.
- [ ] Powiadomienie na telefonie przychodzi tylko wtedy, gdy agent czeka na Ciebie („Wyślij próbne powiadomienie”).
- [ ] Z telefonu można utworzyć i zmienić agenta.

## 7. Połączenia z kontami (potrzebne Twoje dane)

- [ ] GitHub: wpisz Identyfikator klienta i Sekret w Bibliotece › Integracje, „Połącz konto” otwiera przeglądarkę i wraca do aplikacji.
- [ ] Telegram, Slack, Discord: wpisz token bota (Biblioteka › Komunikatory), napisz do bota i dopuść rozmowę. Agent odpowiada.
- [ ] Prawdziwy model: zaloguj się do Codex i Claude (Ustawienia › Dostawcy) i zrób zwykłą rozmowę.
- [ ] Menedżery haseł (1Password, Bitwarden, Proton Pass): „Sprawdź narzędzie” i „Połącz”.

## 8. Języki i teksty

- [ ] Przejdź po wszystkich stronach po polsku i wypisz zdania, które są po angielsku albo niezrozumiałe dla nowicjusza (w Linuksie skan już przeszedł, ale Windows ma własne komunikaty systemowe).
