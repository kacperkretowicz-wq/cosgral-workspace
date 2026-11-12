import type { JSX } from "@solidjs/web";

/**
 * Story helper: shows a component on the dark app theme (the default) or on a light preview.
 * The app itself ships one dark theme; the light values here only exist so designers can check
 * contrast and layout of new surfaces in both modes.
 */
export type StoryTheme = "dark" | "light";

const LIGHT_TOKENS: Record<string, string> = {
  "color-scheme": "light",
  "--openbot-bg-canvas": "#f6f6f8",
  "--openbot-bg-sidebar": "#ececf0",
  "--openbot-bg-surface": "#ffffff",
  "--openbot-bg-surface-raised": "#ffffff",
  "--openbot-bg-control": "#f1f1f5",
  "--openbot-bg-control-hover": "#e4e4ea",
  "--openbot-bg-control-active": "#d9d9e2",
  "--openbot-main": "#f6f6f8",
  "--openbot-main-deep": "#f6f6f8",
  "--openbot-border": "rgba(20, 20, 30, 0.1)",
  "--openbot-border-strong": "rgba(20, 20, 30, 0.18)",
  "--openbot-hover": "rgba(20, 20, 30, 0.06)",
  "--openbot-text-primary": "#14141c",
  "--openbot-white": "#14141c",
  "--openbot-text-secondary": "rgba(20, 20, 28, 0.78)",
  "--openbot-text-muted": "rgba(20, 20, 28, 0.66)",
  "--openbot-text-readable": "rgba(20, 20, 28, 0.66)",
  "--openbot-text-dim": "rgba(20, 20, 28, 0.5)",
  "--openbot-accent": "#4d44d6",
  "--openbot-accent-text": "#4038c4",
  "--openbot-accent-soft": "rgba(77, 68, 214, 0.12)",
  "--openbot-warning": "#9a6b12",
  "--openbot-warning-soft": "rgba(154, 107, 18, 0.14)",
  "--openbot-danger": "#b3261e",
  "--openbot-danger-soft": "rgba(179, 38, 30, 0.1)",
  "--openbot-danger-strong": "#8f1c16",
  "--openbot-success": "#1d7a3f",
  "--openbot-shadow-popover-ambient": "rgba(20, 20, 30, 0.12)",
};

function themeStyle(theme: StoryTheme, extra: string): string {
  const tokens =
    theme === "light"
      ? Object.entries(LIGHT_TOKENS)
          .map(([name, value]) => `${name}: ${value}`)
          .join("; ")
      : "color-scheme: dark";
  return `${tokens}; background: var(--openbot-bg-canvas); color: var(--openbot-text-primary); ${extra}`;
}

export function ThemeFrame(props: { theme: StoryTheme; style?: string; children: JSX.Element }) {
  return (
    <div data-story-theme={props.theme} style={themeStyle(props.theme, props.style ?? "")}>
      {props.children}
    </div>
  );
}
