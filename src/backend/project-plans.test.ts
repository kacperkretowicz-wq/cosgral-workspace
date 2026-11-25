import type { ChannelTaskState, ProjectPlan, WorkspaceChannel } from "@openbot/contracts/ipc";
import { describe, expect, it, vi } from "vitest";
import {
  type ProjectPlanPorts,
  ProjectPlanService,
  planMemoryText,
  type ReviewCandidate,
  reviewProject,
  reviewWords,
  skillMarkdown,
} from "./project-plans";

const REPLY = [
  "## Cel",
  "Otworzyć sklep ze świecami.",
  "## Zakres",
  "Sklep i płatności.",
  "## Kolejność",
  "Najpierw sklep.",
  "## Skille do utworzenia",
  "### opis-produktu",
  "Opis: gdy trzeba opisać produkt.",
  "Instrukcja:",
  "Zapytaj o zapach.",
  "### checklista-startu",
  "Opis: przed otwarciem sklepu.",
  "Instrukcja:",
  "Sprawdź płatności.",
  "## Potrzebne narzędzia",
  "- GitHub",
].join("\n");

const channel: WorkspaceChannel = {
  id: "c",
  name: "sklep",
  title: "Sklep",
  instructions: "",
  leadBotId: "lead",
  memberBotIds: ["lead", "helper"],
  isolated: true,
  archived: false,
  createdAt: "",
  updatedAt: "",
};

function setup(overrides: Partial<ProjectPlanPorts> = {}, taskState: ChannelTaskState = "done") {
  const saved = new Map<string, ProjectPlan>();
  const state: { taskState: ChannelTaskState; reply: string | null; channel: WorkspaceChannel | null } = {
    taskState,
    reply: REPLY,
    channel,
  };
  const sent: string[] = [];
  const remembered: string[] = [];
  const createSkill = vi.fn(async () => undefined);
  const candidates: ReviewCandidate[] = [
    { id: "github", kind: "plugin", title: "GitHub", summary: "Code hosting", tags: ["coding"], present: false },
    {
      id: "skill:copywriting",
      kind: "skill",
      title: "Copywriting",
      summary: "Write product text",
      tags: ["sklep"],
      present: false,
    },
    {
      id: "calendar",
      kind: "plugin",
      title: "Calendar",
      summary: "Plan meetings",
      tags: ["productivity"],
      present: true,
    },
    { id: "unrelated", kind: "plugin", title: "Weather", summary: "Forecasts", tags: ["outdoors"], present: false },
  ];
  const ports: ProjectPlanPorts = {
    store: {
      get: (id) => saved.get(id) ?? null,
      save: (plan) => void saved.set(plan.channelId, structuredClone(plan)),
    },
    channel: () => state.channel,
    send: (_id, text) => {
      sent.push(text);
      return { taskId: "task-1" };
    },
    task: () => (state.taskState ? { state: state.taskState } : null),
    result: () => state.reply,
    remember: (_id, text) => void remembered.push(text),
    createSkill,
    candidates: () => candidates,
    now: () => new Date("2026-11-25T10:00:00Z"),
    ...overrides,
  };
  return { service: new ProjectPlanService(ports), state, sent, remembered, createSkill, saved };
}

function planWith(patch: Partial<ProjectPlan>): ProjectPlan {
  return {
    channelId: "c",
    description: "",
    phase: "proposed",
    taskId: null,
    sections: [],
    raw: "",
    skills: [],
    needs: [],
    skillsConsent: "not-asked",
    reviewConsent: "not-asked",
    review: [],
    reviewedAt: null,
    createdAt: "",
    updatedAt: "",
    ...patch,
  };
}

async function accepted(context = setup()) {
  context.service.saveDescription({ channelId: "c", description: "Otwieramy sklep ze świecami" });
  context.service.requestPlan({ channelId: "c" });
  context.service.accept({ channelId: "c" });
  return context;
}

