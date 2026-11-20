import type { BotAvatarHue } from "@openbot/contracts/ipc";
import { For, Show } from "solid-js";
import { AVATAR_HUE_OPTIONS, avatarHueSwatch } from "../../blobatar";
import { t } from "../../i18n";
import { AgentAvatar } from "../AgentAvatar";
import { Button, Input, Popover } from "../ui";

/**
 * The popover on the agent settings panel where the person changes an agent's picture: an uploaded image, one of the
 * generated faces, or the colour. State and saving stay with the conversation; this only draws and reports choices.
 */
export function AvatarEditor(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the wrapper, so the conversation can tell a click inside the editor from one outside it. */
  rootRef: (element: HTMLDivElement) => void;
  /** Receives the hidden file input, so the conversation can clear it after an upload. */
  fileInputRef: (element: HTMLInputElement) => void;
  botId: string | undefined;
  seed: string;
  hue: BotAvatarHue | null;
  url: string | null | undefined;
  uploadBusy: boolean;
  candidates: string[];
  onUploadFile: (file: File | undefined) => void;
  onPickImage: () => void;
  onRemoveImage: () => void;
  onResetToId: () => void;
  onNewSet: () => void;
  onSelectFace: (seed: string) => void;
  onSelectHue: (hue: BotAvatarHue | null) => void;
}) {
  const faceSelected = (seed: string) => !props.url && props.seed === seed;
  return (
    <div ref={props.rootRef} class="agent-settings-avatar-picker">
      <Popover.Root open={props.open} placement="bottom" gutter={11} onOpenChange={props.onOpenChange}>
        <Popover.Trigger class="agent-settings-avatar" aria-label={t("Edit agent avatar")}>
          <AgentAvatar seed={props.seed} hue={props.hue} url={props.url} motion="always" />
        </Popover.Trigger>
        <Popover.Content class="avatar-editor" aria-hidden={props.open ? undefined : "true"}>
          <Popover.Title class="sr-only">{t("Avatar editor")}</Popover.Title>
          <Input
            ref={props.fileInputRef}
            class="sr-only"
            type="file"
            aria-label={t("Attach files")}
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => props.onUploadFile(event.currentTarget.files?.[0])}
          />
          <div class="avatar-editor-heading">
            <span>{t("Image")}</span>
            <div class="avatar-editor-actions">
              <Show when={props.url}>
                <Button type="button" disabled={props.uploadBusy} onClick={props.onRemoveImage}>
                  {t("Remove")}
                </Button>
              </Show>
            </div>
          </div>
          <Button
            type="button"
            class={["avatar-image-upload", { "avatar-image-upload-active": Boolean(props.url) }]}
            disabled={props.uploadBusy}
            onClick={props.onPickImage}
          >
            <span class="avatar-image-upload-preview">
              <Show
                when={props.url}
                fallback={
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                }
              >
                <AgentAvatar seed={props.seed} hue={props.hue} url={props.url} />
              </Show>
            </span>
            <span>
              <strong>{props.url ? t("Replace image") : t("Upload image")}</strong>
              <small>{t("PNG, JPEG or WebP · square crop")}</small>
            </span>
          </Button>
          <div class="avatar-editor-divider" />
          <div class="avatar-editor-heading">
            <span>{t("Generated face")}</span>
            <div class="avatar-editor-actions">
              <Show when={props.botId && props.seed !== props.botId}>
                <Button type="button" onClick={props.onResetToId}>
                  {t("Reset to ID")}
                </Button>
              </Show>
              <Button type="button" onClick={props.onNewSet}>
                {t("New set")}
              </Button>
            </div>
          </div>
          <fieldset class="avatar-face-grid" aria-label={t("Generated avatar faces")}>
            <For each={props.candidates}>
              {(seed, index) => (
                <Button
                  type="button"
                  class={["avatar-face-choice", { "avatar-choice-selected": faceSelected(seed) }]}
                  aria-label={faceSelected(seed) ? t("Selected avatar") : t("Avatar option {n}", { n: index() + 1 })}
                  aria-pressed={faceSelected(seed) ? "true" : "false"}
                  onClick={() => props.onSelectFace(seed)}
                >
                  <AgentAvatar seed={seed} hue={props.hue} />
                </Button>
              )}
            </For>
          </fieldset>
          <div class="avatar-editor-divider" />
          <div class="avatar-editor-heading">
            <span>{t("Color")}</span>
          </div>
          <fieldset class="avatar-color-grid" aria-label={t("Avatar color")}>
            <Button
              type="button"
              class={["avatar-color-choice", { "avatar-choice-selected": props.hue === null }]}
              aria-label={t("Automatic avatar color")}
              aria-pressed={props.hue === null ? "true" : "false"}
              onClick={() => props.onSelectHue(null)}
            >
              <span class="avatar-color-swatch avatar-color-swatch-auto">A</span>
            </Button>
            <For each={AVATAR_HUE_OPTIONS}>
              {(option) => (
                <Button
                  type="button"
                  class={["avatar-color-choice", { "avatar-choice-selected": props.hue === option.hue }]}
                  aria-label={t("{label} avatar color", { label: option.label })}
                  aria-pressed={props.hue === option.hue ? "true" : "false"}
                  onClick={() => props.onSelectHue(option.hue)}
                >
                  <span class="avatar-color-swatch" style={{ background: avatarHueSwatch(option.hue) }} />
                </Button>
              )}
            </For>
          </fieldset>
        </Popover.Content>
      </Popover.Root>
    </div>
  );
}
