import { attachmentReferenceIds } from "@openbot/contracts/attachment-references";
import type { AttachmentSummary, MessageReaction } from "@openbot/contracts/ipc";
import { MESSAGE_REACTIONS, MORE_MESSAGE_REACTIONS } from "@openbot/contracts/ipc";
import { createMemo, For, Show } from "solid-js";
import { avatarHeadColor } from "../../blobatar";
import type { BotMessage, BotProfile } from "../../data";
import { t, tn } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { type HistoryActionContext, MessageHistoryActions } from "../MessageHistoryActions";
import { Button, DropdownMenu } from "../ui";
import { AttachmentCards } from "./AttachmentCards";
import { ComparisonTable } from "./ComparisonTable";
import { CheckIcon, CopyIcon, MoreIcon, PlusIcon, ReactionIcon, ReplyIcon } from "./ConversationIcons";
import { DataTable, type MessageContentBlock, messageContentBlocks } from "./DataTable";
import { type EngineRun, engineRunSummary, parseEngineRun } from "./engine-run";
import { ImageGeneration } from "./ImageGeneration";
import { RichMessageText } from "./RichMessageText";
import { parseSelectionInstruction } from "./SelectionActions";

function ExchangeAgentAvatar(props: { bot: BotProfile | undefined }) {
  return <AgentAvatar bot={props.bot} class="exchange-agent-avatar" />;
}

function exchangeAgentStyle(bot: BotProfile | undefined): string | undefined {
  return bot ? `--exchange-agent-color: ${avatarHeadColor(bot.avatarSeed, bot.avatarHue)}` : undefined;
}

function exchangeAgentsStyle(bots: Array<BotProfile | undefined>): string | undefined {
  const colors = bots.flatMap((bot) => (bot ? [avatarHeadColor(bot.avatarSeed, bot.avatarHue)] : []));
  const mixedColor = colors.reduce<string | undefined>((mix, color, index) => {
    if (!mix) return color;
    const previousColorsWeight = Math.round((index / (index + 1)) * 10_000) / 100;
    return `color-mix(in oklab, ${mix} ${previousColorsWeight}%, ${color})`;
  }, undefined);
  return mixedColor ? `--exchange-agent-color: ${mixedColor}` : undefined;
}

