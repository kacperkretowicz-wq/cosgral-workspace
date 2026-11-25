import type { WorkspaceChannel } from "@openbot/contracts/ipc";
import { Show } from "solid-js";
import { t } from "../i18n";
import { BuiltinSkillsPanel } from "./BuiltinSkillsPanel";
import { IntegrationsPanel } from "./IntegrationsPanel";
import { LibraryFilesView } from "./LibraryFilesView";
import { LibraryPanel } from "./LibraryPanel";
import { McpSettings } from "./McpSettings";
import { MessengersPanel } from "./MessengersPanel";
import { SkillsSettings } from "./SkillsSettings";
import { TablesPanel } from "./TablesPanel";
import { FolderOpen, KeyRound, Lock, MessageCircle, Pin, Plug, Server, Sparkles, Table2 } from "./ui/icons";
import { VaultConnectorsPanel } from "./VaultConnectorsPanel";
import { VaultPanel } from "./VaultPanel";
import { WorkPage, type WorkPageSection, WorkPageSections } from "./WorkPage";

export type LibrarySectionId =
  | "files"
  | "builtin-skills"
  | "skills"
  | "tables"
  | "vault"
  | "password-managers"
  | "messengers"
  | "integrations"
  | "mcp";

/**
 * The Library: everything agents work with, one kind per section instead of eight cards stacked on one long page.
 * Files come first (what people open the Library for); access and connections follow.
 */
export function LibraryPage(props: {
  bots?: Array<{ id: string; name: string; hidden?: boolean }>;
  channels?: WorkspaceChannel[];
}) {
  const sections = (): WorkPageSection<LibrarySectionId>[] => [
    {
      id: "files",
      label: t("Files"),
      description: t("Files your agents made or received. Open, download or clean up."),
      icon: FolderOpen,
      render: () => (
        <Show when={window.openbot?.libraryView} fallback={<LibraryPanel />}>
          <LibraryFilesView />
        </Show>
      ),
    },
    {
      id: "builtin-skills",
      label: t("Built-in skills"),
      description: t("Skills that come with the app. They are always here; choose which agents use them."),
      icon: Pin,
      render: () => <BuiltinSkillsPanel bots={props.bots} projects={props.channels?.map(projectOf)} />,
    },
    {
      id: "skills",
      label: t("Skills"),
      description: t("Reusable instructions agents can install. Each change keeps a version."),
      icon: Sparkles,
      render: () => <SkillsSettings />,
    },
    {
      id: "tables",
      label: t("Tables"),
      description: t("Tables agents and people fill in together."),
      icon: Table2,
      render: () => <TablesPanel />,
    },
    {
      id: "vault",
      label: t("Vault"),
      description: t("Logins and secrets agents may use without seeing them."),
      icon: Lock,
      render: () => <VaultPanel />,
    },
    {
      id: "password-managers",
      label: t("Password managers"),
      description: t("Let agents use logins from 1Password or Bitwarden; you stay in control."),
      icon: KeyRound,
      render: () => <VaultConnectorsPanel />,
    },
    {
      id: "messengers",
      label: t("Messengers"),
      description: t("Talk to your agents from Telegram, Slack, Discord and other messengers."),
      icon: MessageCircle,
      render: () => <MessengersPanel />,
    },
    {
      id: "integrations",
      label: t("Integrations"),
      description: t("Accounts agents can work in, such as mail and calendars."),
      icon: Plug,
      render: () => <IntegrationsPanel />,
    },
    {
      id: "mcp",
      label: t("MCP servers"),
      description: t("Tool servers every agent can call."),
      icon: Server,
      render: () => <McpSettings />,
    },
  ];
  return (
    <WorkPage
      page="library"
      title={t("Library")}
      description={t("Files, skills, tables and access your agents work with.")}
      class="library-page"
    >
      <WorkPageSections page="library" label={t("Library sections")} sections={sections()} />
    </WorkPage>
  );
}

function projectOf(channel: WorkspaceChannel) {
  return {
    id: channel.id,
    name: channel.name,
    title: channel.title,
    memberBotIds: channel.memberBotIds,
    archived: channel.archived,
  };
}
