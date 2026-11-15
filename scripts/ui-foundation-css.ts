/** Read declaration values only: CSS selectors and comments are not palette literals. */
export function cssDeclarationValues(source: string): string {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//gu, "");
  return [...withoutComments.matchAll(/(?:^|[;{}])\s*[\w-]+\s*:\s*([^;{}]+)(?=[;}])/gu)]
    .map((match) => match[1])
    .join("; ");
}