describe("ProjectPlanService", () => {
  it("has no plan before the person writes a description", () => {
    expect(setup().service.get({ channelId: "c" })).toBeNull();
  });

  it("sends the description to the lead and turns the finished reply into a proposed plan", () => {
    const { service, sent } = setup();
    expect(service.saveDescription({ channelId: "c", description: "  Sklep ze świecami " }).phase).toBe("described");
    expect(service.requestPlan({ channelId: "c" }).phase).toBe("planning");
    expect(sent[0]).toContain("Sklep ze świecami");
    const plan = service.get({ channelId: "c" });
    expect(plan?.phase).toBe("proposed");
    expect(plan?.sections.map((section) => section.aspect)).toEqual(["goal", "scope", "order"]);
    expect(plan?.skills.map((skill) => [skill.name, skill.state])).toEqual([
      ["opis-produktu", "draft"],
      ["checklista-startu", "draft"],
    ]);
    expect(plan?.needs).toEqual(["GitHub"]);
  });

  it("waits while the lead works and fails when the task fails or the reply is empty", () => {
    const working = setup({}, "running");
    working.service.saveDescription({ channelId: "c", description: "Sklep" });
    working.service.requestPlan({ channelId: "c" });
    expect(working.service.get({ channelId: "c" })?.phase).toBe("planning");
    expect(() => working.service.requestPlan({ channelId: "c" })).toThrow("already working");
    expect(() => working.service.saveDescription({ channelId: "c", description: "Inny" })).toThrow("still working");
    working.state.taskState = "failed";
    expect(working.service.get({ channelId: "c" })?.phase).toBe("failed");
    working.state.taskState = "done";
    expect(working.service.requestPlan({ channelId: "c" }).phase).toBe("planning");
    working.state.reply = "   ";
    expect(working.service.get({ channelId: "c" })?.phase).toBe("failed");
  });

  it("keeps a reply without known headings as it is", () => {
    const { service, state } = setup();
    state.reply = "Zrób sklep i już.";
    service.saveDescription({ channelId: "c", description: "Sklep" });
    service.requestPlan({ channelId: "c" });
    const plan = service.get({ channelId: "c" });
    expect(plan?.phase).toBe("proposed");
    expect(plan?.sections).toEqual([]);
    expect(plan?.raw).toBe("Zrób sklep i już.");
  });

  it("refuses a request without a description, for an archived project or for a project without a lead", () => {
    const { service, state } = setup();
    expect(() => service.requestPlan({ channelId: "c" })).toThrow("Describe the project");
    service.saveDescription({ channelId: "c", description: "Sklep" });
    state.channel = { ...channel, archived: true };
    expect(() => service.requestPlan({ channelId: "c" })).toThrow("archived");
    state.channel = { ...channel, leadBotId: null };
    expect(() => service.requestPlan({ channelId: "c" })).toThrow("no lead");
    state.channel = null;
    expect(() => service.requestPlan({ channelId: "c" })).toThrow("no longer exists");
  });

  it("saves a short summary in the project memory when the plan is accepted, and not before", () => {
    const { service, remembered } = setup();
    service.saveDescription({ channelId: "c", description: "Sklep" });
    expect(() => service.accept({ channelId: "c" })).toThrow("no plan to accept");
    service.requestPlan({ channelId: "c" });
    expect(remembered).toEqual([]);
    expect(service.accept({ channelId: "c" }).phase).toBe("accepted");
    expect(remembered).toHaveLength(1);
    expect(remembered[0]).toContain("Cel: Otworzyć sklep ze świecami.");
    expect(remembered[0]?.length).toBeLessThanOrEqual(500);
    expect(service.accept({ channelId: "c" }).phase).toBe("accepted");
    expect(remembered).toHaveLength(1);
  });

  it("does not let the person ask for a new plan once it is accepted", async () => {
    const context = await accepted();
    expect(() => context.service.requestPlan({ channelId: "c" })).toThrow("already accepted");
  });

  it("creates nothing before the person answers, and nothing at all after a no", async () => {
    const context = setup();
    context.service.saveDescription({ channelId: "c", description: "Sklep" });
    context.service.requestPlan({ channelId: "c" });
    await expect(context.service.decideSkills({ channelId: "c", allow: true })).rejects.toThrow(
      "Accept the plan first.",
    );
    await expect(context.service.decideReview({ channelId: "c", allow: true })).rejects.toThrow(
      "Accept the plan first.",
    );
    context.service.accept({ channelId: "c" });
    expect(context.createSkill).not.toHaveBeenCalled();
    const skills = await context.service.decideSkills({ channelId: "c", allow: false });
    expect(skills.skillsConsent).toBe("declined");
    expect(skills.skills.every((skill) => skill.state === "draft")).toBe(true);
    const review = await context.service.decideReview({ channelId: "c", allow: false });
    expect(review.reviewConsent).toBe("declined");
    expect(review.review).toEqual([]);
    expect(context.createSkill).not.toHaveBeenCalled();
  });

  it("creates the skills of the plan for the lead and the members after a yes", async () => {
    const context = await accepted();
    const plan = await context.service.decideSkills({ channelId: "c", allow: true });
    expect(plan.skillsConsent).toBe("done");
    expect(plan.skills.map((skill) => skill.state)).toEqual(["created", "created"]);
    expect(context.createSkill).toHaveBeenCalledTimes(2);
    expect(context.createSkill).toHaveBeenCalledWith(
      expect.objectContaining({ name: "opis-produktu", authorBotId: "lead", botIds: ["lead", "helper"] }),
    );
    await expect(context.service.decideSkills({ channelId: "c", allow: true })).rejects.toThrow("already created");
  });

  it("marks a skill that could not be created and lets the person try again", async () => {
    let calls = 0;
    const context = setup({
      createSkill: async () => {
        calls += 1;
        if (calls === 2) throw new Error("disk full at C:\\secret\\path");
      },
    });
    await accepted(context);
    const first = await context.service.decideSkills({ channelId: "c", allow: true });
    expect(first.skillsConsent).toBe("allowed");
    expect(first.skills.map((skill) => skill.state)).toEqual(["created", "failed"]);
    expect(first.skills[1]?.problem).toBe("This skill could not be created. Try again.");
    expect(JSON.stringify(first)).not.toContain("secret");
    const second = await context.service.decideSkills({ channelId: "c", allow: true });
    expect(second.skillsConsent).toBe("done");
    expect(calls).toBe(3);
  });

  it("refuses the skills question when the plan has none", async () => {
    const context = setup();
    context.state.reply = "## Cel\nSklep";
    await accepted(context);
    await expect(context.service.decideSkills({ channelId: "c", allow: true })).rejects.toThrow("no skills");
  });

  it("makes the review after a yes, turns nothing on and lets the person mark each item", async () => {
    const context = await accepted();
    const plan = await context.service.decideReview({ channelId: "c", allow: true });
    expect(plan.reviewConsent).toBe("done");
    expect(plan.reviewedAt).toBe("2026-11-25T10:00:00.000Z");
    expect(plan.review.map((item) => [item.id, item.state])).toEqual([
      ["github", "suggested"],
      ["skill:copywriting", "suggested"],
    ]);
    expect(plan.review[0]?.reason).toBe("Named in the plan: GitHub");
    const marked = context.service.setReviewItem({ channelId: "c", itemId: "github", state: "enabled" });
    expect(marked.review.map((item) => item.state)).toEqual(["enabled", "suggested"]);
    expect(() => context.service.setReviewItem({ channelId: "c", itemId: "nope", state: "enabled" })).toThrow(
      "not in the review",
    );
  });

  it("does not take item answers before the review was allowed", async () => {
    const context = await accepted();
    expect(() => context.service.setReviewItem({ channelId: "c", itemId: "github", state: "enabled" })).toThrow(
      "Allow the review first.",
    );
  });
});

