/**
 * Rasterize COSGRAL icon SVG to PNG + ICO. Own mark (not OpenBot artwork).
 */
import { Resvg } from "@resvg/resvg-js";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "build", "icon.svg"));

function renderPng(size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  });
  return Buffer.from(resvg.render().asPng());
}

const png1024 = renderPng(1024);
const png512 = renderPng(512);
const png256 = renderPng(256);
const png128 = renderPng(128);
const png64 = renderPng(64);
const png48 = renderPng(48);
const png32 = renderPng(32);
const png16 = renderPng(16);

const targets = [
  ["build/icon.png", png1024],
  ["build/icon-dev.png", png512],
  ["build/icon-preview.png", png512],
  ["build/icon-production.png", png512],
  ["src/renderer/src/assets/cosgral-logo-dev.png", png256],
  ["src/renderer/src/assets/cosgral-logo-preview.png", png256],
  ["src/renderer/src/assets/cosgral-logo-production.png", png256],
];

for (const [rel, bytes] of targets) {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
  console.log("wrote", rel, bytes.length);
}

for (const name of ["openbot-logo-dev.png", "openbot-logo-preview.png", "openbot-logo-production.png"]) {
  const p = join(root, "src/renderer/src/assets", name);
  if (existsSync(p)) {
    unlinkSync(p);
    console.log("removed", name);
  }
}

const tmpDir = join(root, "build", ".ico-tmp");
mkdirSync(tmpDir, { recursive: true });
const tmpFiles = [];
for (const [name, buf] of [
  ["16.png", png16],
  ["32.png", png32],
  ["48.png", png48],
  ["64.png", png64],
  ["128.png", png128],
  ["256.png", png256],
]) {
  const p = join(tmpDir, name);
  writeFileSync(p, buf);
  tmpFiles.push(p);
}

const icoBuf = await pngToIco(tmpFiles);
for (const name of ["icon.ico", "icon-dev.ico", "icon-preview.ico", "icon-production.ico"]) {
  writeFileSync(join(root, "build", name), icoBuf);
  console.log("wrote", name, icoBuf.length);
}

rmSync(tmpDir, { recursive: true, force: true });
console.log("done");
