import { For } from "solid-js";
import { t } from "../i18n";
import { KEYBOARD_SHORTCUTS, modKeyLabel } from "../keyboard-shortcuts";
import { Button, Dialog, Kbd } from "./ui";

/** The list of keyboard shortcuts (Ctrl+/ or Cmd+/). */
export function ShortcutsDialog(props: { onClose: () => void }) {
  const mod = modKeyLabel();
  return (
    <Dialog.Root open onOpenChange={(open) => !open && props.onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay class="remote-dialog-backdrop">
          <Dialog.Content as="section" class="remote-dialog shortcuts-dialog">
            <header>
              <Dialog.Title as="h2">{t("Keyboard shortcuts")}</Dialog.Title>
              <Button type="button" aria-label={t("Close")} onClick={props.onClose}>
                ×
              </Button>
            </header>
            <Dialog.Description>{t("Keys that work anywhere in the window.")}</Dialog.Description>
            <dl class="shortcuts-list">
              <For each={KEYBOARD_SHORTCUTS}>
                {(shortcut) => (
                  <div class="shortcuts-row">
                    <dt>
                      <For each={shortcut.keys}>{(key) => <Kbd>{key === "Mod" ? mod : key}</Kbd>}</For>
                    </dt>
                    <dd>{t(shortcut.action)}</dd>
                  </div>
                )}
              </For>
            </dl>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
