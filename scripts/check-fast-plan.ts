// COSGRAL W12 (BE-U): the plan of `bun run check:fast`. From the list of files a change touched it says which of the checks must run and
// which can be skipped without hiding a failure: the files Biome must read, the type checks of the projects that can see the files,
// the tests that were changed and the tests that import a changed file (`vitest related`). Pure functions, no files and no processes,
// so the rules have their own test (check-fast-plan.test.ts). The runner is check-fast.ts.
//
// The fast check is NOT the full check. It answers "did my change break something it can reach" in minutes; the full check
// (`node scripts/quiet-check.ts`) stays before a push. A change that can reach everything (a config, the lock file, a build setting)
// is refused: `needsFullCheck` says so, and the runner ends red instead of pretending.

export type TypecheckProject = "contracts" | "node" | "renderer" | "storybook" | "api" | "mobile-app";

export interface FastPlan {
  /** Every changed path (forward slashes), as given. */
  changed: string[];
  /** Run `check:ui` (the rules of the screens): a screen file, a style or a component changed. */
  runUiCheck: boolean;
  /** Existing files Biome reads (formatting and lint rules), only the changed ones. */
  biomeFiles: string[];
  /** Type-check projects, in a stable order; only the ones that can see a changed file. */
  typecheck: TypecheckProject[];
  /** Changed test files that still exist: they run themselves. */
  testFiles: string[];
  /** Changed files that are not tests: `vitest related` runs the tests that import them. */
  relatedSources: string[];
  /** A change that can reach every test or every build: the fast check refuses to be the whole answer. */
  needsFullCheck: string[];
  /** Plain sentences about what was skipped and why. */
  notes: string[];
}

const BIOME_EXTENSIONS = /\.(?:ts|tsx|js|jsx|mjs|cjs|json|jsonc|css)$/i;
const TEST_FILE = /\.test\.(?:ts|tsx)$/;
const SOURCE_FILE = /\.(?:ts|tsx)$/;

/** Paths whose change can reach every test or the build: not for a "related" shortcut. */
const GLOBAL_FILES = [
  /^package\.json$/,
  /^bun\.lock(?:b)?$/,
  /^tsconfig[^/]*\.json$/,
  /^vitest[^/]*\.config\.ts$/,
  /^biome\.jsonc?$/,
  /^electron\.vite\.config\.ts$/,
  /^electron-builder[^/]*\.ya?ml$/,
  /^\.storybook\//,
  /^src\/renderer\/src\/setupTests\.ts$/,
  /^packages\/contracts\/package\.json$/,
  /^packages\/contracts\/tsconfig[^/]*\.json$/,
  /^apps\/auth-api\/package\.json$/,
];

/** Paths that change no code and no build: documents, notes, logs. They need no check at all. */
const INERT_FILES = [/^docs\//, /\.md$/i, /^COSGRAL-CHANGES\.md$/, /^\.vitest-attachments\//, /^dist\//, /^out\//];

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isInert(path: string): boolean {
  return INERT_FILES.some((pattern) => pattern.test(path));
}

function typecheckFor(path: string): TypecheckProject[] {
  if (path.startsWith("packages/contracts/")) return ["contracts", "node", "renderer", "storybook"];
  if (path.startsWith("src/mobile-app/")) return ["mobile-app"];
  if (path.startsWith("apps/auth-api/")) return ["api"];
  if (path.startsWith("src/renderer/")) return ["renderer", "storybook"];
  if (path.startsWith("tests/visual/")) return ["storybook"];
  if (/^(?:src\/(?:backend|main|preload)\/|scripts\/)/.test(path)) return ["node"];
  return [];
}

const PROJECT_ORDER: TypecheckProject[] = ["contracts", "node", "renderer", "storybook", "api", "mobile-app"];

/**
 * `exists` tells whether a changed path is still on disk (a deleted file cannot be read by Biome or run as a test, but it can
 * still break the type check of the files that imported it).
 */
export function planFastCheck(
  changedPaths: readonly string[],
  exists: (path: string) => boolean,
  options: { ordinary?: readonly string[] } = {},
): FastPlan {
  const changed = [...new Set(changedPaths.map(normalizePath).filter(Boolean))].sort();
  const notes: string[] = [];
  const live = changed.filter((path) => !isInert(path));
  const inert = changed.length - live.length;
  if (inert > 0) notes.push(`${inert} document or output file(s) need no check and were skipped.`);

  // `ordinary` = paths the caller checked and found harmless although they match a global pattern (package.json with only its scripts changed).
  const ordinary = new Set((options.ordinary ?? []).map(normalizePath));
  const needsFullCheck = live.filter(
    (path) => !ordinary.has(path) && GLOBAL_FILES.some((pattern) => pattern.test(path)),
  );
  const projects = new Set<TypecheckProject>();
  for (const path of live) for (const project of typecheckFor(path)) projects.add(project);
  if (needsFullCheck.length > 0) for (const project of PROJECT_ORDER) projects.add(project);

  const present = live.filter((path) => exists(path));
  const biomeFiles = present.filter((path) => BIOME_EXTENSIONS.test(path));
  const testFiles = present.filter((path) => TEST_FILE.test(path));
  const relatedSources = present.filter(
    (path) =>
      SOURCE_FILE.test(path) &&
      !TEST_FILE.test(path) &&
      !path.endsWith(".stories.tsx") &&
      !path.startsWith("tests/visual/"),
  );
  const storiesOnly = present.filter((path) => path.endsWith(".stories.tsx") || path.startsWith("tests/visual/"));
  if (storiesOnly.length > 0) {
    notes.push(
      `${storiesOnly.length} story/visual file(s): the Storybook and visual tests are heavy and stay in the full check; here only their types and style rules run.`,
    );
  }

  const runUiCheck = live.some((path) => path.startsWith("src/renderer/") || path === "scripts/ui-foundation-check.ts");
  if (live.length === 0) notes.push("Nothing to check: only documents changed.");

  return {
    changed,
    runUiCheck,
    biomeFiles,
    typecheck: PROJECT_ORDER.filter((project) => projects.has(project)),
    testFiles,
    relatedSources,
    needsFullCheck,
    notes,
  };
}

/** Splits a long list of paths into command lines that stay under the limit of the Windows command line (8191 characters). */
export function chunkPaths(paths: readonly string[], maxLength = 6000): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let length = 0;
  for (const path of paths) {
    const cost = path.length + 3;
    if (current.length > 0 && length + cost > maxLength) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(path);
    length += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
