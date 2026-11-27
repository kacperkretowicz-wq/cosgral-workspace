import type { JSX } from "@solidjs/web";
export type StoryTheme = "dark";
export function ThemeFrame(props: { theme: StoryTheme; style?: string; children: JSX.Element }) {
  return (
    <div
      data-story-theme={props.theme}
      style={`color-scheme: ${props.theme}; background: var(--openbot-bg-canvas); color: var(--openbot-text-primary); ${props.style ?? ""}`}
    >
      {props.children}
    </div>
  );
}
