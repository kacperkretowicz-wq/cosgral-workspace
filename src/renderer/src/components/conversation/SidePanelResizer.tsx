import { t } from "../../i18n";
import { PanelResizer } from "../PanelResizer";
import { CONVERSATION_PANEL_MIN } from "./model";

/**
 * The drag handle on the left edge of a right-hand side panel of a conversation. The panel may be as wide as the
 * conversation allows, but never takes all of it: `CONVERSATION_PANEL_MIN` stays for the chat.
 */
export function SidePanelResizer(props: {
  /** The id of the panel this handle resizes. */
  controls: string;
  width: number;
  sizes: { default: number; min: number; max: number };
  /** Width of the conversation the panel sits in. */
  availableWidth: () => number;
  onResize: (width: number) => void;
  onResizeEnd: (width: number) => void;
}) {
  return (
    <PanelResizer
      class="right-panel-resizer"
      label={t("Resize right panel")}
      controls={props.controls}
      direction="right"
      value={props.width}
      defaultValue={props.sizes.default}
      min={props.sizes.min}
      max={() => Math.min(props.sizes.max, Math.max(props.sizes.min, props.availableWidth() - CONVERSATION_PANEL_MIN))}
      onResize={props.onResize}
      onResizeEnd={props.onResizeEnd}
    />
  );
}
