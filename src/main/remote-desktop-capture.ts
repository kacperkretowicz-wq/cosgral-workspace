// COSGRAL W3: the host's picture on Electron: the main display through desktopCapturer, as a JPEG. The area it
// covers is given in physical pixels of the virtual screen, which is what the Windows driver clicks in.

import { desktopCapturer, screen } from "electron";
import type { FrameSource, HostFrame } from "../backend/remote-desktop-host";

const JPEG_QUALITY = 60;

export class ElectronFrameSource implements FrameSource {
  async capture(maxDimension: number): Promise<HostFrame> {
    const display = screen.getPrimaryDisplay();
    // Physical pixels (Windows scales displays); this is where the driver's coordinates live.
    const area = screen.dipToScreenRect(null, display.bounds);
    const scale = Math.min(1, maxDimension / Math.max(area.width, area.height));
    const thumbnailSize = {
      width: Math.max(1, Math.round(area.width * scale)),
      height: Math.max(1, Math.round(area.height * scale)),
    };
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize, fetchWindowIcons: false });
    const source = sources.find((candidate) => candidate.display_id === String(display.id)) ?? sources[0];
    if (!source || source.thumbnail.isEmpty()) throw new Error("The screen could not be captured.");
    const size = source.thumbnail.getSize();
    return {
      jpeg: source.thumbnail.toJPEG(JPEG_QUALITY),
      width: size.width,
      height: size.height,
      area: { x: area.x, y: area.y, width: area.width, height: area.height },
    };
  }
}
