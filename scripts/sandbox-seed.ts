// T-N: seed demo data for sandbox screenshots (Library / Tasks / Usage / Schedule / agents).
// Called from sandbox-shots-w12 after first-run, before shots. No Electron launch by itself.
//   import { seedShotsData, seedUsageHistory } from "./sandbox-seed.ts"
// Usage history for past days writes SQLite (node:sqlite) under the sandbox profile.

import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDynamicRecord } from "@openbot/contracts/runtime-values";
import type { Page } from "playwright";

export interface SeedResult {
  notes: string[];
  botIds: string[];
}

function dayOffset(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/** Fill library, channels/tasks, routines, agents+mascots, and live usage turns via window.openbot. */
export async function seedShotsData(page: Page): Promise<SeedResult> {
  const notes: string[] = [];
  const payload = await page.evaluate(`(async () => {
    const api = Reflect.get(window, "openbot");
    if (!api) throw new Error("no window.openbot");
    const out = [];
    const botIds = [];

    const models = (await api.agent.listModels?.()) ?? [];
    const modelA = models[0]?.id ?? null;
    const modelB = models[1]?.id ?? models[0]?.id ?? null;

    async function ensureBot(name, hue, seed) {
      const bots = await api.agent.listBots();
      let bot = bots.find((b) => b.name === name);
      if (!bot) {
        bot = await api.agent.createBot();
        await api.agent.updateBot({
          botId: bot.id,
          name,
          role: name + " (seed)",
          avatarSeed: seed,
          avatarHue: hue,
          ...(modelA ? { model: modelA } : {}),
        });
      } else {
        await api.agent.updateBot({
          botId: bot.id,
          name,
          avatarSeed: seed,
          avatarHue: hue,
        });
      }
      const again = (await api.agent.listBots()).find((b) => b.name === name) ?? bot;
      botIds.push(again.id);
      return again;
    }

    const lead = await ensureBot("Shot agent", 185, "seed-luna");
    const helper = await ensureBot("Seed Researcher", 80, "seed-drop");
    const writer = await ensureBot("Seed Writer", 300, "seed-blob");
    out.push("agents:3");

    // Library: File blobs go as data[] (no disk path) through preload importInput.
    if (api.library?.addFiles) {
      const files = [
        new File([new TextEncoder().encode("# Seed brief\\nUploaded note for Library shots.\\n")], "seed-brief.md", {
          type: "text/markdown",
        }),
        new File([new TextEncoder().encode("company,value,won\\nAcme,10,true\\n")], "seed-leads.csv", {
          type: "text/csv",
        }),
        new File([new TextEncoder().encode("Agent draft from seed.\\n")], "seed-agent-notes.txt", {
          type: "text/plain",
        }),
      ];
      const uploaded = await api.library.addFiles(files.slice(0, 2));
      out.push("library-upload:" + uploaded.length);
      // Third file: attach via chat then saveFromChat when possible; else add as person upload.
      const agentish = await api.library.addFiles([files[2]]);
      out.push("library-extra:" + agentish.length);
    } else {
      out.push("library:missing");
    }

    // Channels + tasks (done / archive / subtasks via helper fan-out when stub answers).
    if (api.channels?.create && api.channels.sendMessage) {
      const existing = await api.channels.list();
      let alpha = existing.find((c) => c.name === "seed-alpha");
      if (!alpha) {
        alpha = await api.channels.create({
          name: "seed-alpha",
          title: "Seed Alpha",
          instructions: "Demo channel for screenshots.",
          memberBotIds: [lead.id, helper.id],
          leadBotId: lead.id,
          isolated: false,
        });
      }
      let beta = existing.find((c) => c.name === "seed-beta");
      if (!beta) {
        beta = await api.channels.create({
          name: "seed-beta",
          title: "Seed Beta",
          instructions: "Second demo channel.",
          memberBotIds: [lead.id, writer.id],
          leadBotId: lead.id,
          isolated: false,
        });
      }
      const sent1 = await api.channels.sendMessage({
        channelId: alpha.id,
        text: "Seed task: summarise the brief (done path).",
      });
      const sent2 = await api.channels.sendMessage({
        channelId: alpha.id,
        text: "Seed task with helpers: research and draft together.",
      });
      const sent3 = await api.channels.sendMessage({
        channelId: beta.id,
        text: "Seed task: archive me after done.",
      });
      // Wait for stub helpers so parent tasks get Steps (parentTaskId children).
      await new Promise((r) => setTimeout(r, 5000));
      const tasksA = await api.channels.listTasks(alpha.id);
      const tasksB = await api.channels.listTasks(beta.id);
      const all = [...tasksA, ...tasksB];
      const archivable = all.find((t) => t.id === sent3.task.id) ?? tasksB[0];
      if (archivable && api.channels.actOnTask) {
        try {
          if (archivable.state === "running" || archivable.state === "queued") {
            await api.channels.actOnTask({ taskId: archivable.id, action: "pause" });
            out.push("task-paused:" + archivable.id.slice(0, 8));
          }
          const refreshed = (await api.channels.listTasks(beta.id)).find((t) => t.id === archivable.id);
          if (refreshed && (refreshed.state === "done" || refreshed.state === "failed" || refreshed.state === "stopped")) {
            await api.channels.actOnTask({ taskId: archivable.id, action: "archive" });
            out.push("task-archived");
          } else if (refreshed?.state === "paused" || refreshed?.state === "running") {
            out.push("task-running-or-paused");
          }
        } catch (error) {
          out.push("task-act:" + String(error?.message ?? error));
        }
      }
      const withKids = all.filter((t) => all.some((c) => c.parentTaskId === t.id));
      out.push(
        "channels:2 tasks:" +
          all.length +
          " parents-with-steps:" +
          withKids.length +
          " sent:" +
          [sent1.task.state, sent2.task.state, sent3.task.state].join(","),
      );
    } else {
      out.push("channels:missing");
    }

    // Live usage turns (today) on two models when available.
    if (modelA) {
      await api.agent.updateBot({ botId: lead.id, model: modelA });
      await api.agent.sendMessage({ botId: lead.id, text: "Seed usage turn A — please reason" });
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (modelB && modelB !== modelA) {
      await api.agent.updateBot({ botId: helper.id, model: modelB });
      await api.agent.sendMessage({ botId: helper.id, text: "Seed usage turn B — please reason" });
      await new Promise((r) => setTimeout(r, 1500));
    } else if (modelA) {
      await api.agent.sendMessage({ botId: helper.id, text: "Seed usage turn B2 — please reason" });
      await new Promise((r) => setTimeout(r, 1500));
    }
    out.push("usage-turns:live");

    // Routines + runs for Schedule.
    if (api.routines?.create && api.routines.runNow) {
      const listed = await api.routines.list(lead.id);
      let r1 = listed.find((r) => r.name === "Seed daily ping");
      if (!r1) {
        const created = await api.routines.create({
          botId: lead.id,
          name: "Seed daily ping",
          prompt: "Say hello from the seed routine.",
          trigger: "schedule",
          schedule: { type: "interval", everyMinutes: 60 },
          timezone: "Europe/Warsaw",
        });
        r1 = created.routine;
      }
      let r2 = listed.find((r) => r.name === "Seed research sweep");
      if (!r2) {
        const created = await api.routines.create({
          botId: helper.id,
          name: "Seed research sweep",
          prompt: "Scan open tasks once.",
          trigger: "schedule",
          schedule: { type: "daily", time: "09:00" },
          timezone: "Europe/Warsaw",
        });
        r2 = created.routine;
      }
      try {
        await api.routines.runNow({ routineId: r1.id });
        await api.routines.runNow({ routineId: r2.id });
        out.push("routines:2 runs:2");
      } catch (error) {
        out.push("routines-run:" + String(error?.message ?? error));
      }
    } else {
      out.push("routines:missing");
    }

    // Workflow with ≥2 versions (create = v1; graph prompt change = v2) so Versions panel has rows.
    if (api.workflows?.create) {
      const listed = await api.workflows.list();
      let flow = listed.find((w) => w.name === "Seed shot flow");
      if (!flow) {
        flow = await api.workflows.create({
          name: "Seed shot flow",
          description: "Demo workflow for screenshot versions panel.",
          nodes: [
            { id: "t1", type: "trigger", x: 40, y: 40, title: "Start", trigger: { kind: "manual" } },
            {
              id: "a1",
              type: "agent",
              x: 240,
              y: 40,
              title: "Ask",
              botId: lead.id,
              prompt: "Say hi from the seed workflow.",
            },
          ],
          edges: [{ id: "e1", from: "t1", to: "a1", on: "next" }],
        });
      }
      if (flow && api.workflows.update) {
        const bump = async (prompt) => {
          const nodes = (flow.nodes || []).map((node) =>
            node.type === "agent" && node.id === "a1" ? { ...node, prompt } : node,
          );
          flow = await api.workflows.update({
            workflowId: flow.id,
            nodes,
            edges: flow.edges,
          });
        };
        await bump("Say hi v2 from the seed workflow (versions panel).");
        // Ensure ≥2 versions for the Versions panel (create = v1, update = v2).
        if (api.workflows.listVersions) {
          let versions = await api.workflows.listVersions({ workflowId: flow.id });
          if (!Array.isArray(versions) || versions.length < 2) {
            await bump("Say hi v3 from the seed workflow (versions panel).");
            versions = await api.workflows.listVersions({ workflowId: flow.id });
          }
        }
      }
      let versionCount = 0;
      if (flow && api.workflows.listVersions) {
        const versions = await api.workflows.listVersions({ workflowId: flow.id });
        versionCount = Array.isArray(versions) ? versions.length : 0;
      }
      out.push("workflow:" + (flow?.id ?? "created").toString().slice(0, 12) + ":v" + versionCount);
    } else {
      out.push("workflow:missing");
    }

    // Dedicated thread for the undo bar shot on Shot agent (same bot the shot deletes).
    // threads.create returns ThreadList { activeThreadId, threads }, not a bare array.
    if (api.threads?.create) {
      const created = await api.threads.create({ botId: lead.id, title: "Seed undo thread" });
      const tid = created?.activeThreadId || null;
      const rows = Array.isArray(created?.threads) ? created.threads : [];
      const hit = rows.find((row) => row.title === "Seed undo thread" || row.id === tid);
      out.push("thread-undo-seed:" + (hit?.id || tid || "empty") + ":bot=" + lead.id.slice(0, 8));
    } else {
      out.push("thread-undo-seed:missing");
    }

    return { notes: out, botIds };
  })()`);

  const result = parseSeedPayload(payload);
  notes.push(...result.notes);
  return { notes, botIds: result.botIds };
}

function parseSeedPayload(value: unknown): SeedResult {
  if (!isDynamicRecord(value)) throw new Error("seed payload missing");
  const rawNotes = Array.isArray(value.notes) ? value.notes : [];
  const rawIds = Array.isArray(value.botIds) ? value.botIds : [];
  return {
    notes: rawNotes.map(String),
    botIds: rawIds.map(String),
  };
}

/**
 * Backfill 7 days of usage + model split into the sandbox openbot.db so Usage charts are not empty.
 * Call after seedShotsData (needs real bot ids). Safe if tables are missing (no-op notes).
 */
export function seedUsageHistory(sandboxRoot: string, botIds: string[]): string[] {
  const notes: string[] = [];
  const dbPath = join(sandboxRoot, "home", "AppData", "Roaming", "COSGRAL Workspace Dev", "openbot.db");
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(dbPath);
  } catch (error) {
    return [`usage-history:open-failed:${String(error)}`];
  }
  try {
    const has = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projection_budget_usage'")
      .get();
    if (!has) {
      notes.push("usage-history:no-table");
      return notes;
    }
    const a = botIds[0] ?? "seed-a";
    const b = botIds[1] ?? a;
    const insertUsage = db.prepare(
      `INSERT INTO projection_budget_usage (day, agent_id, tokens, turns, cost_micro, priced_turns)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(day, agent_id) DO UPDATE SET
         tokens = tokens + excluded.tokens,
         turns = turns + excluded.turns,
         cost_micro = cost_micro + excluded.cost_micro,
         priced_turns = priced_turns + excluded.priced_turns`,
    );
    const insertDetail = db.prepare(
      `INSERT INTO projection_budget_usage_detail
         (day, agent_id, model, turns, input_tokens, cached_tokens, output_tokens, reasoning_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(day, agent_id, model) DO UPDATE SET
         turns = turns + excluded.turns,
         input_tokens = input_tokens + excluded.input_tokens,
         cached_tokens = cached_tokens + excluded.cached_tokens,
         output_tokens = output_tokens + excluded.output_tokens,
         reasoning_tokens = reasoning_tokens + excluded.reasoning_tokens`,
    );
    for (let ago = 6; ago >= 0; ago -= 1) {
      const day = dayOffset(ago);
      const tokensA = 800 + ago * 120;
      const tokensB = 500 + ago * 90;
      insertUsage.run(day, a, tokensA, 2, 0, 0);
      insertUsage.run(day, b, tokensB, 1, 0, 0);
      insertDetail.run(
        day,
        a,
        "luna",
        2,
        Math.floor(tokensA * 0.5),
        Math.floor(tokensA * 0.1),
        Math.floor(tokensA * 0.3),
        Math.floor(tokensA * 0.1),
      );
      insertDetail.run(
        day,
        b,
        "codex",
        1,
        Math.floor(tokensB * 0.6),
        0,
        Math.floor(tokensB * 0.3),
        Math.floor(tokensB * 0.1),
      );
    }
    notes.push("usage-history:7d×2models");
  } finally {
    db.close();
  }
  return notes;
}
