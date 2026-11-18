// COSGRAL W12 (BE-Q): the first, safe half of "install a skill from a GitHub link" (owner question 5): reading the link. Nothing here
// contacts GitHub, downloads or installs anything; the install itself (fetch, review, approval card) waits for the owner's yes.
//
// A link is accepted only when it names ONE folder of a public repository in the form people copy from the address bar:
//   https://github.com/<owner>/<repo>                      the repository root
//   https://github.com/<owner>/<repo>/tree/<ref>/<path>    a folder inside it (ref = one segment: a branch, a tag or a commit)
// Everything else is refused with a plain sentence: other hosts (also raw.githubusercontent.com and gists), plain http, user:password
// in the address, a query or fragment, ".." in the path, odd characters. `SKILL_LINK_REVIEW` is the list of what the engine must check
// and show on the approval card BEFORE a file is kept (the limits are the same as for a skill folder of this program).

import { isString } from "./runtime-values";

export const SKILL_LINK_LIMITS = {
  url: 300,
  /** Files in a skill folder and its size: the same limits as every skill of this program. */
  files: 200,
  bytes: 10 * 1024 * 1024,
} as const;

/** What the install must do and show, in the order of the approval card. The engine must refuse the install when one of these fails. */
export const SKILL_LINK_REVIEW = [
  "Show the address, the owner and the repository, and say that the code comes from the internet and was not written by this program.",
  "List every file with its size before anything is kept; refuse more than 200 files or more than 10 MB.",
  "Refuse links that point outside the repository folder (symbolic links, paths with ..), and files that are not plain text or small assets.",
  "Show the instructions of the skill (SKILL.md) in full on the card, so the person reads what the agent will be told.",
  "Install only after the person approves on the card; never from a message of an agent, a routine or a webhook.",
] as const;

export interface GithubSkillLink {
  owner: string;
  repo: string;
  /** One segment (branch, tag or commit), or null = the default branch. */
  ref: string | null;
  /** The folder inside the repository, without slashes at the ends; "" = the root. */
  path: string;
  /** The address in its plain form (no trailing slash, no ".git"), for the approval card. */
  address: string;
}

export type SkillLinkResult = { ok: true; link: GithubSkillLink } | { ok: false; reason: string };

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const SEGMENT = /^[A-Za-z0-9._-]+$/;

function refuse(reason: string): SkillLinkResult {
  return { ok: false, reason };
}

export function parseGithubSkillLink(input: unknown): SkillLinkResult {
  if (!isString(input) || input.trim().length === 0) return refuse("Paste the address of a skill folder on GitHub.");
  const text = input.trim();
  if (text.length > SKILL_LINK_LIMITS.url) return refuse("This address is too long.");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return refuse("This is not a valid address. Example: https://github.com/owner/repository/tree/main/my-skill");
  }
  if (url.protocol !== "https:") return refuse("Only https:// addresses are accepted.");
  if (url.username || url.password) return refuse("The address must not contain a user name or a password.");
  if (url.hostname.toLowerCase() !== "github.com") return refuse("Only github.com addresses are accepted.");
  if (url.search || url.hash) return refuse("The address must not have a query (?) or a fragment (#).");
  // `new URL` resolves ".." away; the person's text is checked as it was written.
  const rawPath = text.replace(/^https:\/\/[^/]*/i, "");
  if (/(^|\/)(\.|\.\.|%2e|%2e%2e)(\/|$)/i.test(rawPath)) return refuse("The folder must not contain . or .. parts.");
  const parts = url.pathname.split("/").filter((part) => part.length > 0);
  if (parts.length < 2) return refuse("The address must name an owner and a repository.");
  const owner = parts[0] ?? "";
  const repo = (parts[1] ?? "").replace(/\.git$/i, "");
  if (!NAME.test(owner) || !NAME.test(repo))
    return refuse("The owner or the repository has characters GitHub does not use.");
  const rest = parts.slice(2);
  if (rest.length === 0) {
    return { ok: true, link: { owner, repo, ref: null, path: "", address: `https://github.com/${owner}/${repo}` } };
  }
  if (rest[0] !== "tree") return refuse("Use the address of a folder (…/tree/<branch>/<folder>) or of the repository.");
  const ref = rest[1];
  if (!ref) return refuse("The address names no branch after /tree/.");
  const folder = rest.slice(2);
  if (!SEGMENT.test(ref) || ref === "." || ref === "..")
    return refuse("The branch, tag or commit has characters GitHub does not use.");
  for (const segment of folder) {
    if (segment === "." || segment === "..") return refuse("The folder must not contain . or .. parts.");
    if (!SEGMENT.test(segment)) return refuse("The folder name has characters that skills do not use.");
  }
  const path = folder.join("/");
  return {
    ok: true,
    link: {
      owner,
      repo,
      ref,
      path,
      address: `https://github.com/${owner}/${repo}/tree/${ref}${path ? `/${path}` : ""}`,
    },
  };
}