describe("helpers", () => {
  it("takes words of four letters or more without accents and filler", () => {
    expect(reviewWords("Sklep z świecami, GitHub i kalendarz oraz that")).toEqual([
      "sklep",
      "swiecami",
      "github",
      "kalendarz",
    ]);
  });

  it("puts what the plan names first and leaves out what is already in use", () => {
    const plan = planWith({ description: "sklep", needs: ["Calendar"] });
    const items = reviewProject(plan, [
      { id: "a", kind: "plugin", title: "Calendar", summary: "", tags: [], present: true },
      { id: "b", kind: "plugin", title: "Shop helper", summary: "sklep", tags: [], present: false },
    ]);
    expect(items.map((item) => item.id)).toEqual(["b"]);
    expect(items[0]?.reason).toBe("Fits: sklep");
  });

  it("cuts the memory sentence to the limit and writes front matter in one line", () => {
    const long = planWith({ sections: [{ aspect: "goal", text: "x".repeat(900) }] });
    expect(planMemoryText(long).length).toBeLessThanOrEqual(500);
    expect(skillMarkdown({ name: "a-b", description: "line one\nline two", instructions: " Do it. " })).toBe(
      "---\nname: a-b\ndescription: line one line two\n---\n\nDo it.\n",
    );
  });
});
