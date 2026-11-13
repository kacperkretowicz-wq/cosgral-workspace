// COSGRAL W3: the Mobile Connect QR code as SVG. Library: qrcode-generator 2.0.4 (Kazuhiko Arase, MIT, no
// dependencies). Error correction "M" (about 15% of the code may be damaged), size chosen by the library.

import qrcode from "qrcode-generator";

export function buildPairingQr(text: string): { svg: string; dataUrl: string; modules: number } {
  const code = qrcode(0, "M");
  code.addData(text, "Byte");
  code.make();
  const svg = code.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  return {
    svg,
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
    modules: code.getModuleCount(),
  };
}
