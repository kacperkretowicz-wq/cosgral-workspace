import { render } from "@solidjs/web";
import "blobatar/motion.css";
import { App } from "./App";
import { DockApp } from "./dock/DockApp";
import { IslandApp } from "./dock/IslandApp";
import "./styles.css";
import "./dock/dock.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Renderer root element was not found.");
}

// COSGRAL W3: the dock and the island windows load the same page with their own view.
const view = window.location.hash;
render(() => (view === "#dock" ? <DockApp /> : view === "#island" ? <IslandApp /> : <App />), root);
