import { parseConversationWindowHash } from "@openbot/contracts/ipc";
import { render } from "@solidjs/web";
import "blobatar/motion.css";
import { App } from "./App";
import { ConversationWindowApp } from "./conversation-window/ConversationWindowApp";
import { DockApp } from "./dock/DockApp";
import { IslandApp } from "./dock/IslandApp";
import "./styles.css";
import "./dock/dock.css";
import "./conversation-window/conversation-window.css";

import { startAppearance } from "./appearance";
import { startI18n } from "./i18n";
import { startTheme } from "./theme";

startTheme();
startAppearance();
startI18n();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found.");
}

// COSGRAL W3: the dock and the island windows load the same page with their own view.
const view = window.location.hash;
// COSGRAL W6-KK3: a separate conversation window loads the same page with `#conversation/<agent>/<thread>`.
const conversation = parseConversationWindowHash(view);
render(
  () =>
    conversation ? (
      <ConversationWindowApp target={conversation} />
    ) : view === "#dock" ? (
      <DockApp />
    ) : view === "#island" ? (
      <IslandApp />
    ) : (
      <App />
    ),
  root,
);
