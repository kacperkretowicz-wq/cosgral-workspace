import { traits, VERSION } from "blobatar";
import { blobatar, layout } from "blobatar/blob";
import { describe, expect, it } from "vitest";
import { avatarCandidateSeeds, avatarHeadColor, buildAnimatedAvatarSvg, ownAvatarBody } from "./blobatar";

const avatarGeometryMarkup = (markup: string) => {
  const document = new DOMParser().parseFromString(markup, "image/svg+xml");
  // Shading (gradients, the highlight, eye catchlights) is decoration on top of the package geometry.
  return Array.from(document.querySelectorAll("circle, ellipse, line, path, polygon, polyline, rect"))
    .filter((element) => !element.closest("defs, [data-shade]"))
    .map((element) => element.outerHTML.replace(/ fill="url\(#[^)]+\)"/u, ""));
};

/** The two own bodies replace the whole body; the two eye shapes must still match the package. */
const withoutOwnBody = (seed: string, geometry: string[]) => (ownAvatarBody(seed) ? geometry.slice(-2) : geometry);

describe("animated Blobatar adapter", () => {
  it("uses the current Blobatar generation", () => {
    expect(VERSION).toBe("2.0.0");
  });

  it("renders stable motion markup for the same agent seed", () => {
    const first = buildAnimatedAvatarSvg("chief", null);
    const second = buildAnimatedAvatarSvg("chief", null);

    expect(second).toBe(first);
    expect(first).toContain('class="mo-root"');
    expect(first).toContain('class="mo-breathe"');
    expect(first).toContain('class="mo-eyes"');
    expect(first.match(/class="mo-eye"/g)).toHaveLength(2);
  });

  it("uses continuous motion only when requested", () => {
    expect(buildAnimatedAvatarSvg("chief", 215, "always")).toContain('class="mo-root mo-always"');
    expect(buildAnimatedAvatarSvg("chief", 215, "hover")).not.toContain("mo-always");
  });

  it("resolves the same head color used by the rendered avatar", () => {
    const seed = "new-agent";
    const markup = buildAnimatedAvatarSvg(seed, 0);

    expect(avatarHeadColor(seed, 0)).toBe(markup.match(/--mo-head:([^;]+)/)?.[1]);
  });

  it("keeps all visible geometry from the pinned Blobatar renderer", () => {
    const seed = "chief:avatar:2:4";
    const hue = 215;

    expect(withoutOwnBody(seed, avatarGeometryMarkup(buildAnimatedAvatarSvg(seed, hue)))).toEqual(
      withoutOwnBody(seed, avatarGeometryMarkup(blobatar(seed, { hue }))),
    );
  });

  it("keeps the current face and all ten package silhouettes in each deterministic set", () => {
    const firstSet = avatarCandidateSeeds("chief", "chief:avatar:4:7", 0);
    const repeatedSet = avatarCandidateSeeds("chief", "chief:avatar:4:7", 0);
    const nextSet = avatarCandidateSeeds("chief", "chief:avatar:4:7", 1);

    expect(firstSet).toEqual(repeatedSet);
    expect(firstSet).toHaveLength(12);
    expect(new Set(firstSet)).toHaveLength(12);
    expect(firstSet[0]).toBe("chief:avatar:4:7");
    expect(new Set(firstSet.map((seed) => layout(traits(seed)).shape))).toEqual(
      new Set(["round", "organic", "boxy", "nub", "cloud", "sun", "capsule", "triangle", "hexagon", "droplet"]),
    );
    expect(nextSet[0]).toBe(firstSet[0]);
    expect(nextSet.slice(1)).not.toEqual(firstSet.slice(1));
  });

  it("adds motion markup without changing any version 2 silhouette", () => {
    const seeds = avatarCandidateSeeds("chief", "chief:avatar:4:7", 0);

    for (const seed of seeds) {
      const animated = buildAnimatedAvatarSvg(seed, 215);
      expect(animated).toContain('class="mo-root"');
      expect(animated.match(/class="mo-eye"/gu)).toHaveLength(2);
      expect(withoutOwnBody(seed, avatarGeometryMarkup(animated))).toEqual(
        withoutOwnBody(seed, avatarGeometryMarkup(blobatar(seed, { hue: 215 }))),
      );
    }
  });
});

