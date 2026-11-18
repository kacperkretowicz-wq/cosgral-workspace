# Raport KAPI-I: instrukcja uruchomienia + plan próby instalatora

**Gałąź:** `team/kapi/w12-i` (z `5ac646674`)  
**Data:** 18.11.2026  
**Ciche okno:** dokumenty + commit; `dist:win` dopiero po GO lidera.

## Pkt 1 — dokument

`docs/cosgral/URUCHOMIENIE-DLA-WLASCICIELA.md` — 1 strona PL. Źródła: `README_URUCHOMIENIE.md`, `start-cosgral-sandbox.cmd`, `start-cosgral.cmd`, `electron-builder.yml`, `package.json` v0.2.0.

## Pkt 2 — plan próby na czystym koncie (kroki 1–8 z `kapi-w4-h1.md`)

Źródło planu: `docs/cosgral-raporty/kapi-w4-h1.md` (sekcja „Plan próby…”). Warunki: osobne konto lokalne bez OpenBota/COSGRAL; prawdziwy program właściciela zamknięty.

| # | Co | Gotowe? |
|---|---|---|
| 1 | Instalacja (dwuklik / `/S`): SmartScreen, brak UAC, `%LOCALAPPDATA%\Programs\COSGRAL Workspace`, skróty, `cosgral://`, start | **Brak:** konto/maszyna; świeży instalator po GO |
| 2 | Pierwszy start: onboarding; baza `%APPDATA%\COSGRAL Workspace`; OpenBot nietknięty; druga instancja zablokowana | Jak wyżej |
| 3 | Dane testowe (agent, pamięć, Vault) + zamknięcie | Jak wyżej |
| 4 | Aktualizacja 0.2.0 → 0.2.1 (lokalny serwer, `latest.yml` z myślnikami) | **Brak:** build 0.2.1 + lokalny serwer (po GO / osobne zadanie) |
| 5 | Ponowna instalacja tej samej wersji — dane całe | Po kroku 1–3 |
| 6 | Odinstalowanie — znika program, skróty, wpis, `cosgral://` | Po 1 |
| 7 | Diff vs zdjęcie przed: tylko dane `%APPDATA%\COSGRAL Workspace`, cache updatera, Chromium | Po 6 |
| 8 | Odinstalowanie przy działającym programie | Po 1 |

**Gotowe bez konta:** stary plik `dist\COSGRAL Workspace-0.2.0-x64.exe` (16.11, nie na tipie `5ac646674`); plan i checklista; `electron-builder.yml` (`signExecutable: false`, `deleteAppDataOnUninstall: false`); dokument właściciela.

**Brak (bloker właściciela):** osobne konto Windows (lub Windows Sandbox / druga maszyna) z uprawnieniem do instalacji per-użytkownik i ~45 min ręcznej próby. NSIS nie da się bezpiecznie izolować samym `USERPROFILE` na bieżącym profilu.

## Pkt 3 — `dist:win`

Czeka na GO lidera (po pełnym sprawdzeniu). Artefakt poza repo; w `channel_result`: rozmiar + SHA-256.
