import type { JSX } from "@solidjs/web";
import { For } from "solid-js";
import { Button } from "./button";

/** Controlled horizontal tabs with one keyboard tab stop and stable panel links. */
export function ViewTabList(props: {
  idPrefix: string;
  value: string;
  tabs: { value: string; label: string }[];
  onChange: (value: string) => void;
  label: string;
  class?: string;
  tabClass?: (value: string) => JSX.HTMLAttributes<HTMLElement>["class"];
  children?: JSX.Element;
}) {
  function navigate(event: KeyboardEvent) {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const buttons = Array.from(
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')
        : [],
    );
    const index = buttons.indexOf(target);
    if (index < 0 || !buttons.length) return;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : event.key === "ArrowRight"
            ? (index + 1) % buttons.length
            : event.key === "ArrowLeft"
              ? (index + buttons.length - 1) % buttons.length
              : -1;
    if (next < 0) return;
    event.preventDefault();
    const button = buttons[next];
    if (!button) return;
    button.focus();
    const value = button.dataset.value;
    if (value) props.onChange(value);
  }
  return (
    <div role="tablist" aria-label={props.label} class={props.class} onKeyDown={navigate}>
      <For each={props.tabs}>
        {(tab) => (
          <Button
            type="button"
            role="tab"
            id={`${props.idPrefix}-tab-${tab.value}`}
            aria-controls={`${props.idPrefix}-panel-${tab.value}`}
            aria-selected={props.value === tab.value ? "true" : "false"}
            tabindex={props.value === tab.value ? 0 : -1}
            data-value={tab.value}
            class={props.tabClass?.(tab.value)}
            onClick={() => props.onChange(tab.value)}
          >
            {tab.label}
          </Button>
        )}
      </For>
      {props.children}
    </div>
  );
}
export function ViewTabPanel(props: { idPrefix: string; value: string; class?: string; children: JSX.Element }) {
  return (
    <div
      role="tabpanel"
      id={`${props.idPrefix}-panel-${props.value}`}
      aria-labelledby={`${props.idPrefix}-tab-${props.value}`}
      class={props.class}
    >
      {props.children}
    </div>
  );
}
