# Backend W12 – pula kont dla innych dostawców (BE-I, krok 1)

Gałąź `team/backend/w12-accounts` (z integracji 98d3553cb).

## Co jest, a czego nie można zrobić uczciwie
Pula kont W5 (Codex, Claude) opiera się na oficjalnych CLI: osobny folder stanu na konto (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`), pobranie z manifestu z sumą SHA-256 i logowanie przez przeglądarkę lub kod. Dla pozostałych 16 dostawców z katalogu nie ma u nas ani potwierdzonych nazw zmiennych folderu stanu, ani oficjalnych manifestów pobierania, ani sposobu logowania, który dałoby się sprawdzić bez prawdziwego konta. Dlatego:
- **Zrobione (da się sprawdzić testami, bez kont):** pula KLUCZY API dla dostawców, które przyjmują klucz (Grok, OpenCode, Cursor, Cline, Mistral, Copilot, a po dodaniu runtime także Inception, DeepSeek, OpenRouter). Ten sam kształt co pula kont: kilka własnych kluczy, rotacja, pomijanie wyczerpanego.
- **Nie zrobione (wymaga runtime lub konta):** pula kont z osobnym folderem stanu i logowaniem dla dostawców typu „konto” (Gemini/Antigravity, Kimi, Hermes, Devin, Cursor, Copilot): brak potwierdzonej zmiennej środowiskowej folderu stanu i procedury logowania.
- **Pobieranie CLI nowych dostawców:** nie ma żadnego pobierania. Programy dostawców ACP dodaje osoba (karta presetów ACP pokazuje link do oficjalnej instalacji; program niczego nie instaluje), więc zasada „tylko za zgodą” jest spełniona przez brak automatu. Dostawcy `needs-runtime` (Grok, Cursor, Pi, Muse, Inception, DeepSeek, OpenRouter, Devin) są w katalogu jako „jeszcze niedostępne”.

## Pula kluczy (`window.openbot.providerCatalog`)
- `addKey({providerId, key, label?})` (do 10 na dostawcę), `removeKey`, `setKeyEnabled`, `setKey` (klucz „default”), `clearKey` (wszystkie). Stan każdego wpisu ma `keys[]`: id, nazwa, maska (nigdy klucz), włączony, `limitedUntil`.
- Codex i Claude: `addKey` odmawia; ich klucz jest jeden, a pulą są konta w Providers (W5).
- Klucze zaszyfrowane w tej samej tabeli co API keys (`catalog:<id>` to pierwszy klucz, jak przed pulą; `catalog:<id>:<klucz>` pozostałe). Kolejność, nazwy, przełączniki i „limit do” w pliku `provider-key-pool.json` (bez sekretów). Klucz zapisany przed pulą pojawia się jako pierwszy.
- Start agenta ACP z presetu: `agentEnv` bierze następny klucz, który jest włączony i niewyczerpany (klucze kolejno); bez żadnego użytecznego klucza nie daje nic i agent wraca do własnego logowania.
- Gdy dostawca zgłosi limit ACP (`provider-usage-changed`, stan `limited`), klucz, z którym agent wystartował, jest pomijany do czasu resetu (domyślnie godzina).

## Testy
`ipc-provider-catalog` 9, `mock-provider-catalog` 2, `provider-catalog` 11 (m.in. kolejność kluczy, wyłączony i wyczerpany klucz, powrót po końcu limitu, limit 10, odtworzenie po restarcie, zgodność wstecz), `local-only-ipc` 6/6; typecheck contracts, renderer i storybook czyste; Biome.
`typecheck:node` zgłasza błędy tylko w skryptach Testera (`sandbox-e2e.ts`, `sandbox-shots-w12.ts`: `window.openbot`), nie w plikach tego kroku.

## Nie sprawdzone / luki
- Żaden prawdziwy dostawca ani klucz; nazwy zmiennych kluczy (`MISTRAL_API_KEY` itd.) pochodzą z opisu 0.71 i dokumentacji dostawców, a polecenia ACP są oznaczone „unverified”.
- Rotacja działa przy starcie agenta (jeden proces ACP trzyma jeden klucz do końca sesji); zmiana klucza w trakcie sesji nie jest robiona.
- `providerRuntimes` (pobieranie runtime Pi/Muse itd.) nie istnieje.
