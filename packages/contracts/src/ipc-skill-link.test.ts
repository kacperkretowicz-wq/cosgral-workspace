import { describe, expect, it } from "vitest";
import { parseGithubSkillLink, SKILL_LINK_LIMITS, SKILL_LINK_REVIEW } from "./ipc-skill-link";

function link(text: unknown) {
  const result = parseGithubSkillLink(text);
  if (!result.ok) throw new Error(result.reason);
  return result.link;
}

function reason(text: unknown): string {
  const result = parseGithubSkillLink(text);
  if (result.ok) throw new Error("The link was accepted.");
  return result.reason;
}

describe("a GitHub link to a skill (W12 BE-Q)", () => {
  it("reads a repository and a folder inside it, and writes the address in its plain form", () => {
    expect(link("https://github.com/acme/skills")).toEqual({
      owner: "acme",
      repo: "skills",
      ref: null,
      path: "",
      address: "https://github.com/acme/skills",
    });
    expect(link("  https://github.com/acme/skills.git/ ")).toMatchObject({ repo: "skills", ref: null });
    expect(link("https://github.com/acme/skills/tree/main/writing/blog-post/")).toEqual({
      owner: "acme",
      repo: "skills",
      ref: "main",
      path: "writing/blog-post",
      address: "https://github.com/acme/skills/tree/main/writing/blog-post",
    });
    expect(link("https://GitHub.com/acme/skills/tree/v1.2.0")).toMatchObject({ ref: "v1.2.0", path: "" });
  });

  it("refuses other hosts, plain http, secrets in the address, a query and a fragment", () => {
    expect(reason("https://raw.githubusercontent.com/acme/skills/main/SKILL.md")).toContain("github.com");
    expect(reason("https://gist.github.com/acme/abc")).toContain("github.com");
    expect(reason("http://github.com/acme/skills")).toContain("https");
    expect(reason("https://user:pass@github.com/acme/skills")).toContain("user name");
    expect(reason("https://github.com/acme/skills?tab=readme")).toContain("query");
    expect(reason("https://github.com/acme/skills#readme")).toContain("fragment");
  });

  it("refuses a path that leaves the folder or uses odd characters", () => {
    expect(reason("https://github.com/acme/skills/tree/main/../secrets")).toContain("..");
    expect(reason("https://github.com/acme/skills/tree/main/a%2Fb")).toContain("characters");
    expect(reason("https://github.com/acme/skills/tree/main/my skill")).toContain("characters");
    expect(reason("https://github.com/acme/skills/blob/main/SKILL.md")).toContain("folder");
    expect(reason("https://github.com/acme/skills/tree/")).toContain("branch");
    expect(reason("https://github.com/acme")).toContain("owner and a repository");
  });

  it("refuses empty, long and non-text input", () => {
    expect(reason("")).toContain("Paste");
    expect(reason(5)).toContain("Paste");
    expect(reason(`https://github.com/acme/${"a".repeat(SKILL_LINK_LIMITS.url)}`)).toContain("too long");
    expect(reason("not an address")).toContain("not a valid address");
  });

  it("lists what the install must check, with the limits of a skill folder", () => {
    expect(SKILL_LINK_REVIEW.length).toBe(5);
    expect(SKILL_LINK_LIMITS).toMatchObject({ files: 200, bytes: 10 * 1024 * 1024 });
    expect(SKILL_LINK_REVIEW.join(" ")).toContain("approves on the card");
  });
});
