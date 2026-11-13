// COSGRAL W3: a quiet check of Windows voices. Lists the installed voices and writes a short sentence to a WAV file
// in the temp folder (no sound), then deletes it. Usage: bun scripts/voice-speech-smoke.ts

import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVoiceWav } from "@openbot/contracts/ipc";
import { WindowsSpeechDriver } from "../src/backend/voice-windows";

const driver = new WindowsSpeechDriver();
const reason = driver.unavailableReason();
if (reason) {
  console.log(`unavailable: ${reason}`);
  process.exit(0);
}
const started = Date.now();
const voices = await driver.listVoices();
console.log(`voices: ${voices.length} (${Date.now() - started} ms)`);
for (const voice of voices) console.log(`- ${voice.name} | ${voice.culture} | ${voice.gender}`);
const folder = await mkdtemp(join(tmpdir(), "cosgral-voice-smoke-"));
try {
  const file = join(folder, "speech.wav");
  const at = Date.now();
  await driver.synthesizeToFile({ text: "COSGRAL voice check. Zażółć gęślą jaźń.", voiceId: null, rate: 1.25 }, file);
  const bytes = await readFile(file);
  const info = readVoiceWav(new Uint8Array(bytes));
  console.log(
    `wav: ${(await stat(file)).size} bytes, ${info.sampleRate} Hz, ${info.channels} ch, ${info.durationMs} ms (${Date.now() - at} ms)`,
  );
} finally {
  await rm(folder, { recursive: true, force: true });
}
