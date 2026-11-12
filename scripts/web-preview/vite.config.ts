import { fileURLToPath } from "node:url";
import solidPlugin from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

// Static browser preview (see main.tsx). Output must fit small static hosting:
// every file under 1 MB, so vendor code is split from the app code.
const root = fileURLToPath(new URL(".", import.meta.url));
const outDir = process.env.COSGRAL_PREVIEW_OUT ?? fileURLToPath(new URL("../../out/web-preview", import.meta.url));

// The preview is public, so the Storybook fixtures are neutralised for it only:
// no real person's name and no links to another product's site.
const demoReplacements: Array<[RegExp, string]> = [
  [/Norbert/g, "Owner"],
  [/"norbert"/g, '"owner"'],
  [/https:\/\/openbot\.run\/docs/g, "https://example.com/docs"],
];

function previewDemoData(): Plugin {
  return {
    name: "cosgral-preview-demo-data",
    enforce: "pre",
    transform(code, id) {
      if (!/[\\/]src[\\/]renderer[\\/]stories[\\/]/.test(id)) return null;
      let next = code;
      for (const [pattern, replacement] of demoReplacements) next = next.replace(pattern, replacement);
      return next === code ? null : { code: next, map: null };
    },
  };
}

export default defineConfig({
  root,
  base: "./",
  plugins: [previewDemoData(), solidPlugin(), tailwindcss({ optimize: false })],
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 950,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/node_modules[\\/](solid-js|@solidjs)[\\/]/.test(id)) return "solid";
          return "vendor";
        },
      },
    },
  },
});