export function ExchangeSystemRow(props: {
  message: BotMessage;
  bots: BotProfile[];
  onSelectAgent: (botId: string) => void;
}) {
  const exchange = () => props.message.exchange;
  const recipients = () => exchange()?.recipientBotIds ?? [];
  const sender = () => {
    const senderId = exchange()?.senderBotId;
    return props.bots.find((bot) => bot.id === senderId);
  };
  const singleRecipient = () => {
    const recipientId = recipients()[0];
    return recipientId ? props.bots.find((bot) => bot.id === recipientId) : undefined;
  };
  const agentCountLabel = () => tn(recipients().length, "{count} agent", "{count} agents");

  return (
    <div class="exchange-system-row">
      <Show
        when={exchange()?.direction === "outgoing"}
        fallback={
          <>
            <span class="exchange-system-label">{t("Message from")}</span>
            <Button
              type="button"
              class="exchange-agent-trigger exchange-agent-trigger-incoming"
              style={exchangeAgentStyle(sender())}
              aria-label={t("Open exchange with {name}", {
                name: sender()?.name ?? exchange()?.senderBotId ?? t("Agent"),
              })}
              onClick={() => {
                const senderId = exchange()?.senderBotId;
                if (senderId) props.onSelectAgent(senderId);
              }}
            >
              <ExchangeAgentAvatar bot={sender()} />
              <span>{sender()?.name ?? exchange()?.senderBotId ?? t("Agent")}</span>
            </Button>
          </>
        }
      >
        <span class="exchange-system-label">{t("Messaged")}</span>
        <Show
          when={recipients().length === 1}
          fallback={
            <div class="exchange-agent-picker">
              <DropdownMenu.Root placement="bottom" gutter={8} modal={false}>
                <DropdownMenu.Trigger
                  class="exchange-agent-trigger exchange-agent-trigger-outgoing"
                  style={exchangeAgentsStyle(
                    recipients().map((recipientId) => props.bots.find((bot) => bot.id === recipientId)),
                  )}
                  aria-label={tn(recipients().length, "{count} agent, show list", "{count} agents, show list")}
                >
                  <span class="exchange-avatar-stack" aria-hidden="true">
                    <For each={recipients().slice(0, 3)}>
                      {(recipientId) => <ExchangeAgentAvatar bot={props.bots.find((bot) => bot.id === recipientId)} />}
                    </For>
                  </span>
                  <span>{agentCountLabel()}</span>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content class="exchange-agent-menu">
                  <For each={recipients()}>
                    {(recipientId) => {
                      const recipient = () => props.bots.find((bot) => bot.id === recipientId);
                      return (
                        <DropdownMenu.Item
                          class="exchange-agent-menu-item"
                          onSelect={() => props.onSelectAgent(recipientId)}
                        >
                          <ExchangeAgentAvatar bot={recipient()} />
                          <span>{recipient()?.name ?? recipientId}</span>
                        </DropdownMenu.Item>
                      );
                    }}
                  </For>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>
          }
        >
          <Button
            type="button"
            class="exchange-agent-trigger exchange-agent-trigger-single"
            style={exchangeAgentStyle(singleRecipient())}
            aria-label={t("Open exchange with {name}", {
              name: singleRecipient()?.name ?? recipients()[0] ?? t("Agent"),
            })}
            title={singleRecipient()?.name ?? recipients()[0] ?? t("Agent")}
            onClick={() => {
              const recipientId = recipients()[0];
              if (recipientId) props.onSelectAgent(recipientId);
            }}
          >
            <ExchangeAgentAvatar bot={singleRecipient()} />
            <span>{singleRecipient()?.name ?? recipients()[0] ?? t("Agent")}</span>
          </Button>
        </Show>
      </Show>
      <time datetime={props.message.time}>{props.message.time}</time>
    </div>
  );
}

const ROUTINE_CAUSES = {
  schedule: "on schedule",
  manual: "started by hand",
  webhook: "from a webhook",
} as const;

/** One line about who started this turn: a routine or a workflow step (the message itself was written for the agent). */
function EngineRunHeader(props: { run: EngineRun }) {
  return (
    <p class="engine-run-header">
      {props.run.kind === "routine"
        ? t("Routine “{name}” · {cause}, {when}", {
            name: props.run.name,
            cause: t(ROUTINE_CAUSES[props.run.cause]),
            when: props.run.when,
          })
        : t("Workflow “{name}” · step “{step}”", { name: props.run.name, step: props.run.step })}
    </p>
  );
}

