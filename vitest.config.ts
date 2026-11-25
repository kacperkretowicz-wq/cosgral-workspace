import { fileURLToPath } from "node:url";
import solidPlugin from "@solidjs/vite-plugin";
import { configDefaults, defineConfig } from "vitest/config";

// COSGRAL W12 (BE-P): the limits below are vitest's own defaults; COSGRAL_TEST_TIMEOUT_SCALE=3 multiplies them (and the limits of the
// slow suites, see src/backend/testing/timeouts.ts) for a full run on a busy computer. Without the variable nothing changes.
const timeoutScale = Math.max(1, Number(process.env.COSGRAL_TEST_TIMEOUT_SCALE) || 1);

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
    testTimeout: 5_000 * timeoutScale,
    hookTimeout: 10_000 * timeoutScale,
    teardownTimeout: 10_000 * timeoutScale,
    setupFiles: ["./src/renderer/src/setupTests.ts"],
    exclude: [...configDefaults.exclude, "apps/**", "resources/builtin-skills/**", "tests/visual/**"],
  },
});
