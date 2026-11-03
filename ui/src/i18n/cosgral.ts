import { i18n, useTranslation } from "./index";

// A Polish surface inside the existing i18next system; it does not change
// the language of the advanced Paperclip screens.
i18n.addResourceBundle("pl", "cosgral", {
  providerLimitsUnknown: "Limity dostawcy, cena modelu i dostępność logowania nie zostały zweryfikowane.",
  approval: { accept: "Zatwierdź", reject: "Odrzuć", loadError: "Nie udało się wczytać zatwierdzeń." },
  work: {
    zoomIn: "Powiększ", zoomOut: "Pomniejsz", fit: "Dopasuj graf",
    views: "Widok pracy projektu", chat: "Chat", table: "Tabela", workflow: "Workflow",
    title: "Nazwa", task: "Zadanie", agent: "Agent", model: "Model (konfiguracja)", source: "Źródło dostępu", status: "Status", priority: "Priorytet", dependencies: "Zależności", progress: "Postęp", cost: "Koszt", result: "Wynik",
    search: "Szukaj zadania lub agenta", allStatuses: "Wszystkie statusy", allAgents: "Wszyscy agenci", allPriorities: "Wszystkie priorytety", sort: "Sortuj według", ascending: "Rosnąco", descending: "Malejąco",
    unknown: "Brak danych", none: "Brak", previous: "Poprzednia", next: "Następna", loading: "Wczytywanie…", inChat: "Pokaż w chacie", openTask: "Otwórz zadanie", noResult: "Brak zapisanego wyniku — otwórz chat zadania", checkEvidence: "Sprawdź koszt i wynik",
    costScope: "Zarejestrowany koszt USD zadania z potomkami; brak wpisów daje 0. Nie obejmuje ceny subskrypcji.",
    executionHint: "Model i źródło pokazują bieżącą konfigurację następnego zadania, z nadpisaniem modelu zadania. CLI nie potwierdza subskrypcji. Postęp to ukończone podzadania lub zakończenie zadania; koszt i wyniki pobierzesz przyciskiem w wierszu.",
    legend: "Strzałki ciągłe: podległość i przypisanie. Przerywane: blokowanie (od blokującego do zależnego). Kropkowane: zapisane delegowanie (autor lub rodzic → zadanie). Kliknij węzeł, aby otworzyć szczegóły. Gesty i przyciski zmieniają powiększenie.",
    dependency: "Blokuje", delegation: "Delegowanie",
    sources: { cli: "CLI — logowanie runtime", subscription: "Subskrypcja — wybrane konto", api_key: "API — wybrane konto", responsible_user: "Domyślne konto osoby odpowiedzialnej", router: "Router kont Paperclip", unknown: "Nieustalone — ustawienia agenta" },
    priorities: { critical: "Krytyczny", high: "Wysoki", medium: "Średni", low: "Niski" },
  },
  agentConfig: { name: "Nazwa", title: "Stanowisko", identity: "Tożsamość i zarządzanie", avatar: "Awatar", avatarVariant: "Wariant {{number}}", description: "Opis i specjalizacja", role: "Rola", budget: "Budżet miesięczny (centy USD, 0 = bez limitu)", nextTask: "Zapisany model i reasoning dotyczą kolejnych uruchomień; aktywny run zachowuje swoją konfigurację.", instructions: "Własne instrukcje", concurrency: "Maksymalna liczba jednoczesnych zadań" },
  paused: "Rozmowa jest wstrzymana. Szkic zostaje zachowany.", resume: "Wznów rozmowę", inheritedPause: "Rozmowa jest wstrzymana przez zadanie nadrzędne. Wznów je w widoku zaawansowanym.", pauseError: "Nie udało się sprawdzić lub zmienić wstrzymania rozmowy.",
  coordinator: "Koordynator projektu", chooseCoordinator: "Wybierz koordynatora",
  coordinatorHint: "Wybierz koordynatora, aby wiadomości uruchamiały agenta. Bez wyboru wiadomości zostają we wspólnej rozmowie.",
  coordinatorReadOnly: "Właściciel lub administrator projektu może wybrać koordynatora.",
  coordinatorError: "Nie udało się zmienić koordynatora. Spróbuj ponownie.",
  coordinatorPaused: "Koordynator jest wstrzymany. Wznów agenta lub wybierz innego koordynatora.",
  coordinatorNotReady: "Koordynator nie jest gotowy do pracy. Sprawdź ustawienia agenta lub wybierz innego koordynatora.",
  coordinatorLoading: "Sprawdzanie gotowości koordynatora…",
  coordinatorWorking: "{{name}} pracuje nad tą rozmową…", coordinatorQueued: "{{name}} czeka na uruchomienie w tej rozmowie…",
  coordinatorRunError: "Nie udało się sprawdzić aktywności koordynatora w tej rozmowie.",
  messageToCoordinator: "Wiadomość do {{name}}…", companyAgentRunning: "{{name}} pracuje w firmie",
  conversation: "Rozmowa projektu", projects: "Projekty", agents: "Agenci firmy",
  settings: "Ustawienia", inbox: "Skrzynka", advanced: "Widok zaawansowany",
  details: "Szczegóły projektu", navigation: "Otwórz nawigację", close: "Zamknij",
  plan: "Plan i delegowanie", progress: "Postęp", assigned: "Przypisane", pending: "Oczekuje",
  taskScope: "Postęp obejmuje dostępne zadania projektu bez anulowanych.",
  completed: "{{done}} z {{total}} zadań ukończonych", active: "Aktywni agenci firmy",
  noActive: "Żaden agent teraz nie pracuje.", tasks: "Zadania projektu", noTasks: "Brak dostępnych zadań.",
  currentUser: "Zalogowany użytkownik", user: "Użytkownik", system: "System", unknownAgent: "Agent",
  presentUsers: "Obecni w rozmowie", presentSummary: "Obecni: {{names}}", presenceDisconnected: "Obecność niedostępna — brak połączenia.", userTyping: "{{name}} pisze…",
  loading: "Wczytywanie rozmowy…", loadError: "Nie udało się wczytać rozmowy. Sprawdź dostęp i spróbuj ponownie.",
  dataError: "Nie udało się odświeżyć części danych projektu.", retry: "Spróbuj ponownie",
  empty: "Tutaj zaczyna się wspólna rozmowa projektu. Napisz pierwszą wiadomość.",
  message: "Wiadomość do zespołu projektu…", send: "Wyślij", sending: "Wysyłanie…",
  sendError: "Nie udało się potwierdzić zapisu. Ponów wysłanie tej samej wiadomości.",
  sendHint: "Enter wysyła · Shift+Enter nowa linia · @ wzmianka",
  older: "Wczytaj wcześniejsze wiadomości", olderLoading: "Wczytywanie wcześniejszych wiadomości…",
  historyError: "Nie udało się odświeżyć historii.", theme: "Zmień motyw", noAgents: "Brak dostępnych agentów.",
  status: { backlog: "W kolejce", todo: "Do zrobienia", in_progress: "W toku", in_review: "Do przeglądu", blocked: "Zablokowane", done: "Gotowe", cancelled: "Anulowane", idle: "Gotowy", running: "Pracuje", paused: "Wstrzymany", error: "Błąd", terminated: "Zakończony", pending_approval: "Czeka na zatwierdzenie" },
}, true, true);

export function useCosgralTranslation() {
  return useTranslation("cosgral", { lng: "pl" });
}
