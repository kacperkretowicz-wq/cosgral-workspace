# KK W12: odbiór własnych paneli na zrzutach Testera (17-11-f)

Data: 18.11.2026. Źródło: `zrzuty-cosgral-17-11-f` (25 PNG + `vs-071.txt`, build `8f013e036`, poza repo). Oglądałem zrzuty 16, 17, 19, 20, 21. Bez uruchamiania czegokolwiek (ciche okno).

## Wynik w jednej linii

**Trzy z pięciu paneli widać w prawdziwym oknie i wyglądają poprawnie (Mobile Connect, Zdalny pulpit, Komunikatory); Aktualizacje i Głos nadal nieobejrzane, bo skrypt zrzutów robi je na złych stronach.**

| Zrzut | Co jest na obrazie | Werdykt |
|---|---|---|
| 20-mobile-connect | Strona Phone; pod kartami „How phones reach this computer” z trasą „This computer only” w użyciu i komunikatem „Phones cannot connect: Mobile Connect is off.” | **Panel działa.** Dolna część (lista telefonów, niedostępne) poza kadrem |
| 21-remote-desktop | Na górze „Who may come in”: plakietka „Off”, „0 of 1 sessions open · 0 waiting for your answer”, przełącznik „Ask on this computer every time” (wyłączony, 60 s na odpowiedź), „Unattended access: Not available” z powodem | **Panel działa**, spójny z ciemnym motywem |
| 17-messengers | Strona Library: Proton Pass, potem „Messengers”: Telegram i Slack, „Not connected”, pola na tokeny (puste), „How to set it up”, „Who may talk to an agent: Nobody is allowed yet.” | **Działa**; tokeny tylko do wpisania |
| 16-updates | Strona **Workflows** | **Zły zrzut** (skrypt): panel nie został otwarty |
| 19-voice | Ustawienia serwera → MCP („This section has its own screen. Open”) | **Zły zrzut** (skrypt): okno ustawień programu nie zostało otwarte |

## Dlaczego 16 i 19 chybiają (z kodu)

Dział Updates i Voice są w **oknie ustawień programu**, nie w „Server settings”. Otwiera je przycisk z zębatką na dole paska (aria-label „Settings”, `PageRail.tsx:279`). W zrzucie 19 skrypt kliknął pozycję „Server settings” w pasku stron: jej nazwa też zawiera słowo „Settings”.

**Lokator dla Testera:**
1. `getByRole("button", { name: "Settings", exact: true })` (w PL „Ustawienia”): zębatka, nie „Server settings”.
2. W oknie, które się otworzy (rola `dialog`): przycisk menu o nazwie „Updates” (PL „Aktualizacje”) albo „Voice” (PL „Głos”), czyli `.settings-modal-nav-item`.
3. Asercje: nagłówek „Updates” i tekst „COSGRAL Workspace version”; w Voice nagłówek „Microphone” i „Not available in this version”.

## Co zauważyłem na zrzutach (do poprawy później, nie błędy)

1. Zdalny pulpit: pod moim panelem reszta strony (Share this computer, Connect to another computer) jest bez stylu paneli, tylko goły tekst i pola. To stara strona, nie mój panel; spójny wygląd to zadanie dla UI Designera.
2. Mobile Connect pokazuje „Phones cannot connect” i jednocześnie trasę „In use”, gdy serwer telefonu jest wyłączony. To zgodne z danymi (zapisana trasa), ale może mylić; do zmiany tekstu, jeśli właściciel zgłosi.

## Nie sprawdzone

Zrzuty Aktualizacji i Głosu, dolna część strony Phone, „Connect accounts”, panel podagentów (pojawia się tylko, gdy agent uruchomi podagenta) i obraz po kliknięciach.
