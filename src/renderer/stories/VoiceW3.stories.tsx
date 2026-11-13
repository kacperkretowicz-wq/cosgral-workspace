import { defaultVoiceSettings, type VoiceState } from "@openbot/contracts/ipc";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { VoiceSettingsView } from "../src/components/VoiceSettings";
import { type StoryTheme, ThemeFrame } from "./theme-frame";

const demo: VoiceState = {
  speech: { available: true, unavailableReason: null, speaking: false },
  transcription: {
    available: false,
    unavailableReason: "Download a model to transcribe.",
    consent: false,
    busy: false,
    runtime: {
      name: "whisper.cpp",
      version: "demo",
      license: "MIT",
      sourceUrl: "https://example.com",
      sizeBytes: 8_000_000,
      state: "absent",
      progress: null,
      error: null,
    },
    models: [
      {
        id: "tiny",
        label: "Tiny",
        description: "Demo",
        sizeBytes: 30_000_000,
        recommended: false,
        state: "absent",
        progress: null,
        error: null,
      },
      {
        id: "base",
        label: "Base",
        description: "Demo",
        sizeBytes: 60_000_000,
        recommended: true,
        state: "downloading",
        progress: { receivedBytes: 30, totalBytes: 100 },
        error: null,
      },
      {
        id: "small",
        label: "Small",
        description: "Demo",
        sizeBytes: 180_000_000,
        recommended: false,
        state: "absent",
        progress: null,
        error: null,
      },
    ],
  },
  settings: defaultVoiceSettings(),
};
function Preview(props: { theme: StoryTheme }) {
  return (
    <ThemeFrame theme={props.theme} style="padding: 24px; min-height: 100vh">
      <VoiceSettingsView
        state={demo}
        voices={[{ id: "demo", name: "Example voice", culture: "en", gender: "unknown" }]}
        update={() => undefined}
        download={() => undefined}
        cancel={() => undefined}
        remove={() => undefined}
        removeRuntime={() => undefined}
      />
    </ThemeFrame>
  );
}
const meta = { title: "COSGRAL/Voice" } satisfies Meta;
export default meta;
type Story = StoryObj;
export const Dark: Story = { render: () => <Preview theme="dark" /> };
export const Light: Story = { render: () => <Preview theme="light" /> };
