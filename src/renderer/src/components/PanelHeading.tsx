import type { JSX } from "@solidjs/web";
import { Heading } from "./ui";

export type PanelTint = "blue" | "red" | "green" | "orange" | "pink" | "cyan" | "lime";

/**
 * The title of a card on a page: a small mesh-gradient tile with an icon, then the title as a heading. One look for
 * the cards of Phone, Remote desktop and the like (they used to open with a bare `h2`).
 */
export function PanelHeading(props: {
  icon: (props: { "aria-hidden": "true"; size: number; "stroke-width": number }) => JSX.Element;
  tint?: PanelTint;
  id?: string;
  /** The heading level of the title; a card inside another card uses `h3`. */
  level?: "h2" | "h3";
  children: JSX.Element;
}) {
  return (
    <div class="panel-heading">
      <span class="panel-heading-icon" data-tint={props.tint ?? "blue"} aria-hidden="true">
        {props.icon({ "aria-hidden": "true", size: 18, "stroke-width": 1.75 })}
      </span>
      <Heading as={props.level ?? "h2"} size={props.level === "h3" ? "sm" : "md"} id={props.id}>
        {props.children}
      </Heading>
    </div>
  );
}
