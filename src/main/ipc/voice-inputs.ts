// COSGRAL W3: what a window may send for voice (see ipc-voice.ts). The engine checks the values again.

import {
  type SpeakInput,
  type TranscribeInput,
  type UpdateVoiceSettingsInput,
  VOICE_LANGUAGES,
  VOICE_LIMITS,
  VOICE_MODEL_IDS,
  type VoiceModelIdInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isBoolean, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { isObject } from "./validation";

export function parseSpeak(value: unknown): SpeakInput {
  const input = record(value);
  if (!isString(input.text)) throw new Error("text is required.");
  if (input.text.length > VOICE_LIMITS.speakText * 2) throw new Error("text is too long.");
  const parsed: SpeakInput = { text: input.text };
  if (input.voiceId !== undefined) {
    if (input.voiceId !== null && (!isString(input.voiceId) || input.voiceId.length > VOICE_LIMITS.voiceId)) {
      throw new Error("voiceId must be a voice id or null.");
    }
    parsed.voiceId = input.voiceId;
  }
  if (input.rate !== undefined) {
    if (!isNumber(input.rate)) throw new Error("rate must be a number.");
    parsed.rate = input.rate;
  }
  return parsed;
}

export function parseVoiceModelId(value: unknown): VoiceModelIdInput {
  const input = record(value);
  if (!isOneOf(VOICE_MODEL_IDS, input.modelId)) throw new Error(`modelId is one of: ${VOICE_MODEL_IDS.join(", ")}.`);
  return { modelId: input.modelId };
}

export function parseTranscribe(value: unknown): TranscribeInput {
  const input = record(value);
  if (!(input.audio instanceof Uint8Array)) throw new Error("audio must be WAV bytes.");
  if (input.audio.byteLength > VOICE_LIMITS.audioBytes) {
    throw new Error(`The recording is longer than ${VOICE_LIMITS.audioSeconds} seconds.`);
  }
  const parsed: TranscribeInput = { audio: input.audio };
  if (input.language !== undefined && input.language !== null) {
    if (!isOneOf(VOICE_LANGUAGES, input.language))
      throw new Error(`language is one of: ${VOICE_LANGUAGES.join(", ")}.`);
    parsed.language = input.language;
  }
  return parsed;
}

/** Known keys with the right types; ranges and formats are checked by the engine. */
export function parseUpdateVoiceSettings(value: unknown): UpdateVoiceSettingsInput {
  const input = record(value);
  const parsed: UpdateVoiceSettingsInput = {};
  if (input.enabled !== undefined) {
    if (!isBoolean(input.enabled)) throw new Error("enabled must be true or false.");
    parsed.enabled = input.enabled;
  }
  if (input.autoRead !== undefined) {
    if (!isBoolean(input.autoRead)) throw new Error("autoRead must be true or false.");
    parsed.autoRead = input.autoRead;
  }
  if (input.voiceId !== undefined) {
    if (input.voiceId !== null && !isString(input.voiceId)) throw new Error("voiceId must be text or null.");
    parsed.voiceId = input.voiceId;
  }
  if (input.rate !== undefined) {
    if (!isNumber(input.rate)) throw new Error("rate must be a number.");
    parsed.rate = input.rate;
  }
  if (input.language !== undefined) {
    if (!isOneOf(VOICE_LANGUAGES, input.language))
      throw new Error(`language is one of: ${VOICE_LANGUAGES.join(", ")}.`);
    parsed.language = input.language;
  }
  if (input.modelId !== undefined) {
    if (!isOneOf(VOICE_MODEL_IDS, input.modelId)) throw new Error(`modelId is one of: ${VOICE_MODEL_IDS.join(", ")}.`);
    parsed.modelId = input.modelId;
  }
  if (input.shortcut !== undefined) {
    if (input.shortcut !== null && !isString(input.shortcut)) throw new Error("shortcut must be text or null.");
    parsed.shortcut = input.shortcut;
  }
  return parsed;
}

function record(value: unknown): DynamicRecord {
  if (!isObject(value)) throw new Error("Expected an object.");
  return value;
}
