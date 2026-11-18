import { fileURLToPath } from "node:url";
import solidPlugin from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

// Static browser preview (see main.tsx). Output must fit small static hosting:
// every file under 1 MB, total under ~1.8 MB (hosting cap 2 MB).
const root = fileURLToPath(new URL(".", import.meta.url));
const outDir = process.env.COSGRAL_PREVIEW_OUT ?? fileURLToPath(new URL("../../out/web-preview", import.meta.url));
const localeStubs = fileURLToPath(new URL("./locale-stubs.ts", import.meta.url));

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

/**
 * Preview only: drop Inter fonts (~133 KB) and motion CSS sheets; use system fonts.
 * CSS is rewritten after minify, and .woff2 assets are removed from the bundle.
 * Electron / desktop builds are unchanged (this config is only for web-preview).
 */
function previewSystemFonts(): Plugin {
  return {
    name: "cosgral-preview-system-fonts",
    enforce: "pre",
    transform(code, id) {
      const norm = id.replace(/\\/g, "/");
      if (!norm.endsWith("/renderer/src/styles.css")) return null;
      let next = code;
      if (next.includes("./styles/fonts.css")) {
        next = next.replace(
          /@import\s+["']\.\/styles\/fonts\.css["'];?/,
          [
            "/* Preview: system fonts instead of Inter woff2 (hosting size). */",
            ":root {",
            '  --openbot-font-sans: system-ui, "Segoe UI", sans-serif;',
            "  --openbot-font-mono: ui-monospace, Consolas, monospace;",
            "}",
          ].join("\n"),
        );
      }
      next = next.replace(/@import\s+["']\.\/styles\/motion(?:-reveal)?\.css["'];?\s*/g, "");
      return next === code ? null : { code: next, map: null };
    },
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (fileName.endsWith(".woff2")) {
          delete bundle[fileName];
          continue;
        }
        const item = bundle[fileName];
        if (item.type !== "asset" || !fileName.endsWith(".css")) continue;
        const raw = item.source;
        const source = Buffer.isBuffer(raw)
          ? raw.toString("utf8")
          : ArrayBuffer.isView(raw)
            ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf8")
            : String(raw);
        // Minified CSS: strip every @font-face block that pointed at Inter.
        const stripped = source.replace(/@font-face\{[^}]*\}/g, "");
        if (stripped !== source) item.source = stripped;
      }
    },
  };
}

function asForwardSlashes(id: string): string {
  return id.replace(/\\/g, "/");
}

/** Preview only: swap full en/pl catalogs for empty Proxies (~87 KB → ~0.5 KB). */
function previewLocaleStubs(): Plugin {
  return {
    name: "cosgral-preview-locale-stubs",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      const from = asForwardSlashes(importer);
      if (!from.includes("/renderer/src/")) return null;
      if (
        source === "./locales/en" ||
        source === "./locales/pl" ||
        source.endsWith("/locales/en") ||
        source.endsWith("/locales/pl")
      ) {
        return localeStubs;
      }
      if (source.endsWith("/locales/en.ts") || source.endsWith("/locales/pl.ts")) {
        return localeStubs;
      }
      return null;
    },
  };
}

export default defineConfig({
  root,
  base: "./",
  plugins: [
    previewLocaleStubs(),
    previewDemoData(),
    previewSystemFonts(),
    solidPlugin(),
    tailwindcss({ optimize: true }),
  ],
  build: {
    outDir,
    emptyOutDir: true,
    sourcemap: false,
    minify: "esbuild",
    cssMinify: true,
    target: "es2022",
    chunkSizeWarningLimit: 950,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = asForwardSlashes(id);
          // Dictionaries and the Storybook fixtures are large; their own chunks keep every file under 1 MB.
          if (path.includes("/web-preview/locale-stubs") || path.includes("/locales/")) return "locales";
          if (path.includes("/src/renderer/stories/")) return "fixtures";
          if (!path.includes("/node_modules/")) return undefined;
          if (/\/node_modules\/(solid-js|@solidjs)\//.test(path)) return "solid";
          // Keep CSS-in-JS / large UI kits out of the app entry when possible.
          if (/\/node_modules\/(@ark-ui|@floating-ui|lucide-solid|clsx|tailwind-merge)\//.test(path))
            return "ui-vendor";
          return "vendor";
        },
      },
    },
  },
});
