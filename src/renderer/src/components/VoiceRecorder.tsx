import { checkVoiceWav, encodeVoiceWav, VOICE_LIMITS, VOICE_SAMPLE_RATE } from "@openbot/contracts/ipc";
import { createSignal, onCleanup, onSettled, Show } from "solid-js";

export function samplesToVoiceWav(chunks: Float32Array[], rate: number): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const source = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    source.set(chunk, offset);
    offset += chunk.length;
  }
  const length = Math.min(
    VOICE_SAMPLE_RATE * VOICE_LIMITS.audioSeconds,
    Math.floor((total * VOICE_SAMPLE_RATE) / rate),
  );
  const output = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const position = (i * rate) / VOICE_SAMPLE_RATE;
    const left = Math.floor(position),
      fraction = position - left;
    output[i] = (source[left] ?? 0) * (1 - fraction) + (source[Math.min(left + 1, total - 1)] ?? 0) * fraction;
  }
  const wav = encodeVoiceWav(output);
  checkVoiceWav(wav);
  return wav;
}

export function VoiceRecorder(props: { onTranscript: (text: string) => void }) {
  const [recording, setRecording] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [enabled, setEnabled] = createSignal(false);
  const [error, setError] = createSignal("");
  let stream: MediaStream | undefined, context: AudioContext | undefined, processor: ScriptProcessorNode | undefined;
  let chunks: Float32Array[] = [],
    sampleCount = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    active = true,
    generation = 0;
  function release() {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (processor) {
      processor.onaudioprocess = null;
      processor.disconnect();
      processor = undefined;
    }
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = undefined;
    if (context) void context.close().catch(() => undefined);
    context = undefined;
    setRecording(false);
  }
  async function finish() {
    if (!context || !recording()) return;
    const rate = context.sampleRate,
      recordingChunks = chunks;
    chunks = [];
    release();
    setBusy(true);
    const run = generation;
    try {
      const audio = samplesToVoiceWav(recordingChunks, rate);
      const api = window.openbot.voice;
      if (!api) throw new Error("Voice is unavailable.");
      const result = await api.transcribe({ audio });
      if (active && run === generation && result.text) props.onTranscript(result.text);
    } catch (e) {
      if (active && run === generation) setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally {
      if (active && run === generation) setBusy(false);
    }
  }
  async function start() {
    if (recording() || busy()) return;
    setBusy(true);
    setError("");
    const run = ++generation;
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false });
      if (!active || run !== generation) {
        for (const track of acquired.getTracks()) track.stop();
        return;
      }
      stream = acquired;
      context = new AudioContext();
      await context.resume();
      if (!active || run !== generation) {
        release();
        return;
      }
      const source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      chunks = [];
      sampleCount = 0;
      processor.onaudioprocess = (event) => {
        const available = Math.max(
          0,
          Math.floor((context?.sampleRate ?? VOICE_SAMPLE_RATE) * VOICE_LIMITS.audioSeconds) - sampleCount,
        );
        const data = event.inputBuffer.getChannelData(0).slice(0, available);
        if (data.length) {
          chunks.push(data);
          sampleCount += data.length;
        }
      };
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);
      setRecording(true);
      timer = setTimeout(() => void finish(), VOICE_LIMITS.audioSeconds * 1000);
    } catch (e) {
      release();
      setError(
        e instanceof Error
          ? `Microphone unavailable: ${e.message}`
          : "Microphone permission was denied or unavailable.",
      );
    } finally {
      if (active && run === generation) setBusy(false);
    }
  }
  onSettled(() => {
    const api = window.openbot.voice;
    if (!api) return;
    void api
      .getState()
      .then((state) => setEnabled(state.settings.enabled))
      .catch(() => setEnabled(false));
    return window.openbot.agent.onEvent((event) => {
      if (event.type === "voice-changed") {
        setEnabled(event.state.settings.enabled);
        if (!event.state.settings.enabled) {
          generation++;
          chunks = [];
          release();
          setBusy(false);
        }
      }
    });
  });
  onCleanup(() => {
    active = false;
    generation++;
    chunks = [];
    release();
  });
  return (
    <Show when={window.openbot.voice && enabled()}>
      <span class="voice-recorder">
        <button type="button" disabled={busy()} onClick={() => (recording() ? void finish() : void start())}>
          {recording() ? "Stop recording" : busy() ? "Transcribing…" : "Record voice"}
        </button>
        <Show when={error()}>
          <span role="alert">{error()}</span>
        </Show>
      </span>
    </Show>
  );
}
