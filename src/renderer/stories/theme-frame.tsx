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
  "--openbot-border": "rgba(20, 20, 30, 0.1)",
  "--openbot-border-strong": "rgba(20, 20, 30, 0.18)",
  "--openbot-hover": "rgba(20, 20, 30, 0.06)",
  "--openbot-text-primary": "#14141c",
  "--openbot-text-secondary": "rgba(20, 20, 28, 0.78)",
  "--openbot-text-muted": "rgba(20, 20, 28, 0.66)",
  "--openbot-text-readable": "rgba(20, 20, 28, 0.66)",
  "--openbot-text-dim": "rgba(20, 20, 28, 0.5)",
  "--openbot-accent": "#4d44d6",
  "--openbot-accent-text": "#4038c4",
  "--openbot-accent-soft": "rgba(77, 68, 214, 0.12)",
  "--openbot-warning": "#6e4a0d",
  "--openbot-warning-soft": "rgba(154, 107, 18, 0.14)",
  "--openbot-danger": "#aa241d",
  "--openbot-danger-soft": "rgba(179, 38, 30, 0.1)",
  "--openbot-danger-strong": "#8f1c16",
  "--openbot-success": "#1a6e39",
  "--openbot-unread-surface": "#1f5fbf",
  "--openbot-bg-overlay": "rgba(255, 255, 255, 0.96)",
  "--openbot-command-overlay": "rgba(246, 246, 248, 0.8)",
  "--openbot-bg-glass": "rgba(255, 255, 255, 0.8)",
  "--openbot-data-table-header-bg": "#ececf0",
  "--openbot-data-table-body-bg": "#ffffff",
  "--openbot-data-table-border": "#d9d9e2",
  "--openbot-data-table-header-text": "#4a4a58",
  "--openbot-data-table-text": "#14141c",
  "--openbot-shadow-popover-ambient": "rgba(20, 20, 30, 0.12)",
};

/**
 * Tokens that the app stylesheet defines as var(--other) on :root. A custom property is resolved where it is
 * declared, so overriding the base token on the frame does not change these (the sidebar row stayed on the dark
 * surface with dark text). The frame declares them again so they follow the light values.
 */
const LIGHT_ALIASES: Record<string, string> = {
  "--openbot-queue-surface": "var(--openbot-bg-surface)",
  "--openbot-queue-border": "var(--openbot-border-strong)",
  "--openbot-queue-text": "var(--openbot-text-primary)",
  "--openbot-queue-action": "var(--openbot-text-muted)",
  "--openbot-logo-dev": "var(--openbot-warning)",
  "--openbot-logo-preview": "var(--openbot-success)",
  "--openbot-unread-divider": "var(--openbot-unread-surface)",
  "--openbot-file-yellow": "var(--openbot-warning)",
  "--openbot-file-yellow-soft": "var(--openbot-warning-soft)",
  "--openbot-file-green": "var(--openbot-success)",
  "--openbot-file-red": "var(--openbot-danger)",
  "--openbot-file-red-soft": "var(--openbot-danger-soft)",
  "--openbot-file-purple": "var(--openbot-accent-text)",
  "--openbot-white": "var(--openbot-text-primary)",
  "--openbot-black": "var(--openbot-bg-canvas)",
  "--openbot-sidebar": "var(--openbot-bg-sidebar)",
  "--openbot-main": "var(--openbot-bg-canvas)",
  "--openbot-main-deep": "var(--openbot-bg-canvas)",
  "--openbot-active": "var(--openbot-bg-surface)",
  "--openbot-line": "var(--openbot-border)",
  "--openbot-line-strong": "var(--openbot-border-strong)",
  "--openbot-muted": "var(--openbot-text-muted)",
  "--openbot-dim": "var(--openbot-text-dim)",
  "--openbot-teal": "var(--openbot-success)",
  "--openbot-orange": "var(--openbot-warning)",
  "--openbot-purple": "var(--openbot-accent)",
  "--openbot-blue": "var(--openbot-accent)",
  "--openbot-violet": "var(--openbot-accent)",
  "--openbot-coral": "var(--openbot-danger)",
  "--background": "var(--openbot-bg-canvas)",
  "--surface": "var(--openbot-bg-surface)",
  "--border": "var(--openbot-border)",
  "--text-primary": "var(--openbot-text-primary)",
  "--text-secondary": "var(--openbot-text-secondary)",
  "--text-muted": "var(--openbot-text-muted)",
  "--accent": "var(--openbot-accent)",
  "--danger": "var(--openbot-danger)",
  "--openbot-vnc-background": "var(--openbot-bg-canvas)",
};

/**
 * Preview-only rules. The approve button fills with the success color and puts the dark on-light text on it. That
 * works on the dark theme (light green). On the light preview the success color is dark green (it is also the text
 * color of success badges), so the button label needs to be white. One token cannot do both.
 */
const LIGHT_PREVIEW_RULES = `[data-story-theme="light"] .approval-button-primary { color: #ffffff; }`;

function themeStyle(theme: StoryTheme, extra: string): string {
  const tokens =
    theme === "light"
      ? Object.entries({ ...LIGHT_TOKENS, ...LIGHT_ALIASES })
          .map(([name, value]) => `${name}: ${value}`)
          .join("; ")
      : "color-scheme: dark";
  return `${tokens}; background: var(--openbot-bg-canvas); color: var(--openbot-text-primary); ${extra}`;
}

export function ThemeFrame(props: { theme: StoryTheme; style?: string; children: JSX.Element }) {
  return (
    <div data-story-theme={props.theme} style={themeStyle(props.theme, props.style ?? "")}>
      {props.theme === "light" ? <style>{LIGHT_PREVIEW_RULES}</style> : null}
      {props.children}
    </div>
  );
}
