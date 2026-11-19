import type { BotAvatarHue } from "@openbot/contracts/ipc";
import { palette, traits } from "blobatar";
import { blobatar, layout, type Shape } from "blobatar/blob";
import { type Expression, happy, sad, sleepy, surprised, thinking } from "blobatar/expression";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type AvatarMotion = "hover" | "always";

/**
 * What the creature's face says about its agent. Each mood is a still pose from `blobatar/expression`, baked into
 * the geometry, so it reads in a screenshot and with reduced motion; motion only adds to it (see `app-shell.css`).
 */
export type AvatarMood = "idle" | "working" | "needs-you" | "happy" | "error" | "limited";

const MOOD_EXPRESSIONS: Record<Exclude<AvatarMood, "idle">, Expression> = {
  working: thinking,
  "needs-you": surprised,
  happy,
  error: sad,
  limited: sleepy,
};

const BLOBATAR_BODY_VARIANTS = [
  "round",
  "organic",
  "boxy",
  "nub",
  "cloud",
  "sun",
  "capsule",
  "triangle",
  "hexagon",
  "droplet",
] as const satisfies readonly Shape[];

/**
 * Two bodies drawn for COSGRAL on top of the ten Blobatar ones: 12 shapes in all. A seed picks one of the twelve
 * through a stable hash; for the two own shapes the Blobatar body path is replaced and its eyes, colour and motion stay.
 */
export type OwnAvatarBody = "ghost" | "flower";

export function ownAvatarBody(seed: string): OwnAvatarBody | null {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const slot = (hash >>> 0) % 12;
  if (slot === 10) return "ghost";
  if (slot === 11) return "flower";
  return null;
}

const GHOST_PATH = "M17 86V47C17 25 31 12 49 12C67 12 81 25 81 47V86L70 78L59.5 86L49 78L38.5 86L28 78Z";

function flowerPath(): string {
  const points: string[] = [];
  for (let step = 0; step < 72; step += 1) {
    const angle = (step / 72) * Math.PI * 2;
    const radius = 33 + 6 * Math.cos(angle * 8);
    const x = 49 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    points.push(`${step === 0 ? "M" : "L"}${round2(x)} ${round2(y)}`);
  }
  return `${points.join("")}Z`;
}

const OWN_BODY_PATHS: Record<OwnAvatarBody, string> = { ghost: GHOST_PATH, flower: flowerPath() };

function bodyVariantKey(seed: string) {
  return ownAvatarBody(seed) ?? layout(traits(seed)).shape;
}

export const AVATAR_HUE_OPTIONS: ReadonlyArray<{
  hue: BotAvatarHue;
  label: string;
}> = [
  { hue: 0, label: "Red" },
  { hue: 18, label: "Coral" },
  { hue: 30, label: "Orange" },
  { hue: 45, label: "Amber" },
  { hue: 55, label: "Yellow" },
  { hue: 80, label: "Chartreuse" },
  { hue: 100, label: "Lime" },
  { hue: 125, label: "Spring" },
  { hue: 150, label: "Green" },
  { hue: 168, label: "Teal" },
  { hue: 185, label: "Cyan" },
  { hue: 215, label: "Blue" },
  { hue: 245, label: "Indigo" },
  { hue: 265, label: "Purple" },
  { hue: 280, label: "Violet" },
  { hue: 300, label: "Orchid" },
  { hue: 320, label: "Magenta" },
];

export function avatarHueSwatch(hue: BotAvatarHue): string {
  const swatch = palette(hue, true, 0.49).head;
  if (!swatch) throw new Error(`Blobatar did not return a head color for hue ${hue}.`);
  return vividHex(swatch);
}

export function avatarHeadColor(seed: string, hue: BotAvatarHue | null): string {
  const reader = traits(seed);
  const head = palette(hue ?? reader.num("hue", 0, 360), true, reader("tone")).head;
  if (!head) throw new Error(`Blobatar did not return a head color for seed ${seed}.`);
  return vividHex(head);
}

