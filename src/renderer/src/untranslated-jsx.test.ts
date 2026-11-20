import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

/**
 * Every visible string in a component goes through `t()`. A bare word in JSX (`<Button>Remove</Button>`), a title or
 * placeholder written as a plain attribute, or a string inside `cond ? "A" : "B"` is never translated, so the Polish
 * interface shows it in English. This test finds them; the few below are meant to stay as they are.
 */
const ROOT = join(__dirname, "components");
const ATTRIBUTES = new Set(["title", "placeholder", "aria-label", "alt", "label", "aria-description"]);

/** Brand and provider names, the two language names (each in its own language), protocol names, units, an example. */
const ALLOWED = new Set([
  "COSGRAL",
  "English",
  "Polski",
  "Codex",
  "Claude",
  "stdio",
  "HTTP",
  "MB",
  "MB ·",
  "launch-team",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx$/.test(entry.name) && !/\.(test|stories)\.tsx$/.test(entry.name) ? [path] : [];
  });
}

function hasWords(value: string): boolean {
  return /[A-Za-z]{2,}/.test(value);
}

function findings(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const report = (node: ts.Node, kind: string, value: string) => {
    if (ALLOWED.has(value)) return;
    const { line } = source.getLineAndCharacterOfPosition(node.getStart());
    found.push(`${relative(ROOT, file)}:${line + 1} ${kind} "${value}"`);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.getText().replace(/\s+/g, " ").trim();
      if (hasWords(text)) report(node, "text", text);
    }
    if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer)) {
      if (ATTRIBUTES.has(node.name.getText()) && hasWords(node.initializer.text)) {
        report(node, `${node.name.getText()}=`, node.initializer.text);
      }
    }
    if (
      ts.isJsxExpression(node) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      node.expression &&
      ts.isConditionalExpression(node.expression)
    ) {
      for (const branch of [node.expression.whenTrue, node.expression.whenFalse]) {
        if (ts.isStringLiteral(branch) && hasWords(branch.text)) report(branch, "choice", branch.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

it("has no visible string in a component that skips t()", () => {
  const files = sourceFiles(ROOT);
  expect(files.length).toBeGreaterThan(100);
  expect(files.flatMap(findings)).toEqual([]);
});
