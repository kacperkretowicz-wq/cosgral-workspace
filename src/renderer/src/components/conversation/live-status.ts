// COSGRAL: the one short sentence that tells what a working agent does right now ("Czyta plik plan.md…").
import type { AgentLiveStatusKind } from "@openbot/contracts/ipc";
import { t } from "../../i18n";

export interface LiveStatus {
  turnId: string;
  kind: AgentLiveStatusKind;
  detail?: string;
}

export function liveStatusText(kind: AgentLiveStatusKind, detail?: string): string {
  switch (kind) {
    case "thinking":
      return t("Thinking it over…");
    case "writing":
      return t("Writing the answer…");
    case "reading":
      return detail ? t("Reading {name}…", { name: detail }) : t("Reading a file…");
    case "searching-files":
      return t("Searching the files…");
    case "listing-files":
      return t("Looking through the folder…");
    case "running":
      return detail ? t("Running {name}…", { name: detail }) : t("Running a command…");
    case "changing-files":
      return detail ? t("Changing {name}…", { name: detail }) : t("Changing a file…");
    case "searching-web":
      return t("Searching the web…");
    case "using-tool":
      return detail ? t("Using the tool {name}…", { name: detail }) : t("Using a tool…");
    case "tidying":
      return t("Tidying up the conversation…");
  }
}
