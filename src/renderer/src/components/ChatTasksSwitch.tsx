import { Show } from "solid-js";
import type { ChannelViewMode } from "../channel-tasks";
import { t } from "../i18n";
import { ViewTabList } from "./ui";
export function ChatTasksSwitch(props: {
  mode: ChannelViewMode;
  idPrefix: string;
  onChange: (mode: ChannelViewMode) => void;
  channelLabel?: string;
}) {
  return (
    <ViewTabList
      idPrefix={props.idPrefix}
      value={props.mode}
      onChange={(value) => props.onChange(value === "tasks" ? "tasks" : "chat")}
      tabs={[
        { value: "chat", label: t("Chat") },
        { value: "tasks", label: t("Tasks") },
      ]}
      label={t("Project view")}
      class="chat-tasks-switch"
      tabClass={(value) => ["chat-tasks-switch-tab", { "chat-tasks-switch-tab-active": props.mode === value }]}
    >
      <Show when={props.channelLabel}>{(label) => <span class="chat-tasks-switch-context">{label()}</span>}</Show>
    </ViewTabList>
  );
}