export function MessageBody(props: {
  message: BotMessage;
  referencedMessage?: BotMessage;
  bots: BotProfile[];
  onSelectAgent: (botId: string) => void;
  onOpenLink: (url: string) => void;
  onPreview: (attachment: AttachmentSummary) => void;
  onAttachmentAction: (attachment: AttachmentSummary, action: "open" | "reveal" | "download") => void;
  onDownload?: (attachment: AttachmentSummary) => void;
}) {
  const selectionInstruction = createMemo(() =>
    props.message.author === "you" && props.message.replyToMessageId
      ? parseSelectionInstruction(props.message.body)
      : null,
  );
  const standaloneAttachments = createMemo(() => {
    const referencedIds = attachmentReferenceIds(props.message.body);
    const generatedAttachmentId = props.message.imageGeneration ? props.message.attachments?.[0]?.id : undefined;
    return (props.message.attachments ?? []).filter(
      (attachment) => !referencedIds.has(attachment.id) && attachment.id !== generatedAttachmentId,
    );
  });
  const engineRun = createMemo(() => (props.message.author === "you" ? parseEngineRun(props.message.body) : null));
  const webhookPayload = createMemo(() => {
    const run = engineRun();
    return run?.kind === "routine" ? run.webhook : null;
  });
  const contentBlocks = createMemo<MessageContentBlock[]>(() =>
    props.message.author === "bot"
      ? messageContentBlocks(props.message.body, props.message.streaming === true)
      : [{ type: "text", text: engineRun()?.text ?? selectionInstruction()?.instruction ?? props.message.body }],
  );
  const lastTextBlockIndex = createMemo(() => {
    const blocks = contentBlocks();
    for (let index = blocks.length - 1; index >= 0; index -= 1) {
      if (blocks[index]?.type === "text") return index;
    }
    return -1;
  });

  return (
    <>
      <Show when={props.referencedMessage}>
        {(referenced) => (
          <div class="message-reply-context">
            <span>{referenced().author === "you" ? t("You") : t("Agent")}</span>
            <p>{engineRunSummary(referenced().body) ?? (referenced().body || t("Attachment"))}</p>
          </div>
        )}
      </Show>
      <Show when={engineRun()}>{(run) => <EngineRunHeader run={run()} />}</Show>
      <Show when={props.message.body}>
        <div class="message-content-blocks">
          <For each={contentBlocks()}>
            {(block, index) => {
              if (block.type === "comparison-table") return <ComparisonTable table={block} />;
              if (block.type === "table") return <DataTable table={block} />;
              return (
                <p
                  class="message-copy"
                  data-selection-message-id={
                    props.message.author === "bot" && props.message.streaming !== true ? props.message.id : undefined
                  }
                >
                  <RichMessageText
                    body={block.text}
                    bots={props.bots}
                    attachments={props.message.attachments}
                    citations={props.message.citations}
                    onSelectAgent={props.onSelectAgent}
                    onOpenLink={props.onOpenLink}
                    onOpenAttachment={(attachment) =>
                      attachment.previewKind === "none"
                        ? props.onAttachmentAction(attachment, "open")
                        : props.onPreview(attachment)
                    }
                    showCitationFooter={index() === lastTextBlockIndex()}
                  />
                </p>
              );
            }}
          </For>
          <Show when={selectionInstruction()}>
            {(selection) => <blockquote class="message-selection-quote">{selection().quote}</blockquote>}
          </Show>
          <Show when={webhookPayload()}>
            {(payload) => (
              <details class="engine-run-webhook">
                <summary>{t("Webhook data")}</summary>
                <pre>{payload()}</pre>
              </details>
            )}
          </Show>
        </div>
      </Show>
      <Show when={props.message.imageGeneration}>
        {(imageGeneration) => (
          <ImageGeneration
            status={imageGenerationStatus(props.message.streaming, props.message.status)}
            prompt={imageGeneration().prompt}
            resolution={imageGeneration().resolution}
            aspectRatio={imageGeneration().aspectRatio}
            attachment={props.message.attachments?.[0]}
            error={imageGeneration().error}
            onPreview={props.onPreview}
            onDownload={props.onDownload}
          />
        )}
      </Show>
      <Show when={props.message.status && !props.message.imageGeneration}>
        <div class="message-status">
          <span />
          {props.message.status}
        </div>
      </Show>
      <Show when={standaloneAttachments().length > 0}>
        <AttachmentCards
          attachments={standaloneAttachments()}
          onPreview={props.onPreview}
          onAction={props.onAttachmentAction}
        />
      </Show>
    </>
  );
}

function imageGenerationStatus(
  streaming: boolean | undefined,
  status: string | undefined,
): "generating" | "completed" | "failed" | "interrupted" {
  if (streaming || status === "streaming") return "generating";
  if (status === "Failed" || status === "failed") return "failed";
  if (status === "Stopped" || status === "interrupted") return "interrupted";
  return "completed";
}

