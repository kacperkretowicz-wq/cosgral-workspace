// COSGRAL W12-KK: puts the whole Voice page into ONE answer (see `VoiceOverview` in ipc-voice.ts): the state of the models and the
// settings, the Windows voices, the microphone permission, and what this version does not offer (with its reason).

import {
  MICROPHONE_STATUSES,
  type MicrophoneStatus,
  VOICE_UNAVAILABLE_FEATURES,
  type VoiceInfo,
  type VoiceMicrophone,
  type VoiceOverview,
  type VoiceState,
} from "@openbot/contracts/ipc";
import { isOneOf } from "@openbot/contracts/runtime-values";

/** What the system says about the microphone, as one of ours; anything else is "unknown". */
export function normalizeMicrophoneStatus(raw: string): MicrophoneStatus {
  return isOneOf(MICROPHONE_STATUSES, raw) ? raw : "unknown";
}

/** The permission and whether the program can open the page where it is changed (Windows and macOS only). */
export function microphoneInfo(status: MicrophoneStatus, platform: NodeJS.Platform): VoiceMicrophone {
  return { status, canOpenSettings: platform === "win32" || platform === "darwin" };
}

export interface VoiceOverviewSource {
  getState(): Promise<VoiceState>;
  listVoices(): Promise<VoiceInfo[]>;
}

export async function buildVoiceOverview(
  source: VoiceOverviewSource,
  microphone: VoiceMicrophone,
): Promise<VoiceOverview> {
  const state = await source.getState();
  // Voices are asked for only when reading aloud can work at all; a failing list must not hide the rest of the page.
  const voices = state.speech.available ? await source.listVoices().catch(() => []) : [];
  return { state, voices, microphone, unavailable: VOICE_UNAVAILABLE_FEATURES.map((feature) => ({ ...feature })) };
}
