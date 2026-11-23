import path from "node:path";
import { fileURLToPath } from "node:url";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

// COSGRAL (23.11, owner's Windows, 4 cores): with the default number of browsers at once, play functions timed out in
// about one full run in two (all green alone); two at once was stable and even faster. COSGRAL_STORYBOOK_WORKERS=<n>
// sets another number on a bigger computer.
const workers = Math.max(1, Number(process.env.COSGRAL_STORYBOOK_WORKERS) || 2);

export default defineConfig({
  test: {
    maxWorkers: workers,
    projects: [
      {
        plugins: [storybookTest({ configDir: path.join(dirname, ".storybook") })],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
