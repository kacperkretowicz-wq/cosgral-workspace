// COSGRAL: the plan of a project made by its lead agent. The person describes the project, the lead looks at it from every side
// (goal, scope, risks, steps, dependencies, quality, tests, security, order) and proposes a plan; the person accepts it. Only after
// that two separate questions can be answered, each with its own yes or no: may the lead create the skills the project needs, and may
// it review the plugins and connectors that fit the project. Without a yes nothing is created and nothing is switched on.
//
// This computer only. The program keeps the plan next to the project in the local database; reads and writes are
// `window.openbot.projectPlans`. Rules shared by the engine, the mock and the screen are the pure functions here.

import { isSkillName } from "./ipc-skills";
import { isBoolean, isDynamicRecord, isOneOf, isString } from "./runtime-values";

export const PROJECT_PLAN_ASPECTS = [
  "goal",
  "scope",
  "risks",
  "steps",
  "dependencies",
  "quality",
  "tests",
  "security",
  "order",
] as const;
export type ProjectPlanAspect = (typeof PROJECT_PLAN_ASPECTS)[number];

/** The headings the lead is asked to use, in this order; the reply is split at them (`parseProjectPlanReply`). */
export const PROJECT_PLAN_HEADINGS = [
  "Cel",
  "Zakres",
  "Ryzyka",
  "Kroki",
  "Zależności",
  "Jakość",
  "Testy",
  "Bezpieczeństwo",
  "Kolejność",
  "Skille do utworzenia",
  "Potrzebne narzędzia",
] as const;

export const PROJECT_PLAN_LIMITS = {
  description: 4_000,
  feedback: 1_000,
  aspect: 3_000,
  /** The reply of the lead that is read; the rest is cut. */
  reply: 24_000,
  skills: 6,
  skillDescription: 300,
  skillInstructions: 6_000,
  needs: 12,
  need: 120,
  review: 12,
} as const;

/** `described`: no plan yet. `planning`: the lead works on it. `proposed`: waits for the person. `accepted`: agreed. `failed`: the lead could not finish. */
export const PROJECT_PLAN_PHASES = ["described", "planning", "proposed", "accepted", "failed"] as const;
export type ProjectPlanPhase = (typeof PROJECT_PLAN_PHASES)[number];

/** `not-asked`: the person has not answered. `allowed` and `declined` are the answers; `done`: allowed and carried out. */
export const PROJECT_PLAN_CONSENTS = ["not-asked", "allowed", "declined", "done"] as const;
export type ProjectPlanConsent = (typeof PROJECT_PLAN_CONSENTS)[number];

export interface ProjectPlanSection {
  aspect: ProjectPlanAspect;
  text: string;
}

/** A skill the lead would like to create. It is only a draft until the person allows it. */
export interface ProjectPlanSkill {
  name: string;
  description: string;
  instructions: string;
  state: "draft" | "created" | "failed";
  /** Fixed plain sentence when `failed`. */
  problem: string | null;
}

export const PROJECT_PLAN_REVIEW_KINDS = ["skill", "plugin"] as const;
export type ProjectPlanReviewKind = (typeof PROJECT_PLAN_REVIEW_KINDS)[number];
export const PROJECT_PLAN_REVIEW_STATES = ["suggested", "enabled", "dismissed"] as const;
export type ProjectPlanReviewState = (typeof PROJECT_PLAN_REVIEW_STATES)[number];

/** One result of the review. The program never switches it on by itself: the person presses "Turn on". */
export interface ProjectPlanReviewItem {
  /** Marketplace id ("skill:<name>") for a skill, the slug for a plugin or connector. */
  id: string;
  kind: ProjectPlanReviewKind;
  title: string;
  /** Why it fits this project, in plain words. */
  reason: string;
  state: ProjectPlanReviewState;
}

