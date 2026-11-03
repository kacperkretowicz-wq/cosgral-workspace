import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const source = new URL("../src/cliplab/", import.meta.url);
const destination = new URL("../dist/cliplab/", import.meta.url);
await mkdir(fileURLToPath(destination), { recursive: true });
for (const name of ["LICENSE", "PROVENANCE.md"]) {
  await copyFile(new URL(name, source), new URL(name, destination));
}
