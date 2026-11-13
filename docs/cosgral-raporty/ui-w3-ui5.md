# W3-UI5

## Voice

The conversation composer records microphone audio locally using Web Audio, resamples it to 16 kHz mono PCM WAV, validates the WAV and transcribes it. Capture is limited to 120 seconds. A successful transcript is appended to the current agent draft; it is not sent. Microphone errors are shown. Tracks and audio context are closed on stop or unmount.

Agent messages have read-aloud and Stop controls. Automatic reading follows the setting for newly arriving completed messages in the open agent conversation, excluding thinking and agent exchanges. Text over the backend limit is truncated for reading.

Voice settings offer enable, voice, speed, automatic reading, recording language, model choice, sizes and states, progress, download/cancel/delete and runtime deletion. Download reports a declined consent. Light and dark Storybook examples use demo settings data.

## Agent settings save

Profile and fallback models remain separate backend operations. Failures state which stage failed. A fallback-only retry does not repeat the profile save; the normal Save button saves both again. If edits are made to the profile after a fallback failure, use Save settings to include them.

## Verification and limitations

- Renderer and Storybook typechecks passed; Biome passed on changed files.
- Focused tests passed: WAV resampling 1/1, microphone refusal 1/1, fallback-only retry 1/1.
- The recording path was not tested with a physical microphone, in packaged Electron, or for a full 120 seconds. No actual transcription, download, speaker playback or automatic reading was tested end-to-end; backend whisper.cpp download and execution also remain unverified as noted in its report.
- The Storybook examples show settings with demo data, not live recording or playback. No visual inspection or full suite/build was run.
- Automatic read is scoped to the currently mounted agent conversation; messages received in other conversations are not read until a separate implementation handles them.