export function avatarCandidateSeeds(botId: string, currentSeed: string, batch: number): string[] {
  const candidates = [currentSeed];
  const missingBodyVariants = new Set<string>([...BLOBATAR_BODY_VARIANTS, "ghost", "flower"]);
  missingBodyVariants.delete(bodyVariantKey(currentSeed));
  let index = 1;

  while (missingBodyVariants.size > 0) {
    const candidate = `${botId}:avatar:${batch}:${index}`;
    index += 1;
    if (candidates.includes(candidate)) continue;
    if (!missingBodyVariants.delete(bodyVariantKey(candidate))) continue;
    candidates.push(candidate);
  }

  while (candidates.length < 12) {
    const candidate = `${botId}:avatar:${batch}:${index}`;
    index += 1;
    if (!candidates.includes(candidate)) candidates.push(candidate);
  }
  return candidates;
}

export function buildAnimatedAvatarSvg(
  seed: string,
  hue: BotAvatarHue | null,
  motion: AvatarMotion = "hover",
  mood: AvatarMood = "idle",
): string {
  const expression = mood === "idle" ? undefined : MOOD_EXPRESSIONS[mood];
  const svgMarkup = blobatar(seed, {
    ...(hue === null ? {} : { hue }),
    ...(expression ? { expression } : {}),
  });
  const document = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = document.documentElement;
  if (svg.localName !== "svg" || svg.querySelector("parsererror")) return svgMarkup;

  // A posed face comes wrapped in one `<g transform>` (the pose lifts or sinks the whole creature).
  const only = svg.children.length === 1 ? svg.children[0] : undefined;
  const poseTransform = only?.localName === "g" ? only.getAttribute("transform") : null;
  const [bodyGroup, eyesGroup] = Array.from((poseTransform !== null && only ? only : svg).children);
  if (!bodyGroup || !eyesGroup) return svgMarkup;
  const own = ownAvatarBody(seed);
  if (own) {
    const ownPath = document.createElementNS(SVG_NAMESPACE, "path");
    ownPath.setAttribute("d", OWN_BODY_PATHS[own]);
    bodyGroup.replaceChildren(ownPath);
  }

  const reader = traits(seed);
  const baseLayout = layout(reader);
  const resolvedLayout = expression ? expression.bake(baseLayout, expression.p).l : baseLayout;
  const eyeElements = Array.from(eyesGroup.children);
  if (eyeElements.length !== resolvedLayout.eyes.length) return svgMarkup;

  // Stronger colour than Blobatar's own (owner, 19.11: "mocniejsze kolory stworków, jak w OpenBocie").
  const headColor = vividHex(bodyGroup.getAttribute("fill") ?? "#000000");
  const eyeColor = eyesGroup.getAttribute("fill") ?? "#ffffff";
  const shadeId = avatarShadeId(seed, hue);
  const shade = addBodyShading(document, bodyGroup, headColor, shadeId, resolvedLayout.body);

  eyesGroup.classList.add("mo-eyes");
  eyeElements.forEach((element, index) => {
    const eye = resolvedLayout.eyes[index];
    if (!eye) return;
    const wrapper = document.createElementNS(SVG_NAMESPACE, "g");
    wrapper.setAttribute("class", "mo-eye");
    wrapper.setAttribute(
      "style",
      [
        `--mo-wrap:${index === 0 ? -1 : 1}`,
        `--mo-lean:${round2(eye.rot)}`,
        `transform-origin:${round2(eye.cx)}px ${round2(eye.cy)}px`,
      ].join(";"),
    );
    eyesGroup.insertBefore(wrapper, element);
    wrapper.append(mood === "happy" ? smilingEye(document, eye, eyeColor) : element);
    if (mood === "happy") element.remove();
    // A glint needs an open eye; on a closed or squinting one it reads as a crack.
    if (Math.min(eye.rx, eye.ry) >= 1.4 && eye.ry >= 2.6) wrapper.append(catchlight(document, eye));
  });

  const root = document.createElementNS(SVG_NAMESPACE, "g");
  root.setAttribute("class", motion === "always" ? "mo-root mo-always" : "mo-root");
  if (mood !== "idle") root.setAttribute("data-mood", mood);
  root.setAttribute(
    "style",
    serializeMotionVariables({
      ...motionVariables(reader),
      "--mo-head": headColor,
      "--mo-eye": eyeColor,
    }),
  );
  const moodGroup = document.createElementNS(SVG_NAMESPACE, "g");
  moodGroup.setAttribute("class", "mo-mood");
  const breathe = document.createElementNS(SVG_NAMESPACE, "g");
  breathe.setAttribute("class", "mo-breathe");
  const bob = document.createElementNS(SVG_NAMESPACE, "g");
  bob.setAttribute("class", "mo-bob");
  const features = moodFeatures(document, mood, resolvedLayout.eyes, shadeId);
  bob.append(bodyGroup, shade.rim, shade.highlight, ...features.underEyes, eyesGroup, ...features.overEyes);
  if (poseTransform) {
    const pose = document.createElementNS(SVG_NAMESPACE, "g");
    pose.setAttribute("class", "mo-pose");
    pose.setAttribute("transform", poseTransform);
    pose.append(bob);
    breathe.append(pose);
  } else {
    breathe.append(bob);
  }
  moodGroup.append(breathe);
  root.append(moodGroup);
  svg.replaceChildren(shade.defs, root);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Small marks a pose cannot make with two eyes: cheeks when the agent has news for you, a sweat drop on an error,
 * a "z" when it waits for its usage limit. Decoration (`data-shade`), never package geometry.
 */
function moodFeatures(
  document: Document,
  mood: AvatarMood,
  eyes: readonly Ellipse[],
  shadeId: string,
): { underEyes: Element[]; overEyes: Element[] } {
  const element = (name: string, attributes: Record<string, string | number>) => {
    const node = document.createElementNS(SVG_NAMESPACE, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const [left, right] = eyes;
  if (!left || !right) return { underEyes: [], overEyes: [] };
  const outerX = Math.max(left.cx, right.cx) + Math.max(left.rx, right.rx);
  const topY = Math.min(left.cy - left.ry, right.cy - right.ry);
  if (mood === "happy") {
    const cheeks = [left, right].map((eye, index) =>
      element("ellipse", {
        "data-shade": "blush",
        cx: round2(eye.cx + (index === 0 ? -1 : 1) * Math.max(2.2, eye.rx * 0.5)),
        cy: round2(eye.cy + Math.max(eye.ry, 2) + 4.6),
        rx: 5.2,
        ry: 2.9,
        fill: "#ff5f8f",
        "fill-opacity": 0.55,
        "clip-path": `url(#${shadeId}-clip)`,
      }),
    );
    return { underEyes: cheeks, overEyes: [] };
  }
  if (mood === "needs-you") {
    // Raised brows: the eyes are already wide, the brows make it "looking at you".
    const brows = [left, right].map((eye, index) => {
      const side = index === 0 ? -1 : 1;
      const y = round2(eye.cy - eye.ry - 3.6);
      const inner = round2(eye.cx - side * 2.6);
      const outer = round2(eye.cx + side * 3.4);
      return element("path", {
        "data-shade": "brow",
        d: `M${inner} ${round2(y + 0.6)}Q${round2(eye.cx + side * 0.6)} ${round2(y - 2.2)} ${outer} ${round2(y + 0.4)}`,
        style: "fill:none;stroke:var(--mo-eye);stroke-width:1.7;stroke-linecap:round",
      });
    });
    return { underEyes: [], overEyes: brows };
  }
  if (mood === "error") {
    const x = round2(outerX + 5.5);
    const y = round2(topY - 1);
    return {
      underEyes: [],
      overEyes: [
        element("path", {
          "data-shade": "sweat",
          d: `M${x} ${round2(y - 5.2)}C${round2(x + 3.6)} ${round2(y - 0.4)} ${round2(x + 3.6)} ${round2(y + 3.4)} ${x} ${round2(y + 3.4)}C${round2(x - 3.6)} ${round2(y + 3.4)} ${round2(x - 3.6)} ${round2(y - 0.4)} ${x} ${round2(y - 5.2)}Z`,
          fill: "#9fd8ff",
          stroke: "#ffffff",
          "stroke-opacity": 0.7,
          "stroke-width": 0.8,
        }),
      ],
    };
  }
  if (mood === "limited") {
    const x = round2(outerX + 4);
    const y = round2(topY - 4);
    return {
      underEyes: [],
      overEyes: [
        element("path", {
          "data-shade": "zz",
          d: `M${x} ${y}h5.2l-5.2 5.6h5.2M${round2(x + 7)} ${round2(y - 6)}h3.6l-3.6 3.9h3.6`,
          fill: "none",
          // Drawn beside the body, on the page: the text colour keeps it readable in both themes.
          stroke: "currentColor",
          "stroke-opacity": 0.8,
          "stroke-width": 1.5,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
        }),
      ],
    };
  }
  return { underEyes: [], overEyes: [] };
}

interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Stable per face and colour, so the same avatar twice on a page shares identical definitions. */
function avatarShadeId(seed: string, hue: BotAvatarHue | null): string {
  let hash = 2166136261;
  for (const character of `${seed}|${hue ?? "auto"}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `av${(hash >>> 0).toString(36)}`;
}

/**
 * COSGRAL finish: the flat Blobatar body gets volume. A radial gradient lit from the upper left, a soft highlight
 * clipped to the body's own outline, and (in `catchlight`) a glint in each eye. The geometry stays the package's.
 */
function addBodyShading(
  document: Document,
  bodyGroup: Element,
  head: string,
  id: string,
  body: Ellipse,
): { defs: Element; highlight: Element; rim: Element } {
  const element = (name: string, attributes: Record<string, string | number>) => {
    const node = document.createElementNS(SVG_NAMESPACE, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  };
  const defs = element("defs", {});
  const bodyGradient = element("radialGradient", { id: `${id}-body`, cx: 0.36, cy: 0.28, r: 0.86 });
  bodyGradient.append(
    element("stop", { offset: 0, "stop-color": mixHex(head, "#ffffff", 0.38) }),
    element("stop", { offset: 0.5, "stop-color": head }),
    element("stop", { offset: 1, "stop-color": mixHex(head, "#000000", 0.42) }),
  );
  const shineGradient = element("radialGradient", { id: `${id}-shine` });
  shineGradient.append(
    element("stop", { offset: 0, "stop-color": "#ffffff", "stop-opacity": 0.78 }),
    element("stop", { offset: 1, "stop-color": "#ffffff", "stop-opacity": 0 }),
  );
  // Light bounced back into the lower edge, like the glossy pills of the owner's references.
  const rimGradient = element("radialGradient", { id: `${id}-rim`, cy: 1, r: 0.9 });
  rimGradient.append(
    element("stop", { offset: 0, "stop-color": mixHex(head, "#ffffff", 0.55), "stop-opacity": 0.75 }),
    element("stop", { offset: 1, "stop-color": mixHex(head, "#ffffff", 0.55), "stop-opacity": 0 }),
  );
  const clip = element("clipPath", { id: `${id}-clip` });
  for (const shape of Array.from(bodyGroup.children)) clip.append(shape.cloneNode(true));
  defs.append(bodyGradient, shineGradient, rimGradient, clip);
  bodyGroup.setAttribute("fill", `url(#${id}-body)`);

  const cx = round2(body.cx - body.rx * 0.3);
  const cy = round2(body.cy - body.ry * 0.42);
  const highlight = element("ellipse", {
    "data-shade": "highlight",
    cx,
    cy,
    rx: round2(body.rx * 0.36),
    ry: round2(body.ry * 0.2),
    transform: `rotate(-24 ${cx} ${cy})`,
    fill: `url(#${id}-shine)`,
    "clip-path": `url(#${id}-clip)`,
  });
  const rim = element("ellipse", {
    "data-shade": "rim",
    cx: round2(body.cx),
    cy: round2(body.cy + body.ry * 0.82),
    rx: round2(body.rx * 0.78),
    ry: round2(body.ry * 0.3),
    fill: `url(#${id}-rim)`,
    "clip-path": `url(#${id}-clip)`,
  });
  return { defs, highlight, rim };
}

/** A happy eye is an upturned arc ("^"), drawn where the pose put the eye. */
function smilingEye(document: Document, eye: Ellipse, color: string): Element {
  const arc = document.createElementNS(SVG_NAMESPACE, "path");
  const half = round2(Math.max(3.2, eye.rx * 0.95));
  const base = round2(eye.cy + 1.6);
  arc.setAttribute("data-face", "smiling-eye");
  arc.setAttribute(
    "d",
    `M${round2(eye.cx - half)} ${base}Q${round2(eye.cx)} ${round2(eye.cy - 3.4)} ${round2(eye.cx + half)} ${base}`,
  );
  arc.setAttribute("style", `fill:none;stroke:${color};stroke-width:2.4;stroke-linecap:round`);
  return arc;
}

function catchlight(document: Document, eye: Ellipse): Element {
  const glint = document.createElementNS(SVG_NAMESPACE, "circle");
  glint.setAttribute("data-shade", "catchlight");
  glint.setAttribute("cx", String(round2(eye.cx - eye.rx * 0.22)));
  glint.setAttribute("cy", String(round2(eye.cy - eye.ry * 0.42)));
  glint.setAttribute("r", String(round2(Math.min(1.9, Math.max(0.9, Math.min(eye.rx, eye.ry) * 0.46)))));
  glint.setAttribute("fill", "#ffffff");
  glint.setAttribute("fill-opacity", "0.9");
  return glint;
}

/** Mixes two `#rrggbb` colours; `amount` 0 keeps `from`, 1 gives `to`. Other formats are returned unchanged. */
/**
 * A more saturated version of a creature colour: saturation up, lightness kept in the band where a colour reads as
 * "strong" on both themes. Colours that are not `#rrggbb` come back unchanged.
 */
export function vividHex(hex: string): string {
  if (!/^#[0-9a-f]{6}$/iu.test(hex)) return hex;
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta < 0.04) return hex;
  const saturation = delta / (1 - Math.abs(2 * light - 1));
  let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  const s2 = Math.min(1, saturation * 1.3 + 0.12);
  const l2 = Math.min(0.64, Math.max(0.5, light));
  const chroma = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l2 - chroma / 2;
  const [r1, g1, b1] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${[r1, g1, b1]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function mixHex(from: string, to: string, amount: number): string {
  const parse = (hex: string) =>
    /^#[0-9a-f]{6}$/iu.test(hex) ? [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)) : null;
  const a = parse(from);
  const b = parse(to);
  if (!a || !b) return from;
  return `#${a
    .map((channel, index) =>
      Math.round(channel + ((b[index] ?? channel) - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Matches Blobatar 2 motion variables for the SolidJS inline-SVG adapter. */
function motionVariables(reader: ReturnType<typeof traits>): Record<string, string> {
  const negativeMilliseconds = (value: number) => `${-Math.round(value)}ms`;
  const blink = Math.round(reader.num("motion.blink", 3500, 6500));
  const saccade = Math.round(reader.num("motion.saccade", 4200, 7600));
  const lookX = reader.num("motion.lookX", 1, 2.2);
  const lookY = reader.num("motion.lookY", 0.8, 1.7);
  return {
    "--mo-phase": negativeMilliseconds(reader.num("motion.phase", 0, 2800)),
    "--mo-bob-phase": negativeMilliseconds(reader.num("motion.bob", 0, 3400)),
    "--mo-blink": `${blink}ms`,
    "--mo-blink-phase": negativeMilliseconds(reader.num("motion.blinkPhase", 0, blink)),
    "--mo-look-x": String(round2(lookX * (reader.bool("motion.lookXFlip") ? -1 : 1))),
    "--mo-look-mx": String(round2(lookX)),
    "--mo-look-y": String(round2(lookY * (reader.bool("motion.lookYFlip") ? -1 : 1))),
    "--mo-look-my": String(round2(lookY)),
    "--mo-saccade": `${saccade}ms`,
    "--mo-saccade-phase": negativeMilliseconds(reader.num("motion.saccadePhase", 0, saccade)),
  };
}

function serializeMotionVariables(variables: Record<string, string>): string {
  return Object.entries(variables)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}
