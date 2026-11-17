// COSGRAL W12-KK: workflows for Storybook and the preview. DEMO data only: no agent is asked and no message is posted. The same rules as the
// program (`workflow-manager.ts`): a workflow is checked as a whole when it is created or its graph changes (shape with `workflowProblems`,
// every step with `workflowNodeIssues`), a paused or already running workflow is not started, one start at a time, a step's text may use
// {{input}}, {{previous}} and {{steps.<id>}}, an approval waits for a person and a denial goes the Deny way (or ends the run as "denied").
// A run does not move by itself here: `simulate.advance` runs the next step, `simulate.decide` answers the approval card, so a story can
// stop on any state of the page (running, waiting for you, failed, done).

import {
  type AgentEvent,
  type CreateWorkflowInput,
  type KnownWorkflowTargets,
  type UpdateWorkflowInput,
  WORKFLOW_LIMITS,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
  type WorkflowRun,
  type WorkflowRunStatus,
  type WorkflowStepRun,
  type WorkflowsDesktopApi,
  workflowNodeIssues,
  workflowProblems,
} from "@openbot/contracts/ipc";

export interface MockWorkflowsOptions {
  /** The agents, channels and routines of the demo (what a step may point at). */
  known: () => KnownWorkflowTargets;
  /** A demo workflow "Morning brief" to start with, built on these ids; null = an empty page. */
  seed?: { botId: string; channelId: string } | null;
  now?: () => Date;
}

export interface MockWorkflows {
  api: Required<WorkflowsDesktopApi>;
  simulate: {
    /** Runs the next step of an open run; an approval stops the run as "waiting". */
    advance: (runId: string) => WorkflowRun;
    /** The person answers the approval card of a waiting run. */
    decide: (runId: string, decision: "allow" | "deny") => WorkflowRun;
    /** The next step that runs fails with this sentence. */
    failNext: (message: string) => void;
    /** Removes every workflow and run (the empty page). */
    clear: () => void;
  };
}

const RANK = { allow: 0, next: 1, deny: 2 } as const;

function stepOrder(nodes: WorkflowNode[], edges: WorkflowEdge[], start: WorkflowNode): WorkflowNode[] {
  const ordered: WorkflowNode[] = [start];
  const seen = new Set<string>([start.id]);
  for (let index = 0; index < ordered.length; index += 1) {
    const from = ordered[index];
    if (!from) break;
    const leaving = edges.filter((edge) => edge.from === from.id).sort((a, b) => RANK[a.on] - RANK[b.on]);
    for (const edge of leaving) {
      const to = nodes.find((node) => node.id === edge.to);
      if (to && !seen.has(to.id)) {
        seen.add(to.id);
        ordered.push(to);
      }
    }
  }
  return ordered;
}

function trimmed(value: string, field: string, max: number): string {
  const text = value.trim();
  if (!text || text.length > max) throw new Error(`${field} (1–${max} characters).`);
  return text;
}

interface Session {
  workflow: Workflow;
  run: WorkflowRun;
  outputs: Map<string, string>;
  previous: string;
  /** The step that runs next; null once the run ended. */
  cursor: string | null;
}

