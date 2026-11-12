import { isString } from "@openbot/contracts/runtime-values";
import { BrowserWindow, desktopCapturer, type NativeImage, nativeImage, session } from "electron";
import type { EyesCapture, EyesFrame, EyesSourceInfo } from "../backend/eyes-service";

/**
 * COSGRAL agent eyes on Electron: windows and screens through desktopCapturer, the camera
 * through getUserMedia in a hidden window. The camera page runs on its own privileged
 * scheme (a secure context) in its own session, which allows video only while a photo is
 * being taken.
 */
export const EYES_CAMERA_SCHEME = "cosgral-eyes";
const CAMERA_PARTITION = "cosgral-eyes-camera";
const CAMERA_URL = `${EYES_CAMERA_SCHEME}://camera/`;
const CAMERA_TIMEOUT_MS = 15_000;
const JPEG_QUALITY = 80;

export class ElectronEyesCapture implements EyesCapture {
  #cameraOpen = false;
  #cameraSessionReady = false;

  async listSources(): Promise<EyesSourceInfo[]> {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    let screens = 0;
    const result: EyesSourceInfo[] = [];
    for (const source of sources) {
      const kind = source.id.startsWith("screen:") ? "screen" : "window";
      if (kind === "screen") screens += 1;
      const title = kind === "screen" ? source.name.trim() || `Screen ${screens}` : source.name.trim();
      if (!title) continue;
      result.push({ id: source.id, kind, title, displayId: source.display_id || null });
    }
    return result;
  }

  async capture(source: EyesSourceInfo, maxDimension: number): Promise<EyesFrame> {
    const sources = await desktopCapturer.getSources({
      types: [source.kind],
      thumbnailSize: { width: maxDimension, height: maxDimension },
      fetchWindowIcons: false,
    });
    const match = sources.find((candidate) => candidate.id === source.id);
    if (!match) throw new Error(`The ${source.kind} "${source.title}" is no longer open.`);
    if (match.thumbnail.isEmpty()) {
      throw new Error(
        `The ${source.kind} "${source.title}" could not be captured. A minimized window shows no picture.`,
      );
    }
    return jpegFrame(match.thumbnail);
  }

  async takePhoto(maxDimension: number): Promise<EyesFrame> {
    this.#prepareCameraSession();
    const window = new BrowserWindow({
      show: false,
      width: 320,
      height: 240,
      webPreferences: { partition: CAMERA_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    this.#cameraOpen = true;
    try {
      await window.loadURL(CAMERA_URL);
      const dataUrl = parseCameraPicture(
        await withTimeout(window.webContents.executeJavaScript(cameraScript(maxDimension), true), CAMERA_TIMEOUT_MS),
      );
      const image = nativeImage.createFromDataURL(dataUrl);
      if (image.isEmpty()) throw new Error("The camera returned no picture.");
      return jpegFrame(image);
    } catch (error) {
      throw new Error(cameraErrorMessage(error));
    } finally {
      this.#cameraOpen = false;
      window.destroy();
    }
  }

  #prepareCameraSession(): void {
    if (this.#cameraSessionReady) return;
    const camera = session.fromPartition(CAMERA_PARTITION);
    camera.protocol.handle(
      EYES_CAMERA_SCHEME,
      () =>
        new Response("<!doctype html><title>COSGRAL camera</title>", {
          headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
        }),
    );
    camera.setPermissionRequestHandler((_contents, permission, callback, details) => {
      const mediaTypes = "mediaTypes" in details ? (details.mediaTypes ?? []) : [];
      callback(
        this.#cameraOpen &&
          permission === "media" &&
          mediaTypes.length > 0 &&
          mediaTypes.every((type) => type === "video"),
      );
    });
    camera.setPermissionCheckHandler((_contents, permission) => this.#cameraOpen && permission === "media");
    this.#cameraSessionReady = true;
  }
}

/** The hidden camera page returns a JPEG data URL; anything else is not a picture. */
function parseCameraPicture(value: unknown): string {
  if (!isString(value) || !value.startsWith("data:image/jpeg;base64,")) {
    throw new Error("The camera returned no picture.");
  }
  return value;
}

function jpegFrame(image: NativeImage): EyesFrame {
  const size = image.getSize();
  return { mimeType: "image/jpeg", bytes: image.toJPEG(JPEG_QUALITY), width: size.width, height: size.height };
}

function cameraScript(maxDimension: number): string {
  return `(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    try {
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 500));
      const scale = Math.min(1, ${maxDimension} / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.85);
    } finally {
      for (const track of stream.getTracks()) track.stop();
    }
  })()`;
}

function cameraErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/NotAllowedError|Permission/i.test(text)) {
    return "Camera access is blocked. In Windows Settings > Privacy & security > Camera, let desktop apps use the camera.";
  }
  if (/NotFoundError|Requested device not found/i.test(text)) return "No camera was found on this computer.";
  if (/NotReadableError|Could not start video source/i.test(text)) return "The camera is in use by another app.";
  if (/timed out/i.test(text)) return "The camera did not respond in time.";
  return text;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The camera timed out.")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
