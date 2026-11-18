# BE-T: gotowe ustawienia dostawców z chmury (18.11.2026)

Gałąź `team/backend/w12-t`. Presety tylko wypełniają formularz punktu końcowego; nic się nie łączy przy starcie. Klucz jest tylko do zapisu (maska, ostatnie 4 znaki).

| Kolejność | Etykieta przycisku | Adres bazowy | Stan | Strona dostawcy, która go podaje |
|---|---|---|---|---|
| 1 | OpenRouter | `https://openrouter.ai/api/v1` | niezweryfikowany | brak (z BE-Q, nie czytane w dokumentacji) |
| 2 | xAI (Grok) | `https://api.x.ai/v1` | niezweryfikowany | brak (z BE-Q) |
| 3 | DeepSeek | `https://api.deepseek.com` (bez `/v1`) | dokumentacja | https://api-docs.deepseek.com/ |
| 4 | Mistral | `https://api.mistral.ai/v1` | dokumentacja (z przykładu curl) | https://docs.mistral.ai/api/ |
| 5 | Groq | `https://api.groq.com/openai/v1` | dokumentacja | https://console.groq.com/docs/openai |
| 6 | Together AI | `https://api.together.ai/v1` (dawniej `.xyz`) | dokumentacja | https://docs.together.ai/docs/openai-api-compatibility |
| 7 | Moonshot (Kimi) | `https://api.moonshot.ai/v1` (międzynarodowy) | dokumentacja | https://platform.kimi.ai/docs/guide/start-using-kimi-api |

Uwagi:
1. Program dokleja `/models` i `/chat/completions` do adresu bazowego, więc DeepSeek zostaje bez `/v1`, jak w jego dokumentacji.
2. Nazw modeli nie zapisuję w presetach: lista modeli jest pobierana z `GET /models` po zapisaniu klucza (stare nazwy w dokumentacji szybko się zmieniają).
3. Moonshot ma też adres dla Chin (`api.moonshot.cn`); dokumentacja, którą czytałem, go nie podaje, więc go nie dodaję.
4. Limit punktów końcowych podniesiony z 8 do 16 (2 lokalne + 7 chmurowych to już 9).
5. Dokumentację czytał agent pobierający strony; adresy nie były łączone z serwerami dostawców.

Nie sprawdzone: połączenie z którymkolwiek dostawcą, działanie klucza, wygląd rzędu przycisków (UI buduje go z listy).
