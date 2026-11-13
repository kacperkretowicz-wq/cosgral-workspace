// COSGRAL W3: what the voice feature may download, pinned in code. Each file has one HTTPS address, an exact size and
// a SHA-256; nothing else is fetched. Sources (checked 13.11.2026 from their public metadata):
// - whisper.cpp v1.9.2, Windows x64 CPU build, MIT: github.com/ggml-org/whisper.cpp release asset (GitHub digest).
// - Quantized multilingual models, MIT: huggingface.co/ggerganov/whisper.cpp at revision 5359861c (LFS SHA-256).
// A new version means new values here; a changed file upstream fails the check and is not used.

import type { VoiceModelId } from "@openbot/contracts/ipc";

export interface VoiceDownloadAsset {
  url: string;
  sha256: string;
  sizeBytes: number;
  /** File name on this computer. */
  fileName: string;
  license: string;
  /** Project page to show the person. */
  sourceUrl: string;
}

export interface VoiceRuntimeAsset extends VoiceDownloadAsset {
  name: string;
  version: string;
  /** The program inside the package that transcribes. */
  executable: string;
}

export interface VoiceModelAsset extends VoiceDownloadAsset {
  id: VoiceModelId;
  label: string;
  description: string;
  recommended: boolean;
}

export interface VoiceCatalog {
  runtime: VoiceRuntimeAsset;
  models: VoiceModelAsset[];
}

const MODEL_REVISION = "5359861c739e955e79d9a303bcbc70fb988958b1";
const MODEL_SOURCE = "https://huggingface.co/ggerganov/whisper.cpp";

function model(fields: Omit<VoiceModelAsset, "url" | "license" | "sourceUrl">): VoiceModelAsset {
  return {
    ...fields,
    url: `${MODEL_SOURCE}/resolve/${MODEL_REVISION}/${fields.fileName}`,
    license: "MIT",
    sourceUrl: MODEL_SOURCE,
  };
}

export const VOICE_CATALOG: VoiceCatalog = {
  runtime: {
    name: "whisper.cpp",
    version: "1.9.2",
    url: "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip",
    sha256: "49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a",
    sizeBytes: 8_194_445,
    fileName: "whisper-bin-x64.zip",
    license: "MIT",
    sourceUrl: "https://github.com/ggml-org/whisper.cpp",
    executable: "whisper-cli.exe",
  },
  models: [
    model({
      id: "tiny",
      label: "Tiny",
      description: "Fastest and smallest; good for short commands, less accurate.",
      fileName: "ggml-tiny-q5_1.bin",
      sha256: "818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7",
      sizeBytes: 32_152_673,
      recommended: false,
    }),
    model({
      id: "base",
      label: "Base",
      description: "Good balance of speed and accuracy on most computers.",
      fileName: "ggml-base-q5_1.bin",
      sha256: "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898",
      sizeBytes: 59_707_625,
      recommended: true,
    }),
    model({
      id: "small",
      label: "Small",
      description: "More accurate, also for Polish; slower on older computers.",
      fileName: "ggml-small-q5_1.bin",
      sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
      sizeBytes: 190_085_487,
      recommended: false,
    }),
  ],
};

/** Hosts a download or one of its redirects may use. */
export const VOICE_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "release-assets.githubusercontent.com",
  "objects.githubusercontent.com",
  "huggingface.co",
  "cdn-lfs.huggingface.co",
  "cdn-lfs-us-1.huggingface.co",
  "cdn-lfs-eu-1.huggingface.co",
  "cas-bridge.xethub.hf.co",
]);

/** Hugging Face's CDN uses regional names such as us.aws.cdn.hf.co. */
export const VOICE_DOWNLOAD_HOST_SUFFIXES = [".cdn.hf.co"];
