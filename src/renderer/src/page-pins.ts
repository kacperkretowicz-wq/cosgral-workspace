import type { AppPageId } from "@openbot/contracts/ipc";
import { createSignal, onSettled } from "solid-js";
import { t } from "./i18n";
export function usePagePins() {
  const [pins, setPins] = createSignal<AppPageId[]>();
  const [error, setError] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  let revision = 0;
  async function load() {
    const serial = ++revision;
    try {
      const settings = await window.openbot?.appSettings?.get();
      if (settings && serial === revision) setPins(settings.navigation.pinnedPageIds);
    } catch {
      setError(t("Could not load the pinned pages."));
    }
  }
  onSettled(() => {
    if (!window.openbot?.appSettings) return;
    void load();
    const off = window.openbot?.agent?.onEvent((event) => {
      if (event.type === "app-settings-changed") {
        revision++;
        setPins(event.settings.navigation.pinnedPageIds);
      }
    });
    return () => {
      revision++;
      off?.();
    };
  });
  async function toggle(id: AppPageId) {
    const api = window.openbot?.appSettings;
    if (!api || busy()) return;
    setBusy(true);
    setError("");
    try {
      // Always write the full ordered list, using the latest committed settings.
      const settings = await api.get();
      const current = settings.navigation.pinnedPageIds;
      const next = current.includes(id) ? current.filter((page) => page !== id) : [...current, id];
      const saved = await api.update({ navigation: { pinnedPageIds: next } });
      setPins(saved.navigation.pinnedPageIds);
    } catch {
      setError(t("Could not save the pin. Try again from the page menu."));
    } finally {
      setBusy(false);
    }
  }
  return { pins, busy, error, toggle };
}
