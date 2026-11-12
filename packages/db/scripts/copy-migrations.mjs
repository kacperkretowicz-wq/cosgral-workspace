import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src", "migrations");
const destDir = path.join(root, "dist", "migrations");
const destMeta = path.join(destDir, "meta");

fs.rmSync(destDir, { recursive: true, force: true });
fs.mkdirSync(destMeta, { recursive: true });

for (const name of fs.readdirSync(srcDir)) {
  if (name.endsWith(".sql")) {
    fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  }
}

fs.copyFileSync(
  path.join(srcDir, "meta", "_journal.json"),
  path.join(destMeta, "_journal.json"),
);

console.log(`Copied migrations → ${destDir}`);
