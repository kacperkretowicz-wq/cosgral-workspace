import { configure } from "storybook/test";
import type { Preview } from "storybook-solidjs-vite";
import "./preview.css";
import "../src/renderer/src/styles.css";

// findBy… and waitFor in play functions wait up to 5 s instead of 1 s. On a busy computer (a full run on the owner's
// 4-core Windows) different stories timed out now and then while every one of them passed alone; a real failure
// still fails, only later.
configure({ asyncUtilTimeout: 5_000 });

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    a11y: {
      test: "error",
    },
    controls: {
      expanded: true,
    },
  },
};

export default preview;