export function MessageActions(props: {
  history?: HistoryActionContext;
  message: BotMessage;
  onBranch?: () => void;
  pickerOpen: boolean;
  moreOpen: boolean;
  expandedEmoji: boolean;
  copied: boolean;
  onTogglePicker: () => void;
  onToggleMore: () => void;
  onExpandEmoji: () => void;
  onReact: (emoji: MessageReaction | null) => void;
  onReply: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      class={["message-actions", { "message-actions-open": props.pickerOpen || props.moreOpen }]}
      role="toolbar"
      aria-label={props.message.author === "you" ? t("User message actions") : t("Agent message actions")}
    >
      <div class="message-action-popover-anchor">
        <DropdownMenu.Root
          onOpenChange={props.onTogglePicker}
          placement={props.message.author === "you" ? "top-end" : "top-start"}
          gutter={6}
          modal={false}
        >
          <DropdownMenu.Trigger class="message-action-button" aria-label={t("Add reaction")}>
            <ReactionIcon />
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            class="reaction-picker"
            aria-label={t("Choose a reaction")}
            aria-hidden={props.pickerOpen ? undefined : "true"}
          >
            <div class="reaction-picker-row">
              <DropdownMenu.RadioGroup value={props.message.reaction ?? ""}>
                <For each={MESSAGE_REACTIONS}>
                  {(emoji) => (
                    <DropdownMenu.RadioItem
                      value={emoji}
                      aria-label={t("React with {emoji}", { emoji })}
                      onSelect={() => props.onReact(props.message.reaction === emoji ? null : emoji)}
                    >
                      {emoji}
                    </DropdownMenu.RadioItem>
                  )}
                </For>
              </DropdownMenu.RadioGroup>
              <DropdownMenu.Item
                class="reaction-more-button"
                aria-label={t("More emoji")}
                closeOnSelect={false}
                onSelect={props.onExpandEmoji}
              >
                <PlusIcon />
              </DropdownMenu.Item>
            </div>
            <Show when={props.expandedEmoji}>
              <div class="reaction-picker-row reaction-picker-more">
                <DropdownMenu.RadioGroup value={props.message.reaction ?? ""}>
                  <For each={MORE_MESSAGE_REACTIONS}>
                    {(emoji) => (
                      <DropdownMenu.RadioItem
                        value={emoji}
                        aria-label={t("React with {emoji}", { emoji })}
                        onSelect={() => props.onReact(props.message.reaction === emoji ? null : emoji)}
                      >
                        {emoji}
                      </DropdownMenu.RadioItem>
                    )}
                  </For>
                </DropdownMenu.RadioGroup>
              </div>
            </Show>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>
      <Button
        type="button"
        class="message-action-button"
        aria-label={props.message.author === "you" ? t("Reply to User message") : t("Reply to Agent message")}
        onClick={props.onReply}
      >
        <ReplyIcon />
      </Button>
      <div class="message-action-popover-anchor">
        <Show
          when={props.history}
          fallback={
            <DropdownMenu.Root onOpenChange={props.onToggleMore} placement="top-end" gutter={6} modal={false}>
              <DropdownMenu.Trigger class="message-action-button" aria-label={t("More message actions")}>
                <MoreIcon />
              </DropdownMenu.Trigger>
              <DropdownMenu.Content class="message-more-menu" aria-hidden={props.moreOpen ? undefined : "true"}>
                <Show when={props.onBranch}>
                  <DropdownMenu.Item onSelect={() => props.onBranch?.()}>{t("Branch from here")}</DropdownMenu.Item>
                </Show>
                <DropdownMenu.Item onSelect={props.onCopy}>
                  {props.copied ? <CheckIcon /> : <CopyIcon />}
                  <span>{props.copied ? t("Copied") : t("Copy")}</span>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          }
        >
          {(history) => (
            <MessageHistoryActions
              {...history()}
              message={props.message}
              onCopy={props.onCopy}
              onBranch={props.onBranch}
              copied={props.copied}
              onOpenChange={props.onToggleMore}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
