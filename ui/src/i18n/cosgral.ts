import { i18n, useTranslation } from "./index";

// A Polish surface inside the existing i18next system; it does not change
// the language of the advanced Paperclip screens.
i18n.addResourceBundle("pl", "cosgral", {
  paused: "Rozmowa jest wstrzymana. Szkic zostaje zachowany.", resume: "Wznów rozmowę", inheritedPause: "Rozmowa jest wstrzymana przez zadanie nadrzędne. Wznów je w widoku zaawansowanym.", pauseError: "Nie udało się sprawdzić lub zmienić wstrzymania rozmowy.",
  conversation: "Rozmowa projektu", projects: "Projekty", agents: "Agenci firmy",
  settings: "Ustawienia", inbox: "Skrzynka", advanced: "Widok zaawansowany",
  details: "Szczegóły projektu", navigation: "Otwórz nawigację", close: "Zamknij",
  plan: "Plan i delegowanie", progress: "Postęp", assigned: "Przypisane", pending: "Oczekuje",
  taskScope: "Postęp obejmuje dostępne zadania projektu bez anulowanych.",
  completed: "{{done}} z {{total}} zadań ukończonych", active: "Aktywni agenci firmy",
  noActive: "Żaden agent teraz nie pracuje.", tasks: "Zadania projektu", noTasks: "Brak dostępnych zadań.",
  currentUser: "Zalogowany użytkownik", user: "Użytkownik", unknownAgent: "Agent",
  noPresence: "Obecność innych osób i wskaźnik pisania nie są jeszcze dostępne.",
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
