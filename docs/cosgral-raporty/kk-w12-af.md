# KK-AF: atrapy usunięte, parytet przeliczony, przewodnik z nowymi ustawieniami

Stan: 18.11.2026, gałąź `team/kk/w12-af` z integracji `4ddcbb5d3`. Bez push, bez Electrona i Storybooka. Testy jednostkowe po jednym pliku.

## 1. Atrapy w oknie ustawień

Z `SettingsModal` usunąłem grupę „Notifications” (przełączniki „Desktop notifications” i „Play a sound when a task finishes”): nie miały zapisu. Prawdziwa macierz powiadomień jest na ekranie „Settings” (`AppSettingsW3`). W „General” zostały wyłącznie rzeczy, które zapisują: App behavior (3 przełączniki + lista linków), Language, Context, Budget. Pozycje nawigacji „Notifications” i „Advanced” dalej mówią „Soon” (wyłączone, jawnie).

- 4 nieużywane klucze usunięte z `en.ts` i `pl.ts` (katalogi dalej równe).
- Test (`SettingsModal.test`): w General są dokładnie 3 przełączniki zapisujące (autostart, praca w tle, przywracanie miejsca), nie ma „Desktop notifications”, „Play a sound…” ani nagłówka „Notifications”.

## 2. Parytet 0.71 (wzór z pliku, 77 funkcji)

| Miara | Było (`eb9df8800`, 72) | Jest (`4ddcbb5d3`, 77) |
|---|---|---|
| Kod | 78,5% (56,5) | **79,2%** (61) |
| Ostrożnie | 59,0% | **58,4%** |
| W oknie sprawdzone | 47,2% | **44,2%** |

Dlaczego dwie miary spadły: dodałem **5 nowych wierszy** (73 autostart, 74 praca w tle, 75 miejsce linków, 76 przywracanie miejsca, 77 zmiana nazwy agenta), a żaden z nich nie jest potwierdzony w oknie (odbiór T-AF w toku). Licznik „w oknie” się nie zmienił (34), mianownik urósł z 72 do 77. Po odbiorze Testera procent „w oknie” i „ostrożnie” wzrośnie.

Pozostałe zmiany: wiersz 2 (wygląd): kontrakt i silnik pełne (BE-U), ekran tylko dla motywu, zostaje „częściowo”; wiersze 4 i 10 (Głos, Aktualizacje): dopisana uwaga, że panele były nieosiągalne do KK-AC; wiersz 54: 7 presetów dostawców. Pełna tabela zmian: `docs/cosgral/parytet-0.71.md` (sekcja „Zmiany od wersji @ eb9df8800”). Tabela obszarów przeliczona: A 77% (15 funkcji), D 95% (11).

## 3. Przewodnik

W sekcji 5a doszły wiersze „jak zobaczyć”: Motyw, Zachowanie programu (cztery ustawienia), Ustawienia kontekstu, Presety dostawców z chmury, Zmiana nazwy agenta. Skrót „Rename” w menu agenta opisany jako działający (był „w przygotowaniu”).

## Testy

`SettingsModal` 3/3, `i18n` 9/9 (plus lint/typecheck niżej).

## Luki

1. Nic z nowych ustawień nie jest oglądane w oknie. Sondy w toku u Testera (T-AF): ikona zasobnika, Restore workspace, Rename, zapis „Launch at login”.
2. Parytet: kolumny „O” dla nowych wierszy są „nie” z założenia, aż do raportu Testera.
3. Okno `SettingsModal` nadal nie jest otwierane z programu (zębatka prowadzi na ekran „Settings”). Zostało w nim: General (jak wyżej), Appearance, Voice, Updates, czyli kopia tego, co jest na ekranie „Settings”. Decyzja do podjęcia: usunąć okno albo je otworzyć; do tego czasu dwa miejsca trzeba utrzymywać razem.
