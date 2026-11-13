import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import { Button } from "./ui";

/** COSGRAL page rail: vertical page switcher beside the server rail. */
export type PageId =
  | "agents"
  | "schedule"
  | "tasks"
  | "workflows"
  | "usage"
  | "library"
  | "marketplace"
  | "remote-desktop"
  | "providers"
  | "phone";

export const PAGE_RAIL_ITEMS: ReadonlyArray<{ id: PageId; label: string }> = [
  { id: "agents", label: "Agents" },
  { id: "schedule", label: "Schedule" },
  { id: "tasks", label: "Tasks" },
  { id: "workflows", label: "Workflows" },
  { id: "usage", label: "Usage" },
  { id: "library", label: "Library" },
  { id: "marketplace", label: "Marketplace" },
  { id: "remote-desktop", label: "Remote desktop" },
  { id: "providers", label: "Providers" },
  { id: "phone", label: "Phone" },
];

interface PageRailProps {
  active: PageId;
  onSelect: (page: PageId) => void;
  /** Settings is an action (opens the settings dialog), not a page. */
  onOpenSettings: () => void;
}

function PageIcon(props: { page: PageId | "settings" }): JSX.Element {
  switch (props.page) {
    case "remote-desktop":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
          <path d="M7 16.5h6M10 13.5v3" />
        </svg>
      );
    case "providers":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <rect x="3" y="3.5" width="14" height="5" rx="1.5" />
          <rect x="3" y="11.5" width="14" height="5" rx="1.5" />
          <path d="M6 6h.01M6 14h.01" />
        </svg>
      );
    case "phone":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <rect x="6" y="2.5" width="8" height="15" rx="2" />
          <path d="M9 14.8h2" />
        </svg>
      );
    case "agents":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <circle cx="10" cy="7" r="3" />
          <path d="M4 16.2c.8-3 3.2-4.6 6-4.6s5.2 1.6 6 4.6" />
        </svg>
      );
    case "schedule":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <rect x="3" y="4.5" width="14" height="12" rx="2" />
          <path d="M3 8.5h14M7 3v3M13 3v3" />
        </svg>
      );
    case "tasks":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
          <path d="m7 10 2.2 2.2L13.2 8" />
        </svg>
      );
    case "workflows":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <circle cx="5" cy="5" r="1.8" />
          <circle cx="15" cy="10" r="1.8" />
          <circle cx="5" cy="15" r="1.8" />
          <path d="M6.6 5.9 13.4 9M6.6 14.1l6.8-3.1" />
        </svg>
      );
    case "usage":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M4.2 13.9a6.5 6.5 0 1 1 11.6 0" />
          <path d="m10 10 3.1-2.3" />
        </svg>
      );
    case "library":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v12H5.5A1.5 1.5 0 0 0 4 16.5v-12Z" />
          <path d="M4 16.5A1.5 1.5 0 0 0 5.5 18H16" />
        </svg>
      );
    case "marketplace":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="m3.5 7.5 1.3-3.7h10.4l1.3 3.7" />
          <path d="M3.5 7.5v1a2.1 2.1 0 0 0 4.2 0 2.1 2.1 0 0 0 4.2 0 2.1 2.1 0 0 0 4.2 0v-1M4.8 11v5.2h10.4V11" />
        </svg>
      );
    case "settings":
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M4 6h7M15 6h1M4 14h1M9 14h7" />
          <circle cx="13" cy="6" r="1.7" />
          <circle cx="7" cy="14" r="1.7" />
        </svg>
      );
  }
}

export function PageRail(props: PageRailProps) {
  return (
    <nav class="page-rail panel-edge" aria-label="Pages">
      <div class="page-rail-list">
        <For each={PAGE_RAIL_ITEMS}>
          {(item) => (
            <Button
              type="button"
              variant="ghost"
              class={["page-rail-button", { "page-rail-button-active": props.active === item.id }]}
              aria-label={item.label}
              aria-current={props.active === item.id ? "page" : undefined}
              title={item.label}
              onClick={() => props.onSelect(item.id)}
            >
              <span class="page-rail-mark" />
              <PageIcon page={item.id} />
            </Button>
          )}
        </For>
      </div>
      <div class="page-rail-tools">
        <Button
          type="button"
          variant="ghost"
          class="page-rail-button"
          aria-label="Settings"
          title="Settings"
          onClick={props.onOpenSettings}
        >
          <PageIcon page="settings" />
        </Button>
      </div>
    </nav>
  );
}
