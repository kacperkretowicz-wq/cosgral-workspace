import type { UpdateVoiceSettingsInput, VoiceInfo, VoiceModelId, VoiceState } from "@openbot/contracts/ipc";
import { createSignal, For, onSettled, Show } from "solid-js";
import { t } from "../i18n";
import { Button, Input, NativeSelect } from "./ui";

export function VoiceSettingsView(props: {
  state: VoiceState;
  voices: VoiceInfo[];
  update: (input: UpdateVoiceSettingsInput) => void;
  download: (id: VoiceModelId) => void;
  cancel: (id: VoiceModelId) => void;
  remove: (id: VoiceModelId) => void;
  removeRuntime: () => void;
}) {
  const settings = () => props.state.settings;
  return (
    <section class="ui-card cosgral-settings-block cosgral-form" aria-label={t("Voice settings")}>
      <h2>{t("Voice")}</h2>
      <p>{t("Audio stays on this computer. The first download requires approval on a Needs you card.")}</p>
      <label>
        <Input
          unstyled
          type="checkbox"
          checked={settings().enabled}
          onChange={(e) => props.update({ enabled: e.currentTarget.checked })}
        />{" "}
        {t("Enable voice")}
      </label>
      <p>
        {props.state.speech.available
          ? t("System speech available.")
          : (props.state.speech.unavailableReason ?? t("System speech unavailable."))}
      </p>
      <label>
        {t("Voice")}{" "}
        <NativeSelect
          unstyled
          value={settings().voiceId ?? ""}
          onChange={(e) => props.update({ voiceId: e.currentTarget.value || null })}
        >
          <option value="">{t("System default")}</option>
          <For each={props.voices}>
            {(voice) => (
              <option value={voice.id}>
                {voice.name} ({voice.culture})
              </option>
            )}
          </For>
        </NativeSelect>
      </label>
      <label>
        {t("Speed")}{" "}
        <Input
          unstyled
          type="number"
          min="0.5"
          max="2"
          step="0.1"
          value={settings().rate}
          onChange={(e) => props.update({ rate: Number(e.currentTarget.value) })}
        />
      </label>
      <label>
        <Input
          unstyled
          type="checkbox"
          checked={settings().autoRead}
          onChange={(e) => props.update({ autoRead: e.currentTarget.checked })}
        />{" "}
        {t("Read new replies automatically")}
      </label>
      <label>
        {t("Recording language")}{" "}
        <NativeSelect
          unstyled
          value={settings().language}
          onChange={(e) => {
            const value = e.currentTarget.value;
            if (value === "auto" || value === "en" || value === "pl") props.update({ language: value });
          }}
        >
          <option value="auto">{t("Automatic")}</option>
          <option value="en">{t("English")}</option>
          <option value="pl">{t("Polski")}</option>
        </NativeSelect>
      </label>
      <p>
        {t("Runtime:")} {props.state.transcription.runtime.state} ·{" "}
        {(props.state.transcription.runtime.sizeBytes / 1048576).toFixed(1)} MB
        <Show when={props.state.transcription.runtime.progress}>
          {(progress) => (
            <span> · {Math.round((progress().receivedBytes / Math.max(1, progress().totalBytes)) * 100)}%</span>
          )}
        </Show>
      </p>
      <Show when={props.state.transcription.runtime.error}>
        <p role="alert">{props.state.transcription.runtime.error}</p>
      </Show>
      <p>
        {props.state.transcription.available ? t("Transcription ready.") : props.state.transcription.unavailableReason}
      </p>
      <ul>
        <For each={props.state.transcription.models}>
          {(model) => (
            <li>
              <label>
                <Input
                  unstyled
                  type="radio"
                  name="voice-model"
                  checked={settings().modelId === model.id}
                  onChange={() => props.update({ modelId: model.id })}
                />{" "}
                {model.label} · {(model.sizeBytes / 1048576).toFixed(1)} MB · {model.state}
              </label>
              <Show when={model.progress}>
                {(progress) => (
                  <span> · {Math.round((progress().receivedBytes / Math.max(1, progress().totalBytes)) * 100)}%</span>
                )}
              </Show>
              <Show when={model.error}>
                <p role="alert">{model.error}</p>
              </Show>
              <Show
                when={model.state === "downloading"}
                fallback={
                  <Button unstyled type="button" onClick={() => props.download(model.id)}>
                    {t("Download")}
                  </Button>
                }
              >
                <Button unstyled type="button" onClick={() => props.cancel(model.id)}>
                  {t("Cancel download")}
                </Button>
              </Show>
              <Button unstyled type="button" disabled={model.state !== "ready"} onClick={() => props.remove(model.id)}>
                {t("Delete model")}
              </Button>
            </li>
          )}
        </For>
      </ul>
      <Button unstyled type="button" onClick={props.removeRuntime}>
        {t("Delete runtime and revoke consent")}
      </Button>
    </section>
  );
}
export function VoiceSettings() {
  const [state, setState] = createSignal<VoiceState>();
  const [voices, setVoices] = createSignal<VoiceInfo[]>([]);
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  async function refresh() {
    const api = window.openbot.voice;
    if (!api) {
      setError(t("Voice is unavailable in this build."));
      return;
    }
    // W3-BE9: the Windows voice list comes from PowerShell and can take seconds; show the settings first.
    void api
      .listVoices()
      .then(setVoices)
      .catch(() => undefined);
    try {
      setState(await api.getState());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not load voice."));
    }
  }
  async function action(fn: () => Promise<unknown>) {
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Voice action failed."));
    }
  }
  onSettled(() => {
    void refresh();
    return window.openbot.agent.onEvent((event) => {
      if (event.type === "voice-changed") setState(event.state);
    });
  });
  return (
    <>
      <Show when={error()}>
        <p role="alert">{error()}</p>
      </Show>
      <Show when={notice()}>
        <p role="status">{notice()}</p>
      </Show>
      <Show when={state()}>
        {(value) => (
          <VoiceSettingsView
            state={value()}
            voices={voices()}
            update={(input) => {
              const api = window.openbot.voice;
              if (api) void action(() => api.updateSettings(input));
            }}
            download={(modelId) => {
              const api = window.openbot.voice;
              if (api)
                void action(async () => {
                  const result = await api.downloadModel({ modelId });
                  setNotice(
                    result.status === "declined"
                      ? t("Download was declined.")
                      : result.status === "ready"
                        ? t("Model is ready.")
                        : t("Download started."),
                  );
                });
            }}
            cancel={(modelId) => {
              const api = window.openbot.voice;
              if (api) void action(() => api.cancelDownload({ modelId }));
            }}
            remove={(modelId) => {
              const api = window.openbot.voice;
              if (api && window.confirm(t("Delete this downloaded model?")))
                void action(() => api.deleteModel({ modelId }));
            }}
            removeRuntime={() => {
              const api = window.openbot.voice;
              if (api && window.confirm(t("Delete the runtime and revoke consent?")))
                void action(() => api.deleteRuntime());
            }}
          />
        )}
      </Show>
    </>
  );
}
