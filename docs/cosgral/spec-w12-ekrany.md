# Spec zachowania — ekrany W12 (UI-E)

**Autor:** Tester (T-E) · **Data:** 17.11.2026 · **Gałąź:** `team/tester/w12-odbior2`  
**Źródła (tylko odczyt, poza repo):** `Shared\cosgral-docs\openbot-0.71-funkcje.md`, `openbot-0.71-screens-indeks.md` (zrzuty 010–019, 020–034, 009/035–039, 078–087).  
**Cel:** UI Designer rysuje ekrany; Backend/KK dają kontrakty. Bez kopiowania grafik i dosłownych napisów 0.71 — tylko sens EN i zachowanie.

---

## A. Tasks ↔ chat (zrzuty 078–087)

| Element | Zachowanie | Stany | Kryterium PASS |
|---|---|---|---|
| Lista zadań (szyna / strona Tasks) | Pokazuje otwarte zadania (tytuł, agent, status); klik otwiera szczegóły | loading → lista; empty → jasny komunikat + CTA; error → Retry | Lista z API zadań; empty bez „martwego” ekranu |
| Wybór agenta do zadania | Osoba wybiera agenta przed / przy wysłaniu | disabled gdy brak agentów | Nie da się wysłać bez agenta |
| Szczegóły + kroki | Kroki rozwijane; postęp widoczny | steps loading / expanded / collapsed | Liczba kroków zgodna z planem/zadaniem |
| Open as chat | Tworzy / otwiera wątek agenta powiązany z zadaniem | busy podczas tworzenia; error z powodem | Po sukcesie widać czat agenta (zrzut 086–087) |
| Archive (hover) | Archiwizuje zadanie; znika z aktywnej listy | confirm opcjonalnie; error nie gubi listy | Zarchiwizowane nie wraca do active bez undo |
| Attach w zadaniu | Dołącza plik do kontekstu zadania (biblioteka) | busy Importing… | Plik w bibliotece / w zadaniu |

**Kontrakt oczekiwany:** istniejące `channels.listTasks` / actOnTask + wątki (`threads`) albo dedykowane Tasks API — UI-E ma zapisać braki do `zapotrzebowanie-backend-ui.md`.

---

## B. Ustawienia serwera — 14 sekcji (zrzuty 020–034)

Kontrakt: `window.openbot.serverSettings` (`sections` / `get` / `update` / storage).

| Sekcja (id) | Zachowanie | Stany | PASS |
|---|---|---|---|
| general | Nazwa hosta, limity wątków, limity wspomnień, tryb busy domyślny | loading; zapis OK; error walidacji | Wartości wracają po ponownym `get` |
| personality | Osobowość / instrukcje serwera | empty OK | Zapis bez restartu okna |
| agents | Domyślne uprawnienia nowych agentów | — | Zgodne z kontraktem |
| vault | Odsyła do Vault / konektorów | api `vault` | Sekcja otwiera istniejący UI Vault |
| members | **Niedostępne** (powód z kontraktu) | unavailable | Brak atrapy „udawanych” członków |
| remote-desktop | Stan hosta RD | api `remoteDesktop` | Spójne z `remoteDesktop.getState` |
| mcp | Lista serwerów MCP | api `mcp` | Statusy z silnika MCP |
| storage | Pomiar dysku, clear logs | measure / clear | Liczby > 0 po measure; clear nie kasuje agentów |
| sites | **Niedostępne** | unavailable | Powód widoczny |
| providers | Lista / limity dostawców | api `providers` | Bez sekretów na ekranie |
| import | Import z pliku (g2) | api `transfer` gdy gotowe | Wybór pliku → preview → apply |
| transfer | Eksport / transfer instancji | j.w. | Manifest bez sekretów |
| routines | Lista rutyn | api `routines` | Link do ekranu rutyn |
| browser-profiles | Profile przeglądarki | api `browserProfiles` | Lista profili |

---

## C. Marketplace — 3 zakładki (009, 035–039)

| Element | Zachowanie | Stany | PASS |
|---|---|---|---|
| Wejście Marketplace | 3 zakładki: Apps / Agents / Skills | — | Zakładki przełączalne, i18n PL/EN |
| Apps (`pluginCatalog`) | Siatka wtyczek; Connect / Install; własne | source none → „wskaż folder”; loading; error stałe zdanie; needs-sign-in → OAuth MCP | Install nie pokazuje sekretów; Connect woła `mcpOAuth` gdy `needs-sign-in` |
| Agents | Szablony agentów z katalogu marketplace | empty / error | Install tworzy agenta przez istniejące API |
| Skills | Katalog skilli | j.w. | Install → biblioteka skilli |
| Add custom | Własny MCP | walidacja nazwy/transport | Bez sieci poza loopback bez zgody |

---

## D. Ustawienia aplikacji (010–019)

| Zakładka (sens) | Zachowanie | Stany | PASS |
|---|---|---|---|
| General | Język, rozmiar UI, skrót Send, opcje powłoki | zapis przez `appSettings` | Zmiana języka odświeża napisy bez restartu procesu |
| Profile | Profil lokalny (bez chmury OpenBot) | unavailable części OK | Brak wymuszania logowania hosted |
| Notifications | Macierz zdarzenie × desktop/sound | — | Zapis macierzy |
| Voice | Modele dyktowania / TTS | downloading / ready / missing | Pobieranie tylko po zgodzie karty |
| Dynamic Island / Dock | Preferencje wyspy i doku | api `island` / `dock` | Zgodne z kontraktami W3 |
| Computer Use | Uprawnienia / Stop | api `computerUse` | Stop kończy sesję |
| Billing | Poza zakresem COSGRAL | unavailable | Etykieta „niedostępne”, bez atrapy Stripe |
| Mobile Connect | Telefony / PIN / link | api phone | PIN nie wraca w UI |
| Updates | Sprawdzanie lokalne (g2) | checking / up-to-date / error | Bez wysyłania danych na zewnątrz bez zgody |

---

## Czego ten spec nie obejmuje

- Pixel ±2 / kolor ±5 (to odbiór po GO + `ui-fidelity`).
- Workflows canvas, Library/Usage/Schedule głębiej (kolejne zadanie UI).
- Dosłownych stringów z paczki 0.71.
