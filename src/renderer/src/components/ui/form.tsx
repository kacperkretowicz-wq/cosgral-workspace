import type { ComponentProps, JSX } from "@solidjs/web";
import { createContext, createUniqueId, omit, Show, useContext } from "solid-js";
import { cx } from "./utils";

export type ControlSize = "sm" | "md" | "lg";

interface ControlOptions {
  /** Preserve feature styles, including native checkbox/file control appearance. */
  unstyled?: boolean;
  size?: ControlSize;
  invalid?: boolean;
}

interface FieldContextValue {
  controlId: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export type InputProps = ComponentProps<"input"> & ControlOptions;

export function Input(props: InputProps): JSX.Element {
  const local = props;
  const field = useContext(FieldContext);
  const others = omit(
    props,
    "class",
    "unstyled",
    "size",
    "invalid",
    "id",
    "aria-describedby",
    "aria-invalid",
    "required",
    "value",
    "onInput",
    "onChange",
  );
  const describedBy = () => [local["aria-describedby"], field?.describedBy].filter(Boolean).join(" ") || undefined;
  if (!("value" in props)) {
    return (
      <input
        {...others}
        class={cx(!local.unstyled && "ui-input", local.class)}
        data-size={local.size ?? "md"}
        id={local.id ?? field?.controlId}
        aria-describedby={describedBy()}
        aria-invalid={local["aria-invalid"] ?? (local.invalid || field?.invalid ? "true" : undefined)}
        required={local.required ?? field?.required}
        onInput={local.onInput}
        onChange={local.onChange}
      />
    );
  }
  return (
    <input
      {...others}
      class={cx(!local.unstyled && "ui-input", local.class)}
      data-size={local.size ?? "md"}
      id={local.id ?? field?.controlId}
      aria-describedby={describedBy()}
      aria-invalid={local["aria-invalid"] ?? (local.invalid || field?.invalid ? "true" : undefined)}
      required={local.required ?? field?.required}
      value={local.value}
      onInput={local.onInput}
      onChange={local.onChange}
    />
  );
}

export type TextareaProps = ComponentProps<"textarea"> & ControlOptions;

export function Textarea(props: TextareaProps): JSX.Element {
  const local = props;
  const field = useContext(FieldContext);
  const others = omit(
    props,
    "class",
    "unstyled",
    "size",
    "invalid",
    "id",
    "aria-describedby",
    "aria-invalid",
    "required",
    "value",
    "onInput",
    "onChange",
  );
  const describedBy = () => [local["aria-describedby"], field?.describedBy].filter(Boolean).join(" ") || undefined;
  if (!("value" in props)) {
    return (
      <textarea
        {...others}
        class={cx(!local.unstyled && "ui-textarea", local.class)}
        data-size={local.size ?? "md"}
        id={local.id ?? field?.controlId}
        aria-describedby={describedBy()}
        aria-invalid={local["aria-invalid"] ?? (local.invalid || field?.invalid ? "true" : undefined)}
        required={local.required ?? field?.required}
        onInput={local.onInput}
        onChange={local.onChange}
      />
    );
  }
  return (
    <textarea
      {...others}
      class={cx(!local.unstyled && "ui-textarea", local.class)}
      data-size={local.size ?? "md"}
      id={local.id ?? field?.controlId}
      aria-describedby={describedBy()}
      aria-invalid={local["aria-invalid"] ?? (local.invalid || field?.invalid ? "true" : undefined)}
      required={local.required ?? field?.required}
      value={local.value}
      onInput={local.onInput}
      onChange={local.onChange}
    />
  );
}

export type NativeSelectProps = ComponentProps<"select"> & ControlOptions;

export function NativeSelect(props: NativeSelectProps): JSX.Element {
  const local = props;
  const field = useContext(FieldContext);
  const others = omit(
    props,
    "class",
    "unstyled",
    "size",
    "invalid",
    "id",
    "aria-describedby",
    "aria-invalid",
    "required",
    "value",
    "onInput",
    "onChange",
  );
  const describedBy = () => [local["aria-describedby"], field?.describedBy].filter(Boolean).join(" ") || undefined;
  if (!("value" in props)) {
    return (
      <select
        {...others}
        class={cx(!local.unstyled && "ui-native-select", local.class)}
        data-size={local.size ?? "md"}
        id={local.id ?? field?.controlId}
        aria-describedby={describedBy()}
        aria-invalid={local["aria-invalid"] ?? (local.invalid || field?.invalid ? "true" : undefined)}
        required={local.required ?? field?.required}
        onInput={local.onInput}
        onChange={local.onChange}
      />
    );
  }
  return (
    <select
      {...others}
      class={cx(!local.unstyled && "ui-native-select", local.class)}
      data-size={local.size ?? "md"}
      id={local.id ?? field?.controlId}
      aria-describedby={describedBy()}
      aria-invalid={local["aria-invalid"] ?? (local.invalid || field?.invalid ? "true" : undefined)}
      required={local.required ?? field?.required}
      value={local.value}
      onInput={local.onInput}
      onChange={local.onChange}
    />
  );
}

export function Label(props: ComponentProps<"label">): JSX.Element {
  const local = props;
  const field = useContext(FieldContext);
  const others = omit(props, "class", "children", "for");
  return (
    <label class={cx("ui-label", local.class)} for={local.for ?? field?.controlId} {...others}>
      {local.children}
    </label>
  );
}

export interface FieldProps extends JSX.HTMLAttributes<HTMLDivElement> {
  label: JSX.Element;
  description?: JSX.Element;
  error?: JSX.Element;
  required?: boolean;
  htmlFor?: string;
}

export function Field(props: FieldProps): JSX.Element {
  const generatedId = createUniqueId();
  const local = props;
  const others = omit(props, "class", "children", "label", "description", "error", "required", "htmlFor");
  const descriptionId = `${generatedId}-description`;
  const errorId = `${generatedId}-error`;
  // Getters, not copies: the label, the control and the error read these inside their own tracking scopes, so an
  // error that appears later reaches `aria-describedby` and `aria-invalid` (a copy made here never updated).
  const fieldValue: FieldContextValue = {
    get controlId() {
      return local.htmlFor ?? `${generatedId}-control`;
    },
    get describedBy() {
      return local.error ? errorId : local.description ? descriptionId : undefined;
    },
    get invalid() {
      return Boolean(local.error);
    },
    get required() {
      return Boolean(local.required);
    },
  };
  return (
    <FieldContext value={fieldValue}>
      <div class={cx("ui-field", local.class)} data-invalid={local.error ? "" : undefined} {...others}>
        <Label>
          {local.label}
          <Show when={local.required}>
            <span class="ui-field-required" aria-hidden="true">
              *
            </span>
          </Show>
        </Label>
        {local.children}
        <Show when={local.description}>
          <div id={descriptionId} class="ui-field-description">
            {local.description}
          </div>
        </Show>
        <Show when={local.error}>
          <div id={errorId} class="ui-field-error" role="alert">
            {local.error}
          </div>
        </Show>
      </div>
    </FieldContext>
  );
}
