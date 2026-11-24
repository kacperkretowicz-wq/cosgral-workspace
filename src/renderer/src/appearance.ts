import { appearanceDomTokens, normalizeAppAppearance } from "@openbot/contracts/ipc";
import { createSignal } from "solid-js";

export const APPEARANCE_CACHE_KEY = "cosgral-appearance";

const [unreadFirstSignal, setUnreadFirst] = createSignal(false);
/** BE-AC: "unread agents first" (appearance.unreadFirst), reactive for the sidebar. */
export const unreadFirst = unreadFirstSignal;

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
  setUnreadFirst(tokens.unreadFirst === "true");
  root.dataset.fontWeight = tokens.fontWeight;
  root.style.setProperty("--openbot-ui-scale", tokens.scaleFactor);
  // The default weights and the default (blue) accent are the program's own tokens (the Azure palette per theme);
  // only a choice the person made is painted over them.
  if (tokens.fontWeight === "normal") {
    for (const name of ["regular", "medium", "semibold", "bold"]) root.style.removeProperty(`--openbot-weight-${name}`);
  } else {
    root.style.setProperty("--openbot-weight-regular", tokens.weightRegular);
    root.style.setProperty("--openbot-weight-medium", tokens.weightMedium);
    root.style.setProperty("--openbot-weight-semibold", tokens.weightSemibold);
    root.style.setProperty("--openbot-weight-bold", tokens.weightSemibold);
  }
  if (tokens.chatAccent === "blue") {
    root.style.removeProperty("--openbot-accent");
    root.style.removeProperty("--openbot-accent-soft");
  } else {
    root.style.setProperty("--openbot-accent", tokens.accentHex);
    root.style.setProperty("--openbot-accent-soft", tokens.accentSoft);
  }
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

/** True when the person chose to show the steps of the agent open (`appearance.agentSteps` = "show"); the default is folded. */
export function agentStepsOpen(): boolean {
  return document.documentElement.dataset.agentSteps === "show";
}