export function createMockWorkflows(emit: (event: AgentEvent) => void, options: MockWorkflowsOptions): MockWorkflows {
  const now = options.now ?? (() => new Date());
  const iso = (): string => now().toISOString();
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return String(counter);
  };
  let workflows: Workflow[] = [];
  const runs = new Map<string, WorkflowRun[]>();
  const sessions = new Map<string, Session>();
  const active = new Map<string, string>();
  let failMessage: string | null = null;

  const emitWorkflows = (): void => emit({ type: "workflows-changed", workflows: structuredClone(workflows) });
  const emitRun = (run: WorkflowRun): void => emit({ type: "workflow-run-changed", run: structuredClone(run) });

  const find = (workflowId: string): Workflow => {
    const workflow = workflows.find((item) => item.id === workflowId);
    if (!workflow) throw new Error("This workflow does not exist.");
    return workflow;
  };

  const checkGraph = (nodes: WorkflowNode[], edges: WorkflowEdge[]): void => {
    for (const issue of workflowNodeIssues({ nodes, edges }, options.known())) throw new Error(issue.message);
    const problems = workflowProblems({ nodes, edges });
    if (problems.length > 0) throw new Error(`This workflow cannot be saved: ${problems.join(" ")}`);
  };

  const store = (run: WorkflowRun): void => {
    const list = (runs.get(run.workflowId) ?? []).filter((item) => item.id !== run.id);
    runs.set(run.workflowId, [structuredClone(run), ...list].slice(0, WORKFLOW_LIMITS.runsKept));
  };

  const syncLastRun = (session: Session): void => {
    const target = workflows.find((item) => item.id === session.workflow.id);
    if (!target) return;
    target.lastRun = { runId: session.run.id, status: session.run.status, startedAt: session.run.startedAt };
    emitWorkflows();
  };

  const save = (session: Session): void => {
    store(session.run);
    emitRun(session.run);
    syncLastRun(session);
  };

  const render = (template: string, session: Session): string =>
    template.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, name: string) => {
      if (name === "input") return session.run.input;
      if (name === "previous") return session.previous;
      return name.startsWith("steps.") ? (session.outputs.get(name.slice("steps.".length)) ?? "") : "";
    });

  const stepOf = (session: Session, nodeId: string): WorkflowStepRun => {
    const step = session.run.steps.find((item) => item.nodeId === nodeId);
    if (!step) throw new Error("This step is not in the run.");
    return step;
  };

  const wayOn = (session: Session, from: string, on: WorkflowEdge["on"]): string | null =>
    session.workflow.edges.find((edge) => edge.from === from && edge.on === on)?.to ?? null;

  const end = (session: Session, status: WorkflowRunStatus, error: string | null): void => {
    const at = iso();
    session.run = {
      ...session.run,
      status,
      error,
      finishedAt: at,
      steps: session.run.steps.map((step) =>
        step.status === "pending"
          ? { ...step, status: "skipped" }
          : step.status === "running" || step.status === "waiting"
            ? {
                ...step,
                status: status === "cancelled" ? "skipped" : "failed",
                error: error ?? step.error,
                finishedAt: at,
              }
            : step,
      ),
    };
    session.cursor = null;
    sessions.delete(session.run.id);
    active.delete(session.workflow.id);
    save(session);
  };

  const finishStep = (session: Session, nodeId: string, output: string): void => {
    const at = iso();
    session.run = {
      ...session.run,
      status: "running",
      steps: session.run.steps.map((step) =>
        step.nodeId === nodeId ? { ...step, status: "done", output, error: null, finishedAt: at } : step,
      ),
    };
    session.outputs.set(nodeId, output);
    session.previous = output;
    session.run.result = output;
  };

  const moveOn = (session: Session, from: string, on: WorkflowEdge["on"]): void => {
    const next = wayOn(session, from, on);
    if (next === null) {
      end(session, "done", null);
      return;
    }
    session.cursor = next;
    save(session);
  };

  const advance = (runId: string): WorkflowRun => {
    const session = sessions.get(runId);
    if (!session) throw new Error("This run has already ended.");
    if (session.run.status === "waiting") throw new Error("This run waits for a decision.");
    const node = session.workflow.nodes.find((item) => item.id === session.cursor);
    if (!node) {
      end(session, "done", null);
      return structuredClone(session.run);
    }
    const at = iso();
    const step = stepOf(session, node.id);
    step.startedAt = at;
    if (failMessage !== null) {
      const message = failMessage;
      failMessage = null;
      step.status = "failed";
      step.error = message;
      step.finishedAt = at;
      end(session, "failed", message);
      return structuredClone(session.run);
    }
    if (node.type === "approval") {
      step.status = "waiting";
      session.run = { ...session.run, status: "waiting" };
      save(session);
      return structuredClone(session.run);
    }
    if (node.type === "agent") {
      finishStep(session, node.id, `Demo reply from ${node.botId}: ${render(node.prompt, session).slice(0, 200)}`);
    } else if (node.type === "channel-output") {
      finishStep(session, node.id, render(node.text, session));
    } else {
      finishStep(session, node.id, session.run.input);
    }
    moveOn(session, node.id, "next");
    return structuredClone(session.run);
  };

  const decide = (runId: string, decision: "allow" | "deny"): WorkflowRun => {
    const session = sessions.get(runId);
    const node = session?.workflow.nodes.find((item) => item.id === session.cursor);
    if (session?.run.status !== "waiting" || node?.type !== "approval") {
      throw new Error("This run is not waiting for a decision.");
    }
    finishStep(session, node.id, decision === "allow" ? "Allowed" : "Denied");
    const next = wayOn(session, node.id, decision);
    if (next === null) {
      if (decision === "deny") {
        stepOf(session, node.id).status = "denied";
        end(session, "denied", null);
      } else {
        end(session, "done", null);
      }
      return structuredClone(session.run);
    }
    if (decision === "deny") stepOf(session, node.id).status = "denied";
    // The way not taken is skipped when it is not reached from the other way.
    session.cursor = next;
    session.run = { ...session.run, status: "running" };
    save(session);
    return structuredClone(session.run);
  };

  const api: Required<WorkflowsDesktopApi> = {
    list: async () => structuredClone(workflows),
    create: async (input: CreateWorkflowInput) => {
      if (workflows.length >= WORKFLOW_LIMITS.workflows)
        throw new Error(`At most ${WORKFLOW_LIMITS.workflows} workflows.`);
      const name = trimmed(input.name, "A workflow needs a name", WORKFLOW_LIMITS.name);
      const description = (input.description ?? "").trim();
      if (description.length > WORKFLOW_LIMITS.description) {
        throw new Error(`The description has at most ${WORKFLOW_LIMITS.description} characters.`);
      }
      checkGraph(input.nodes, input.edges);
      const at = iso();
      const workflow: Workflow = {
        id: `wf-demo-${nextId()}`,
        name,
        description,
        nodes: structuredClone(input.nodes),
        edges: structuredClone(input.edges),
        paused: input.paused ?? false,
        createdAt: at,
        updatedAt: at,
        lastRun: null,
      };
      workflows = [...workflows, workflow];
      emitWorkflows();
      return structuredClone(workflow);
    },
    update: async (input: UpdateWorkflowInput) => {
      const current = find(input.workflowId);
      const name =
        input.name === undefined ? current.name : trimmed(input.name, "A workflow needs a name", WORKFLOW_LIMITS.name);
      const description = input.description === undefined ? current.description : input.description.trim();
      if (description.length > WORKFLOW_LIMITS.description) {
        throw new Error(`The description has at most ${WORKFLOW_LIMITS.description} characters.`);
      }
      const nodes = input.nodes === undefined ? current.nodes : structuredClone(input.nodes);
      const edges = input.edges === undefined ? current.edges : structuredClone(input.edges);
      if (input.nodes !== undefined || input.edges !== undefined) checkGraph(nodes, edges);
      const next: Workflow = {
        ...current,
        name,
        description,
        nodes,
        edges,
        paused: input.paused ?? current.paused,
        updatedAt: iso(),
      };
      workflows = workflows.map((item) => (item.id === current.id ? next : item));
      emitWorkflows();
      return structuredClone(next);
    },
    delete: async ({ workflowId }) => {
      const runId = active.get(workflowId);
      const session = runId ? sessions.get(runId) : undefined;
      if (session) end(session, "cancelled", "The workflow was deleted.");
      workflows = workflows.filter((item) => item.id !== workflowId);
      runs.delete(workflowId);
      emitWorkflows();
    },
    run: async ({ workflowId, input }) => {
      const workflow = find(workflowId);
      if (workflow.paused) throw new Error("This workflow is paused.");
      if (active.has(workflow.id)) throw new Error("This workflow is already running.");
      const start = workflow.nodes.find((node) => node.type === "trigger");
      if (!start) throw new Error("This workflow has no trigger.");
      const text = (input ?? "").slice(0, WORKFLOW_LIMITS.input);
      const startedAt = iso();
      const run: WorkflowRun = {
        id: `run-demo-${nextId()}`,
        workflowId: workflow.id,
        workflowName: workflow.name,
        cause: "manual",
        status: "running",
        input: text,
        steps: stepOrder(workflow.nodes, workflow.edges, start).map((node) => ({
          nodeId: node.id,
          title: node.title,
          type: node.type,
          status: node.type === "trigger" ? "done" : "pending",
          output: node.type === "trigger" ? text : null,
          error: null,
          startedAt: node.type === "trigger" ? startedAt : null,
          finishedAt: node.type === "trigger" ? startedAt : null,
        })),
        result: null,
        error: null,
        startedAt,
        finishedAt: null,
      };
      const session: Session = {
        workflow: structuredClone(workflow),
        run,
        outputs: new Map([[start.id, text]]),
        previous: text,
        cursor: workflow.edges.find((edge) => edge.from === start.id)?.to ?? null,
      };
      sessions.set(run.id, session);
      active.set(workflow.id, run.id);
      save(session);
      return structuredClone(session.run);
    },
    cancelRun: async ({ runId }) => {
      const session = sessions.get(runId);
      if (!session) {
        const known = [...runs.values()].flat().find((item) => item.id === runId);
        if (!known) throw new Error("This run does not exist.");
        throw new Error("This run has already ended.");
      }
      end(session, "cancelled", "Cancelled.");
      return structuredClone(session.run);
    },
    listRuns: async ({ workflowId }) => {
      find(workflowId);
      return structuredClone(runs.get(workflowId) ?? []);
    },
  };

  if (options.seed) {
    const { botId, channelId } = options.seed;
    const at = iso();
    workflows = [
      {
        id: "wf-demo-brief",
        name: "Morning brief",
        description: "Writes the brief, asks before it is posted.",
        paused: false,
        createdAt: at,
        updatedAt: at,
        lastRun: null,
        nodes: [
          { id: "start", type: "trigger", title: "Start", x: 0, y: 0, trigger: { kind: "manual" } },
          {
            id: "write",
            type: "agent",
            title: "Write the brief",
            x: 280,
            y: 0,
            botId,
            prompt: "Write a one-screen brief. Context: {{input}}",
          },
          {
            id: "ask",
            type: "approval",
            title: "Post it?",
            x: 560,
            y: 0,
            botId,
            text: "Post the brief to the channel?",
          },
          { id: "post", type: "channel-output", title: "Post", x: 840, y: -60, channelId, text: "{{steps.write}}" },
          {
            id: "skip",
            type: "channel-output",
            title: "Tell the channel",
            x: 840,
            y: 80,
            channelId,
            text: "The brief was not posted.",
          },
        ],
        edges: [
          { id: "start-write", from: "start", to: "write", on: "next" },
          { id: "write-ask", from: "write", to: "ask", on: "next" },
          { id: "ask-post", from: "ask", to: "post", on: "allow" },
          { id: "ask-skip", from: "ask", to: "skip", on: "deny" },
        ],
      },
    ];
  }

  return {
    api,
    simulate: {
      advance,
      decide,
      failNext: (message) => {
        failMessage = message;
      },
      clear: () => {
        for (const session of [...sessions.values()]) end(session, "cancelled", "The workflow was deleted.");
        workflows = [];
        runs.clear();
        emitWorkflows();
      },
    },
  };
}
