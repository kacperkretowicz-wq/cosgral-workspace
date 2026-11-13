// COSGRAL W3: voice in the main process: the engine with its Windows helpers and its IPC. Voice uses this computer's
// speakers, microphone recordings and files, so it acts on this computer whatever server the window shows.

import { join } from "node:path";
import { type AgentEvent, type DraftPreviewResolution, IPC_CHANNELS } from "@openbot/contracts/ipc";
import { HttpsDownloadSource } from "../backend/voice-download";
import { VoiceService } from "../backend/voice-service";
import { WhisperCliRunner, WindowsSpeechDriver } from "../backend/voice-windows";
import { parseAgentRequest } from "./ipc/agent-inputs";
import { parseSpeak, parseTranscribe, parseUpdateVoiceSettings, parseVoiceModelId } from "./ipc/voice-inputs";
import { handleTrusted } from "./trusted-ipc";

export interface VoiceRuntimeOptions {
  userDataPath: string;
  /** The consent card before the first download; rejects when no card can be shown. */
  confirm: (input: { title: string; preview: string }) => Promise<DraftPreviewResolution>;
  emit: (event: AgentEvent) => void;
  platform?: NodeJS.Platform;
}

export function createVoice(options: VoiceRuntimeOptions): VoiceService {
  const platform = options.platform ?? process.platform;
  const voice = new VoiceService({
    root: join(options.userDataPath, "voice"),
    speech: platform === "win32" ? new WindowsSpeechDriver({ platform }) : null,
    runner: new WhisperCliRunner(),
    source: new HttpsDownloadSource(),
    confirm: options.confirm,
    emit: options.emit,
    platform,
  });
  voice.init().catch((error: unknown) => console.error("Voice could not start:", error));
  return voice;
}

export function registerVoiceIpc(voice: () => VoiceService | null): void {
  const current = (): VoiceService => {
    const value = voice();
    if (!value) throw new Error("Voice is not ready yet.");
    return value;
  };
  const payload = (input: unknown) => parseAgentRequest(input).payload;
  handleTrusted(IPC_CHANNELS.voiceGetState, () => current().getState());
  handleTrusted(IPC_CHANNELS.voiceListVoices, () => current().listVoices());
  handleTrusted(IPC_CHANNELS.voiceSpeak, (input: unknown) => current().speak(parseSpeak(payload(input))));
  handleTrusted(IPC_CHANNELS.voiceStop, () => current().stop());
  handleTrusted(IPC_CHANNELS.voiceDownloadModel, (input: unknown) =>
    current().downloadModel(parseVoiceModelId(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.voiceCancelDownload, (input: unknown) =>
    current().cancelDownload(parseVoiceModelId(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.voiceDeleteModel, (input: unknown) =>
    current().deleteModel(parseVoiceModelId(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.voiceDeleteRuntime, () => current().deleteRuntime());
  handleTrusted(IPC_CHANNELS.voiceTranscribe, (input: unknown) =>
    current().transcribe(parseTranscribe(payload(input))),
  );
  handleTrusted(IPC_CHANNELS.voiceUpdateSettings, (input: unknown) =>
    current().updateSettings(parseUpdateVoiceSettings(payload(input))),
  );
}
