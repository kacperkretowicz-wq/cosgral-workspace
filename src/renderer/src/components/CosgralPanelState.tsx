import { type ParentProps, Show } from "solid-js";
import { Button } from "./ui";

export type CosgralPanelStateKind = "empty" | "error" | "unavailable";

/** Shared empty / error / unavailable copy for Library, Usage, Schedule (and friends). */
export function CosgralPanelState(
  props: ParentProps<{
    kind: CosgralPanelStateKind;
    title: string;
    detail?: string;
    actionLabel?: string;
    onAction?: () => void;
  }>,
) {
  const role = () => (props.kind === "error" ? "alert" : "status");
  return (
    <div class="cosgral-panel-state cosgral-empty-enter" data-kind={props.kind} role={role()}>
      <strong class="cosgral-panel-state-title">{props.title}</strong>
      <Show when={props.detail}>{(detail) => <p class="cosgral-panel-state-detail">{detail()}</p>}</Show>
      {props.children}
      <Show when={props.actionLabel && props.onAction}>
        <Button type="button" variant="ghost" onClick={() => props.onAction?.()}>
          {props.actionLabel}
        </Button>
      </Show>
    </div>
  );
}
