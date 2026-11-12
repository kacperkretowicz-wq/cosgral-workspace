/**
 * Browser preview of the COSGRAL Workspace interface.
 *
 * Renders the real renderer `App` against the Storybook mock API instead of the
 * Electron preload, so the shell can be clicked through in any browser. All data
 * is demo data from `stories/fixtures.ts`; no agent, file or network call is real.
 */
import { render } from "@solidjs/web";
import "blobatar/motion.css";
import { App } from "../../src/renderer/src/App";
import "../../src/renderer/src/styles.css";
import { STORY_APP_INFO } from "../../src/renderer/stories/fixtures";
import { createMockOpenBot } from "../../src/renderer/stories/mock-openbot";

const mock = createMockOpenBot({ appInfo: { ...STORY_APP_INFO, version: "0.2.0", platform: "win32" } });
window.openbot = mock.api;

const root = document.getElementById("root");
if (!root) {
  throw new Error("Preview root element was not found.");
}

render(() => <App />, root);

// Two agents wait for the user, so the "Needs you" section and the pinned decision are visible.
window.setTimeout(() => {
  mock.emitAgentEvent({
    type: "prompt",
    requestId: "demo-prompt",
    botId: "chief",
    threadId: "thread-chief",
    turnId: "demo-turn-1",
    questions: [
      {
        id: "scope",
        header: "Scope",
        question: "Which part of the W1 round should I start with?",
        isSecret: false,
        options: [
          { label: "Channels", description: "Channels with a lead and tasks." },
          { label: "Folders", description: "Agent folders in the sidebar." },
        ],
      },
    ],
  });
  mock.emitAgentEvent({
    type: "approval",
    approval: {
      requestId: "demo-approval",
      botId: "research",
      threadId: "thread-research",
      turnId: "demo-turn-2",
      kind: "command",
      command: "bun run test",
      cwd: "/mock/COSGRAL/Bots/research",
      reason: "Run the test suite before writing the report.",
      grantRoot: null,
      permissions: null,
    },
  });
}, 800);