describe("avatar finish", () => {
  it("gives the body volume: a shaded fill, a clipped highlight and a catchlight in each eye", () => {
    const markup = buildAnimatedAvatarSvg("chief", 215);
    const document = new DOMParser().parseFromString(markup, "image/svg+xml");
    const gradient = document.querySelector("defs radialGradient");
    expect(gradient?.querySelectorAll("stop")).toHaveLength(3);
    const body = document.querySelector(".mo-bob > g");
    expect(body?.getAttribute("fill")).toBe(`url(#${gradient?.id})`);
    const highlight = document.querySelector("[data-shade='highlight']");
    expect(highlight?.getAttribute("clip-path")).toMatch(/^url\(#.+\)$/u);
    expect(document.querySelectorAll(".mo-eye [data-shade='catchlight']")).toHaveLength(2);
  });

  it("keeps ids stable per face and colour, and different between colours", () => {
    const ids = (markup: string) => [...markup.matchAll(/ id="([^"]+)"/gu)].map((match) => match[1]);
    expect(ids(buildAnimatedAvatarSvg("chief", 215))).toEqual(ids(buildAnimatedAvatarSvg("chief", 215)));
    expect(ids(buildAnimatedAvatarSvg("chief", 215))).not.toEqual(ids(buildAnimatedAvatarSvg("chief", 0)));
  });
});

describe("own avatar shapes", () => {
  it("offers all 12 body shapes among the 12 face candidates", () => {
    const bodies = new Set(
      avatarCandidateSeeds("agent", "agent:start", 0).map((seed) => ownAvatarBody(seed) ?? layout(traits(seed)).shape),
    );
    expect(bodies.size).toBe(12);
    expect(bodies.has("ghost")).toBe(true);
    expect(bodies.has("flower")).toBe(true);
  });

  it("draws the own bodies with the same eyes and colour as any avatar", () => {
    const seed = Array.from({ length: 400 }, (_, index) => `s${index}`).find(
      (candidate) => ownAvatarBody(candidate) === "ghost",
    );
    if (!seed) throw new Error("no ghost seed in range");
    const markup = buildAnimatedAvatarSvg(seed, 150);
    expect(markup).toContain("M17 86V47");
    expect(markup.match(/class="mo-eye"/g)).toHaveLength(2);
    expect(markup).toContain("--mo-head");
  });
});

describe("avatar moods", () => {
  const parse = (markup: string) => new DOMParser().parseFromString(markup, "image/svg+xml");

  it("keeps the idle face identical to the default call", () => {
    expect(buildAnimatedAvatarSvg("chief", 215, "hover", "idle")).toBe(buildAnimatedAvatarSvg("chief", 215));
    expect(buildAnimatedAvatarSvg("chief", 215)).not.toContain("data-mood");
  });

  it("marks every mood on the root and keeps the motion structure and the body", () => {
    for (const mood of ["working", "needs-you", "happy", "error", "limited"] as const) {
      const document = parse(buildAnimatedAvatarSvg("chief", 215, "hover", mood));
      expect(document.querySelector(".mo-root")?.getAttribute("data-mood")).toBe(mood);
      expect(document.querySelectorAll(".mo-eye")).toHaveLength(2);
      expect(document.querySelector(".mo-bob > g")?.getAttribute("fill")).toMatch(/^url\(#/u);
    }
  });

  it("draws a still face per mood, so it reads without motion", () => {
    const idle = parse(buildAnimatedAvatarSvg("chief", 215));
    const eyePaths = (document: Document) =>
      Array.from(document.querySelectorAll(".mo-eye > path")).map((path) => path.getAttribute("d"));

    const working = parse(buildAnimatedAvatarSvg("chief", 215, "hover", "working"));
    expect(eyePaths(working)).not.toEqual(eyePaths(idle));

    const happy = parse(buildAnimatedAvatarSvg("chief", 215, "hover", "happy"));
    expect(happy.querySelectorAll("[data-face='smiling-eye']")).toHaveLength(2);
    expect(happy.querySelectorAll("[data-shade='blush']")).toHaveLength(2);

    const needsYou = parse(buildAnimatedAvatarSvg("chief", 215, "hover", "needs-you"));
    expect(needsYou.querySelectorAll("[data-shade='brow']")).toHaveLength(2);

    expect(
      parse(buildAnimatedAvatarSvg("chief", 215, "hover", "error")).querySelector("[data-shade='sweat']"),
    ).not.toBeNull();
    expect(
      parse(buildAnimatedAvatarSvg("chief", 215, "hover", "limited")).querySelector("[data-shade='zz']"),
    ).not.toBeNull();
  });

  it("does not put a glint on closed or squinting eyes", () => {
    expect(
      parse(buildAnimatedAvatarSvg("chief", 215, "hover", "limited")).querySelectorAll("[data-shade='catchlight']"),
    ).toHaveLength(0);
    expect(
      parse(buildAnimatedAvatarSvg("chief", 215, "hover", "happy")).querySelectorAll("[data-shade='catchlight']"),
    ).toHaveLength(0);
  });

  it("renders every mood for all twelve body shapes", () => {
    for (const seed of avatarCandidateSeeds("chief", "chief:avatar:4:7", 0)) {
      for (const mood of ["working", "needs-you", "happy", "error", "limited"] as const) {
        const markup = buildAnimatedAvatarSvg(seed, null, "hover", mood);
        expect(markup).toContain(`data-mood="${mood}"`);
      }
    }
  });
});
