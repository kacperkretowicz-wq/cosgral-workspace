import { appearanceDomTokens, normalizeAppAppearance } from "@openbot/contracts/ipc";

export const APPEARANCE_CACHE_KEY = "cosgral-appearance";

/** Paint look tokens on `<html>` so CSS can follow scale, font and accent (parity row 2). */
export function applyAppearanceDom(value: unknown): void {
  const tokens = appearanceDomTokens(value);
  const root = document.documentElement;
  root.dataset.uiScale = tokens.uiScale;
  root.dataset.font = tokens.font;
  root.dataset.chatAccent = tokens.chatAccent;
  root.dataset.sendShortcut = tokens.sendShortcut;
  root.dataset.agentSteps = tokens.agentSteps;
  root.dataset.unreadFirst = tokens.unreadFirst;
  root.style.setProperty("--openbot-ui-scale", tokens.scaleFactor);
  root.style.setProperty("--openbot-accent", tokens.accentHex);
  root.style.setProperty("--openbot-accent-soft", tokens.accentSoft);
  if (tokens.font === "system") {
    root.style.setProperty("--openbot-font-sans", 'system-ui, "Segoe UI", sans-serif');
  } else if (tokens.font === "mono") {
    root.style.setProperty("--openbot-font-sans", "ui-monospace, Consolas, monospace");
  } else {
    root.style.removeProperty("--openbot-font-sans");
  }
}

export function startAppearance(): () => void {
  let revision = 0;
  let disposed = false;
  const accept = (value: unknown) => {
    const appearance = normalizeAppAppearance(value);
    try {
      localStorage.setItem(APPEARANCE_CACHE_KEY, JSON.stringify(appearance));
    } catch {
      /* Cache is optional. */
    }
    applyAppearanceDom(appearance);
  };
  try {
    const raw = localStorage.getItem(APPEARANCE_CACHE_KEY);
    if (raw) accept(JSON.parse(raw));
    else applyAppearanceDom(undefined);
  } catch {
    applyAppearanceDom(undefined);
  }
  const off = window.openbot.agent.onEvent((event) => {
    if (event.type === "app-settings-changed") {
      revision++;
      accept(event.settings.appearance);
    }
  });
  const initialRevision = revision;
  void window.openbot.appSettings
    ?.get()
    .then((settings) => {
      if (!disposed && revision === initialRevision) accept(settings.appearance);
    })
    .catch(() => {
      /* Keep the cached look while settings are unavailable. */
    });
  return () => {
    disposed = true;
    off();
  };
}
