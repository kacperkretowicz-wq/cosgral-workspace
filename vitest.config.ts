import { fileURLToPath } from "node:url";
import solidPlugin from "@solidjs/vite-plugin";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [solidPlugin()],
  resolve: {
    // COSGRAL W3: the Solid plugin makes tests resolve the "browser" build of `ws`, which has no server. The
    // program itself (Node and Electron) always uses the real one; tests of the remote desktop host need it too.
    alias: { ws: fileURLToPath(new URL("./node_modules/ws/wrapper.mjs", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    fileParallelism: false,
    setupFiles: ["./src/renderer/src/setupTests.ts"],
    exclude: [...configDefaults.exclude, "apps/**", "tests/visual/**"],
  },
});
