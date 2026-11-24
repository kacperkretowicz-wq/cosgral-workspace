import type { AgentReasoningEffort } from "@openbot/contracts/ipc";
import { For } from "solid-js";
import { NativeSelect } from "../ui";
import { reasoningLabel } from "./model";

/** The reasoning-effort choice of an agent, shared by the conversation header and the agent settings panel. */
export function ReasoningSelect(props: {
  value: AgentReasoningEffort;
  options: readonly AgentReasoningEffort[];
  /** Already translated. */
  ariaLabel: string;
  class?: string;
  id?: string;
  disabled?: boolean;
  onChange: (effort: AgentReasoningEffort) => void;
}) {
  return (
    <NativeSelect
      id={props.id}
      class={props.class}
      value={props.value}
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      onChange={(event) => {
        const effort = props.options.find((option) => option === event.currentTarget.value);
        if (effort) props.onChange(effort);
      }}
    >
      <For each={props.options}>{(effort) => <option value={effort}>{reasoningLabel(effort)}</option>}</For>
    </NativeSelect>
  );
}
