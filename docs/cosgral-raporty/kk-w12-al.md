# KK-AL: przegląd i18n moich paneli (kolejka KK #8)

Stan: 18.11.2026, gałąź `team/kk/w12-ai` z integracji `7e367cb53`. Bez Electrona i Storybooka.

## Wynik

**Dwa żywe ekrany moich paneli, Mobile Connect i Zdalny pulpit, nie miały ani jednego `t()`. Oba są teraz po polsku (93 klucze). Pozostałe panele były już przetłumaczone.**

1. `MobileConnectPage.tsx`: 47 kluczy, w tym oba długie ostrzeżenia o ruchu (`MOBILE_TRANSPORT_WARNING`, `MOBILE_PLAIN_TRANSPORT_WARNING` z kontraktu przechodzą przez `t()`, bo klucz = angielski tekst) i liczba pojedyncza/mnoga przy wymianie certyfikatu.
2. `RemoteDesktopPage.tsx`: 46 kluczy, w tym stany połączenia (`idle`, `connecting`, `waiting-for-owner`, `connected`, `failed`) i tryby (Podgląd / Sterowanie).
3. `ContextSettingsSection.tsx`: komunikat zapisu owinięty w `t()` (klucz już istniał).
4. Wpis w `docs/cosgral/i18n-inwentarz.md`: tabela przed/po.

## Testy (po jednym pliku)

| Plik | Wynik |
|---|---|
| `MobileConnectPage.test.tsx` | 10/10 (+1: polski nagłówek, ostrzeżenie, kod, parowanie, wymiana certyfikatu) |
| `RemoteDesktopPage.test.tsx` | 3/3 (+1: polski token, baner i cała strona na atrapie) |
| `ContextControls.test.tsx` | 9/9 |
| `i18n.test.tsx` | 8/8 (katalogi równe, niepuste) |
| `typecheck:renderer` | zielony |
| Biome | czysty na zmienionych plikach |

## Luki

1. Nie widziałem tych ekranów po polsku w oknie; to testy jsdom.
2. Zostają po angielsku teksty z silnika (powody niedostępności, błędy klienta, powody wstrzymania obrazu, etykiety sesji) i dwa komunikaty `McpSettings`.
3. Skrót „grep 't('” zawyżał stare liczby (łapał `set(`); liczyłem poprawnym wzorcem.
