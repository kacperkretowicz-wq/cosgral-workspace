# Stałe skille (25.11.2026)

Trzy zestawy skilli są częścią aplikacji i zawsze są w bibliotece, niezależnie od tworzenia agenta.

| Zestaw | Skille | Źródło | Licencja | Domyślnie dla nowych agentów |
|---|---|---|---|---|
| Superpowers 7.0.2 | 15 (brainstorming, writing-plans, systematic-debugging, …) | https://github.com/obra/superpowers | MIT | tak |
| I have ADHD 0.4.1 | `i-have-adhd` | https://github.com/ayghri/i-have-adhd | MIT | tak (działa dopiero po `/i-have-adhd`) |
| Graphify 0.9.120 | `graphify` | https://github.com/Graphify-Labs/graphify | Apache-2.0 (część MIT) | nie (potrzebuje programu `graphify`) |

## Gdzie to jest

- Pliki: `resources/builtin-skills/<zestaw>/skills/<skill>/`. To kopie bez zmian, plus pliki licencji w każdym skillu.
  `SOURCE.md` w każdym zestawie podaje adres, wersję i commit. Pliki są poza lintem i formatowaniem (`biome.json`) i bez
  zamiany końców linii (`.gitattributes`).
- Przy budowaniu trafiają do `resources/builtin-skills` obok aplikacji (`electron-builder.yml`, sprawdza to
  `scripts/verify-windows-package.ts`).
- Silnik: `src/backend/builtin-skills.ts` i `builtin-skills-catalog.ts`. Przy starcie wkłada skille do biblioteki
  (nowy skill, albo nowa wersja, gdy w katalogu podniesiono `bundleVersion`). Skill o tej samej nazwie, który założył
  użytkownik, zostaje bez zmian i jest pokazany jako „zajęta nazwa”.
- Biblioteka nie pozwala usunąć stałego skilla (`SkillLibrary` opcja `isProtected`).
- Ekran: Biblioteka › Stałe skille (`BuiltinSkillsPanel.tsx`): włączanie u wszystkich agentów, u jednego agenta,
  u agentów wybranego projektu, przełącznik „Dla nowych agentów”, lista skilli w zestawie, licencja i źródło.
- Nowy agent dostaje zestawy z przełącznikiem „Dla nowych agentów” (`AgentService.createBot`). Błąd w tym miejscu
  nigdy nie przerywa tworzenia agenta.

## Jak uaktualnić zestaw

1. Skopiuj nowe pliki z publicznego źródła do `resources/builtin-skills/<zestaw>/skills/` (bez zmian treści) i dodaj
   LICENSE do każdego skilla.
2. Zaktualizuj `SOURCE.md`, `sourceVersion` i podnieś `bundleVersion` w `builtin-skills-catalog.ts`, a wersję w `NOTICE`.
3. Agenci zachowują swoje kopie, dopóki nie zaktualizują skilla (albo użytkownik nie włączy zestawu jeszcze raz).

## Graphify

Skill to tylko instrukcja. Do pracy potrzebuje programu `graphify` (Python): `uv tool install graphifyy`.
Aplikacja sprawdza, czy program jest w ścieżce wyszukiwania, i pokazuje polecenie z przyciskiem „Skopiuj polecenie”.
Niczego sama nie instaluje.
