// COSGRAL W12-KK: `window.openbot.voice` for Storybook and the preview. DEMO only: nothing is downloaded, recorded or spoken. The same
// rules as the program: nothing downloads before the person approves (the first download asks; `simulate.declineNext` plays "no"),
// progress and every change come as `voice-changed` with the whole state, transcription needs the switch, the consent, the runtime and
// the chosen model, settings are checked (speed 0.5-2, a real shortcut), and `getOverview` gives the whole page in one answer.

import {
  type AgentEvent,
  checkVoiceWav,
  defaultVoiceSettings,
  isVoiceShortcut,
  type MicrophoneStatus,
  VOICE_LANGUAGES,
  VOICE_LIMITS,
  VOICE_MODEL_IDS,
  VOICE_UNAVAILABLE_FEATURES,
  type VoiceDesktopApi,
  type VoiceInfo,
  type VoiceModel,
  type VoiceModelId,
  type VoiceSettings,
  type VoiceState,
} from "@openbot/contracts/ipc";
import { isOneOf } from "@openbot/contracts/runtime-values";

export interface MockVoice extends Required<VoiceDesktopApi> {
  simulate: {
    /** The person answers "no" on the consent card of the next first download. */
    declineNext: () => void;
    /** The download of this model has received this share (0-1); at 1 it is checked and ready. */
    progress: (modelId: VoiceModelId, share: number) => void;
    /** The download of this model fails (a fixed sentence). */
    failDownload: (modelId: VoiceModelId) => void;
    /** The permission the system reports for the microphone. */
    microphone: (status: MicrophoneStatus) => void;
    /** Windows voices cannot be used (another system). */
    speechUnavailable: (reason: string | null) => void;
  };
}

const MODELS: ReadonlyArray<{
  id: VoiceModelId;
  label: string;
  description: string;
  sizeBytes: number;
  recommended: boolean;
}> = [
  { id: "tiny", label: "Tiny", description: "Fastest, least accurate.", sizeBytes: 75_000_000, recommended: false },
  {
    id: "base",
    label: "Base",
    description: "A good balance for most computers.",
    sizeBytes: 142_000_000,
    recommended: true,
  },
  { id: "small", label: "Small", description: "More accurate, slower.", sizeBytes: 466_000_000, recommended: false },
];

const VOICES: VoiceInfo[] = [
  { id: "demo-pl", name: "Demo voice (Polish)", culture: "pl-PL", gender: "Female" },
  { id: "demo-en", name: "Demo voice (English)", culture: "en-US", gender: "Male" },
];

