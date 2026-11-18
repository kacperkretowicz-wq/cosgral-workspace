# UI-AN — Knows/Brain podstrony kart agenta (kolejka UI #6)

**Gałąź:** `team/ui/w12-ai`  
**Baza:** `4f21fbfe7` (integracja po UI-AJ-FIX / refill kolejki)  
**Data:** 18.11.2026

## Wynik

Karty **Knows** (Instructions, Memories, Skills) i bogatsze **Brain** (Backup models, Chat color) otwierają pełne podstrony z **Back**, jak na zrzutach 060–064. Memory i Skills nie leżą już zawsze pod siatką kart — tylko przez kartę.

| Karta | Podstrona |
|---|---|
| Instructions | `description` + ścieżka `…/AGENTS.md`, Save |
| Memories | `AgentMemorySettingsView` |
| Skills | `SkillsSettings` |
| Backup models | `FallbackOrder` + `providers.setFallbackModels` |
| Chat color | select koloru (prefs) |

Detail strip (Files/Folders/Usage/…) bez zmian.

## Testy

| Co | Stan |
|---|---|
| `AgentCardPage.test` | 2/2 |
| `AgentCardsSection.test` | 8/8 |
| `i18n.test` | 8/8 |
| Biome (zmienione) | OK |
| `typecheck:renderer` | OK |

Bez Storybooka / Electrona.

## Luki

- Tables / Routines / Permissions nadal bez własnej podstrony (tylko count na karcie / sekcje niżej).
- Instructions = opis agenta w kontrakcie, nie edytor pliku AGENTS.md w folderze.
- Skills: istniejący panel, nie modal All/Local/Enabled jak 064.
- Nie sprawdzone w oknie.
