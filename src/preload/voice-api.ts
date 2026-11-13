// COSGRAL W3: the window API of voice. Answers are checked with the contract guards.

import {
  type DownloadVoiceModelResult,
  IPC_CHANNELS,
  isTranscribeResult,
  isVoiceInfo,
  isVoiceSettings,
  isVoiceState,
  type SpeakResult,
  type TranscribeResult,
  type VoiceDesktopApi,
  type VoiceInfo,
  type VoiceSettings,
  type VoiceState,
} from "@openbot/contracts/ipc";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createVoiceApi(invoke: Invoke): VoiceDesktopApi {
  return {
    getState: () => invoke(IPC_CHANNELS.voiceGetState, null, decodeState),
    listVoices: () => invoke(IPC_CHANNELS.voiceListVoices, null, decodeVoices),
    speak: (input) => invoke(IPC_CHANNELS.voiceSpeak, input, decodeSpeak),
    stop: () => invoke(IPC_CHANNELS.voiceStop, null, decodeState),
    downloadModel: (input) => invoke(IPC_CHANNELS.voiceDownloadModel, input, decodeDownload),
    cancelDownload: (input) => invoke(IPC_CHANNELS.voiceCancelDownload, input, decodeState),
    deleteModel: (input) => invoke(IPC_CHANNELS.voiceDeleteModel, input, decodeState),
    deleteRuntime: () => invoke(IPC_CHANNELS.voiceDeleteRuntime, null, decodeState),
    transcribe: (input) => invoke(IPC_CHANNELS.voiceTranscribe, input, decodeTranscription),
    updateSettings: (input) => invoke(IPC_CHANNELS.voiceUpdateSettings, input, decodeSettings),
  };
}

function decodeState(value: unknown): VoiceState {
  if (!isVoiceState(value)) throw new Error("Invalid voice state response.");
  return value;
}

function decodeVoices(value: unknown): VoiceInfo[] {
  if (!Array.isArray(value)) throw new Error("Invalid voice list response.");
  return value.filter(isVoiceInfo);
}

function decodeSpeak(value: unknown): SpeakResult {
  if (!isDynamicRecord(value) || (value.status !== "done" && value.status !== "stopped")) {
    throw new Error("Invalid speak response.");
  }
  return { status: value.status };
}

function decodeDownload(value: unknown): DownloadVoiceModelResult {
  if (
    !isDynamicRecord(value) ||
    (value.status !== "started" && value.status !== "ready" && value.status !== "declined")
  ) {
    throw new Error("Invalid download response.");
  }
  return { status: value.status };
}

function decodeTranscription(value: unknown): TranscribeResult {
  if (!isTranscribeResult(value)) throw new Error("Invalid transcription response.");
  return value;
}

function decodeSettings(value: unknown): VoiceSettings {
  if (!isVoiceSettings(value)) throw new Error("Invalid voice settings response.");
  return value;
}
