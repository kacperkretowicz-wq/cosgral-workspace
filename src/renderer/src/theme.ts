import { type AppTheme, normalizeAppTheme } from "@openbot/contracts/ipc";
export const THEME_CACHE_KEY = "cosgral-theme";
export function startTheme(): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let theme: AppTheme = "system";
  let revision = 0;
  let disposed = false;
  const apply = () => {
    const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  };
  const accept = (value: unknown) => {
    theme = normalizeAppTheme(value);
    try {
      localStorage.setItem(THEME_CACHE_KEY, theme);
    } catch {
      /* Cache is optional. */
    }
    apply();
  };
  try {
    theme = normalizeAppTheme(localStorage.getItem(THEME_CACHE_KEY));
  } catch {
    /* Use OS. */
  }
  apply();
  media.addEventListener("change", apply);
  const off = window.openbot.agent.onEvent((event) => {
    if (event.type === "app-settings-changed") {
      revision++;
      accept(event.settings.theme);
    }
  });
  const initialRevision = revision;
  void window.openbot.appSettings
    ?.get()
    .then((settings) => {
      if (!disposed && revision === initialRevision) accept(settings.theme);
    })
    .catch(() => {
      /* Retain cached appearance while settings are unavailable. */
    });
  return () => {
    disposed = true;
    off();
    media.removeEventListener("change", apply);
  };
}