export interface ProjectPlan {
  channelId: string;
  /** What the person wrote about the project. */
  description: string;
  phase: ProjectPlanPhase;
  /** The task of the lead that makes the plan; null before the first request. */
  taskId: string | null;
  /** The sections the lead wrote, in the order of `PROJECT_PLAN_ASPECTS`; empty before the plan arrives. */
  sections: ProjectPlanSection[];
  /** The whole reply when it could not be split into sections. */
  raw: string;
  skills: ProjectPlanSkill[];
  /** What the project needs from outside (tools, services), as the lead named it; used by the review. */
  needs: string[];
  skillsConsent: ProjectPlanConsent;
  reviewConsent: ProjectPlanConsent;
  review: ProjectPlanReviewItem[];
  /** When the review was made; null before. */
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPlanChannelInput {
  channelId: string;
}
export interface SaveProjectDescriptionInput extends ProjectPlanChannelInput {
  description: string;
}
export interface RequestProjectPlanInput extends ProjectPlanChannelInput {
  /** What to change, when the person asks for another version. */
  feedback?: string;
}
export interface DecideProjectPlanInput extends ProjectPlanChannelInput {
  allow: boolean;
}
export interface SetProjectReviewItemInput extends ProjectPlanChannelInput {
  itemId: string;
  state: "enabled" | "dismissed";
}

/** `window.openbot.projectPlans` (this computer only). */
export interface ProjectPlansDesktopApi {
  /** The plan of a project; null when the person has not written a description yet. */
  get: (input: ProjectPlanChannelInput) => Promise<ProjectPlan | null>;
  /** Saves the description. A plan that was already made stays; the person can ask for a new one. */
  saveDescription: (input: SaveProjectDescriptionInput) => Promise<ProjectPlan>;
  /** Asks the lead for a plan (or for another version when there is `feedback`). */
  requestPlan: (input: RequestProjectPlanInput) => Promise<ProjectPlan>;
  /** The person agrees with the proposed plan. It also saves the plan in the memory of the project. */
  accept: (input: ProjectPlanChannelInput) => Promise<ProjectPlan>;
  /** May the lead create the skills of the plan? "Yes" creates them now and gives them to the members. */
  decideSkills: (input: DecideProjectPlanInput) => Promise<ProjectPlan>;
  /** May the lead review plugins and connectors for the project? "Yes" makes the list now; nothing is switched on. */
  decideReview: (input: DecideProjectPlanInput) => Promise<ProjectPlan>;
  /** The person turned an item of the review on, or dismissed it. */
  setReviewItem: (input: SetProjectReviewItemInput) => Promise<ProjectPlan>;
}

const ASPECT_WORDS: Record<ProjectPlanAspect, readonly string[]> = {
  goal: ["cel", "goal", "objective"],
  scope: ["zakres", "scope"],
  risks: ["ryzyk", "risk"],
  steps: ["krok", "step"],
  dependencies: ["zaleznosc", "dependenc"],
  quality: ["jakosc", "quality"],
  tests: ["test"],
  security: ["bezpieczen", "security"],
  order: ["kolejnosc", "order", "sequence"],
};
const SKILL_WORDS = ["skill", "umiejetnosc"] as const;
const NEED_WORDS = ["narzedzi", "potrzebne", "plugin", "konektor", "tools", "connector", "needs"] as const;

function plain(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").replace(/Ł/g, "l").toLowerCase();
}

function aspectOfHeading(heading: string): ProjectPlanAspect | "skills" | "needs" | null {
  const words = plain(heading);
  // "Skille do utworzenia" must not be taken for "Kroki"; the special sections are checked first.
  if (SKILL_WORDS.some((word) => words.includes(word))) return "skills";
  if (NEED_WORDS.some((word) => words.includes(word))) return "needs";
  for (const aspect of PROJECT_PLAN_ASPECTS)
    if (ASPECT_WORDS[aspect].some((word) => words.includes(word))) return aspect;
  return null;
}

export interface ParsedProjectPlanReply {
  sections: ProjectPlanSection[];
  skills: Array<Pick<ProjectPlanSkill, "name" | "description" | "instructions">>;
  needs: string[];
}

function cleanHeading(line: string): string {
  return line
    .replace(/^#{2,3}\s*/, "")
    .replace(/[*_`:]/g, "")
    .replace(/^\d+[.)]\s*/, "")
    .trim();
}

/**
 * Splits the reply of the lead at its `##` headings. A heading that is not one of the nine aspects, the skills or the needs is
 * kept with the section before it, so no sentence is lost. A reply without any known heading gives no sections (the screen then
 * shows the reply as it is).
 */
export function parseProjectPlanReply(reply: string): ParsedProjectPlanReply {
  const text = reply.slice(0, PROJECT_PLAN_LIMITS.reply);
  const parts = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s+\S/.test(line) && !line.startsWith("###")) {
      const key = aspectOfHeading(cleanHeading(line));
      if (key) {
        current = key;
        if (!parts.has(key)) parts.set(key, []);
        continue;
      }
    }
    if (current) parts.get(current)?.push(line);
  }
  const sections: ProjectPlanSection[] = [];
  for (const aspect of PROJECT_PLAN_ASPECTS) {
    const body = parts.get(aspect)?.join("\n").trim();
    if (body) sections.push({ aspect, text: body.slice(0, PROJECT_PLAN_LIMITS.aspect) });
  }
  return {
    sections,
    skills: parseSkillDrafts(parts.get("skills")?.join("\n") ?? ""),
    needs: parseNeeds(parts.get("needs")?.join("\n") ?? ""),
  };
}

function parseSkillDrafts(body: string): ParsedProjectPlanReply["skills"] {
  const drafts: ParsedProjectPlanReply["skills"] = [];
  const blocks = body.split(/^###\s+/m).slice(1);
  for (const block of blocks) {
    const [first = "", ...rest] = block.split(/\r?\n/);
    const name = first.replace(/[`*_]/g, "").trim().toLowerCase();
    if (!isSkillName(name) || drafts.some((draft) => draft.name === name)) continue;
    const lines = rest.join("\n");
    const description = /^\s*(?:Opis|Description)\s*:\s*(.+)$/im.exec(lines)?.[1]?.trim() ?? "";
    const instructionsAt = /^\s*(?:Instrukcja|Instructions)\s*:\s*/im.exec(lines);
    const instructions = (
      instructionsAt
        ? lines.slice(instructionsAt.index + instructionsAt[0].length)
        : lines.replace(/^\s*(?:Opis|Description)\s*:.*$/im, "")
    ).trim();
    if (!description || !instructions) continue;
    drafts.push({
      name,
      description: description.slice(0, PROJECT_PLAN_LIMITS.skillDescription),
      instructions: instructions.slice(0, PROJECT_PLAN_LIMITS.skillInstructions),
    });
    if (drafts.length >= PROJECT_PLAN_LIMITS.skills) break;
  }
  return drafts;
}

function parseNeeds(body: string): string[] {
  const needs: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const item = line
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
      .replace(/[`*_]/g, "")
      .trim();
    if (!item || !/^\s*(?:[-*•]|\d+[.)])/.test(line)) continue;
    needs.push(item.slice(0, PROJECT_PLAN_LIMITS.need));
    if (needs.length >= PROJECT_PLAN_LIMITS.needs) break;
  }
  return needs;
}

/** The message the lead gets (it shows in the project chat as a message of the person). Plain Polish: the lead answers in the language of the description. */
export function projectPlanRequestMessage(description: string, feedback?: string): string {
  const change = feedback?.trim()
    ? ["", `Poprzednia wersja nie pasowała. Zmień ją według tej uwagi: ${feedback.trim()}`]
    : [];
  return [
    "Zaplanuj ten projekt, zanim zaczniemy pracę. Spójrz na niego z każdej strony.",
    "",
    "Opis projektu:",
    description.trim(),
    ...change,
    "",
    "Odpowiedz prostym językiem, bez skrótów i bez podwójnych myślników. Użyj tych nagłówków, każdy w osobnej linii i z dwoma znakami # na początku:",
    PROJECT_PLAN_HEADINGS.join(", "),
    "",
    "Pod „Skille do utworzenia” podaj najwyżej sześć skilli, które naprawdę pomogą. Każdy zapisz tak: linia „### nazwa-malymi-literami”, linia „Opis: kiedy skill jest potrzebny”, linia „Instrukcja:” i pod nią krótkie kroki pracy.",
    "Pod „Potrzebne narzędzia” wypisz w punktach (myślnik na początku) usługi, z których projekt będzie korzystał, np. kalendarz albo GitHub.",
    "To tylko propozycja. Niczego nie twórz i nie włączaj, dopóki użytkownik się wyraźnie nie zgodzi. Gotowy plan oddaj jako wynik zadania.",
  ].join("\n");
}

/** Why the description cannot be saved, in plain words, or null. */
export function projectDescriptionProblem(value: unknown) {
  if (!isString(value) || !value.trim()) return "Describe the project in a few sentences first.";
  if (value.length > PROJECT_PLAN_LIMITS.description) return "The description is too long. Shorten it.";
  return null;
}

export function isProjectPlanPhase(value: unknown): value is ProjectPlanPhase {
  return isOneOf(PROJECT_PLAN_PHASES, value);
}

function isConsent(value: unknown): value is ProjectPlanConsent {
  return isOneOf(PROJECT_PLAN_CONSENTS, value);
}

function isSection(value: unknown): value is ProjectPlanSection {
  return isDynamicRecord(value) && isOneOf(PROJECT_PLAN_ASPECTS, value.aspect) && isString(value.text);
}

function isSkill(value: unknown): value is ProjectPlanSkill {
  return (
    isDynamicRecord(value) &&
    isSkillName(value.name) &&
    isString(value.description) &&
    isString(value.instructions) &&
    isOneOf(["draft", "created", "failed"] as const, value.state) &&
    (value.problem === null || isString(value.problem))
  );
}

function isReviewItem(value: unknown): value is ProjectPlanReviewItem {
  return (
    isDynamicRecord(value) &&
    isString(value.id) &&
    isOneOf(PROJECT_PLAN_REVIEW_KINDS, value.kind) &&
    isString(value.title) &&
    isString(value.reason) &&
    isOneOf(PROJECT_PLAN_REVIEW_STATES, value.state)
  );
}

export function isProjectPlan(value: unknown): value is ProjectPlan {
  return (
    isDynamicRecord(value) &&
    isString(value.channelId) &&
    isString(value.description) &&
    isProjectPlanPhase(value.phase) &&
    (value.taskId === null || isString(value.taskId)) &&
    Array.isArray(value.sections) &&
    value.sections.every(isSection) &&
    isString(value.raw) &&
    Array.isArray(value.skills) &&
    value.skills.every(isSkill) &&
    Array.isArray(value.needs) &&
    value.needs.every(isString) &&
    isConsent(value.skillsConsent) &&
    isConsent(value.reviewConsent) &&
    Array.isArray(value.review) &&
    value.review.every(isReviewItem) &&
    (value.reviewedAt === null || isString(value.reviewedAt)) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

export function parseProjectPlanChannelInput(input: unknown): ProjectPlanChannelInput {
  if (!isDynamicRecord(input) || !isString(input.channelId) || input.channelId.length === 0) {
    throw new Error("Choose a project.");
  }
  return { channelId: input.channelId };
}

export function parseSaveProjectDescriptionInput(input: unknown): SaveProjectDescriptionInput {
  const { channelId } = parseProjectPlanChannelInput(input);
  const description = isDynamicRecord(input) ? input.description : undefined;
  const problem = projectDescriptionProblem(description);
  if (problem) throw new Error(problem);
  return { channelId, description: String(description).trim() };
}

export function parseRequestProjectPlanInput(input: unknown): RequestProjectPlanInput {
  const { channelId } = parseProjectPlanChannelInput(input);
  const feedback = isDynamicRecord(input) ? input.feedback : undefined;
  if (feedback === undefined || feedback === null || feedback === "") return { channelId };
  if (!isString(feedback) || feedback.length > PROJECT_PLAN_LIMITS.feedback) {
    throw new Error("The note is too long. Shorten it.");
  }
  return { channelId, feedback: feedback.trim() };
}

export function parseDecideProjectPlanInput(input: unknown): DecideProjectPlanInput {
  const { channelId } = parseProjectPlanChannelInput(input);
  if (!isDynamicRecord(input) || !isBoolean(input.allow)) throw new Error("Answer yes or no.");
  return { channelId, allow: input.allow };
}

export function parseSetProjectReviewItemInput(input: unknown): SetProjectReviewItemInput {
  const { channelId } = parseProjectPlanChannelInput(input);
  if (!isDynamicRecord(input) || !isString(input.itemId) || !input.itemId) throw new Error("Choose an item.");
  if (!isOneOf(["enabled", "dismissed"] as const, input.state)) throw new Error("Choose what happened to the item.");
  return { channelId, itemId: input.itemId, state: input.state };
}