export function createMockVoice(emit: (event: AgentEvent) => void): MockVoice {
  let consent = false;
  let runtime: VoiceState["transcription"]["runtime"] = {
    name: "whisper.cpp",
    version: "1.8.0",
    license: "MIT",
    sourceUrl: "https://github.com/ggml-org/whisper.cpp",
    sizeBytes: 12_000_000,
    state: "absent",
    progress: null,
    error: null,
  };
  const models = new Map<VoiceModelId, VoiceModel>(
    MODELS.map((model) => [model.id, { ...model, state: "absent", progress: null, error: null }]),
  );
  let settings: VoiceSettings = defaultVoiceSettings();
  let microphone: MicrophoneStatus = "not-determined";
  let speechReason: string | null = null;
  let declineNext = false;
  let speaking = false;

  const state = (): VoiceState => {
    const chosen = models.get(settings.modelId);
    let reason: string | null = null;
    if (!settings.enabled) reason = "Voice is switched off in Settings → Voice.";
    else if (!consent) reason = "Download a model first (it asks you before anything is downloaded).";
    else if (runtime.state !== "ready" || chosen?.state !== "ready") reason = "The chosen model is not ready yet.";
    return {
      speech: { available: speechReason === null, unavailableReason: speechReason, speaking },
      transcription: {
        available: reason === null,
        unavailableReason: reason,
        consent,
        busy: false,
        runtime: structuredClone(runtime),
        models: MODELS.map((entry) => structuredClone(model(entry.id))),
      },
      settings: { ...settings },
    };
  };
  const changed = () => {
    emit({ type: "voice-changed", state: state() });
    return state();
  };
  const model = (id: VoiceModelId): VoiceModel => {
    const found = models.get(id);
    if (!found) throw new Error("That model is not known.");
    return found;
  };
  const modelIdOf = (input: { modelId: VoiceModelId }): VoiceModelId => {
    if (!isOneOf(VOICE_MODEL_IDS, input.modelId)) throw new Error(`modelId is one of: ${VOICE_MODEL_IDS.join(", ")}.`);
    return input.modelId;
  };

  return {
    getOverview: async () => ({
      state: state(),
      voices: speechReason === null ? structuredClone(VOICES) : [],
      microphone: { status: microphone, canOpenSettings: true },
      unavailable: VOICE_UNAVAILABLE_FEATURES.map((feature) => ({ ...feature })),
    }),
    openMicrophoneSettings: async () => undefined,
    getState: async () => state(),
    listVoices: async () => (speechReason === null ? structuredClone(VOICES) : []),
    speak: async (input) => {
      if (!settings.enabled) throw new Error("Voice is switched off in Settings → Voice.");
      if (speechReason !== null) throw new Error(speechReason);
      if (input.text.trim().length === 0 || input.text.length > VOICE_LIMITS.speakText * 2)
        throw new Error("There is nothing to read.");
      return { status: "done" };
    },
    stop: async () => {
      speaking = false;
      return changed();
    },
    downloadModel: async (input) => {
      const id = modelIdOf(input);
      const target = model(id);
      if (target.state === "ready") return { status: "ready" };
      if (!consent) {
        if (declineNext) {
          declineNext = false;
          return { status: "declined" };
        }
        consent = true;
      }
      if (runtime.state === "absent")
        runtime = { ...runtime, state: "downloading", progress: { receivedBytes: 0, totalBytes: runtime.sizeBytes } };
      models.set(id, {
        ...target,
        state: "downloading",
        progress: { receivedBytes: 0, totalBytes: target.sizeBytes },
        error: null,
      });
      changed();
      return { status: "started" };
    },
    cancelDownload: async (input) => {
      const id = modelIdOf(input);
      const target = model(id);
      if (target.state === "downloading") models.set(id, { ...target, state: "absent", progress: null });
      return changed();
    },
    deleteModel: async (input) => {
      const id = modelIdOf(input);
      models.set(id, { ...model(id), state: "absent", progress: null, error: null });
      return changed();
    },
    deleteRuntime: async () => {
      runtime = { ...runtime, state: "absent", progress: null, error: null };
      for (const [id, entry] of models) models.set(id, { ...entry, state: "absent", progress: null, error: null });
      consent = false;
      return changed();
    },
    transcribe: async (input) => {
      const info = checkVoiceWav(input.audio);
      const current = state();
      if (!current.transcription.available)
        throw new Error(current.transcription.unavailableReason ?? "Dictation is not available.");
      return {
        text: "This is a demo transcript.",
        durationMs: info.durationMs,
        language: input.language ?? settings.language,
        modelId: settings.modelId,
      };
    },
    updateSettings: async (input) => {
      const next = { ...settings, ...input };
      if (input.rate !== undefined && !(input.rate >= VOICE_LIMITS.rateMin && input.rate <= VOICE_LIMITS.rateMax)) {
        throw new Error(`The speed is between ${VOICE_LIMITS.rateMin} and ${VOICE_LIMITS.rateMax}.`);
      }
      if (input.shortcut !== undefined && input.shortcut !== null && !isVoiceShortcut(input.shortcut)) {
        throw new Error("The shortcut needs a modifier and a key, like CommandOrControl+Shift+Space.");
      }
      if (input.language !== undefined && !isOneOf(VOICE_LANGUAGES, input.language))
        throw new Error("That language is not supported.");
      if (input.modelId !== undefined && !isOneOf(VOICE_MODEL_IDS, input.modelId))
        throw new Error("That model is not known.");
      settings = next;
      changed();
      return { ...settings };
    },
    simulate: {
      declineNext: () => {
        declineNext = true;
      },
      progress: (id, share) => {
        const target = model(id);
        if (target.state !== "downloading") return;
        const clamped = Math.max(0, Math.min(1, share));
        if (clamped >= 1) {
          models.set(id, { ...target, state: "ready", progress: null });
          if (runtime.state === "downloading") runtime = { ...runtime, state: "ready", progress: null };
        } else {
          models.set(id, {
            ...target,
            progress: { receivedBytes: Math.round(target.sizeBytes * clamped), totalBytes: target.sizeBytes },
          });
        }
        changed();
      },
      failDownload: (id) => {
        const target = model(id);
        models.set(id, {
          ...target,
          state: "error",
          progress: null,
          error: "The download could not be finished. Try again.",
        });
        if (runtime.state === "downloading") runtime = { ...runtime, state: "absent", progress: null };
        changed();
      },
      microphone: (status) => {
        microphone = status;
      },
      speechUnavailable: (reason) => {
        speechReason = reason;
        changed();
      },
    },
  };
}
