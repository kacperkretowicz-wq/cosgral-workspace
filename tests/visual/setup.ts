import { beforeEach } from "vitest";

// Screenshots are compared pixel by pixel: wait for the bundled face, or the first frame uses the fallback.
beforeEach(async () => {
  await Promise.all(
    ["380", "470", "570"].map((weight) => document.fonts.load(`${weight} 16px "Jost Variable"`, "Aąęłóśżź 0123")),
  );
  await document.fonts.ready;
});
