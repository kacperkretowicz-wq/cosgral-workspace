// COSGRAL W3: what a window may send to the dock and the island. Unknown fields are refused.

import {
  DOCK_LIMITS,
  DOCK_SIZES,
  type DockAgentInput,
  isIslandRequestRef,
  type OpenDockChatInput,
  type PinDockAgentInput,
  type ReorderDockInput,
  type SetDockPinHiddenInput,
  type SetDockSizeInput,
  type SetDockVisibleInput,
  type SetIslandEnabledInput,
  type ShowMainWindowInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isBoolean, isNumber, isOneOf } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

function fields(value: unknown, allowed: readonly string[], what: string): DynamicRecord {
  if (!isObject(value)) throw new Error(`${what} details are required.`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unknown field "${key}" in the ${what} request.`);
  }
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (!isBoolean(value)) throw new Error(`${field} must be true or false.`);
  return value;
}

export function parsePinDockAgent(value: unknown): PinDockAgentInput {
  const input = fields(value, ["botId", "index"], "pin");
  const botId = requireString(input.botId, "botId");
  if (input.index === undefined) return { botId };
  if (!isNumber(input.index) || !Number.isInteger(input.index) || input.index < 0) {
    throw new Error("index must be a whole number from 0.");
  }
  return { botId, index: input.index };
}

export function parseDockAgent(value: unknown): DockAgentInput {
  return { botId: requireString(fields(value, ["botId"], "dock").botId, "botId") };
}

export function parseReorderDock(value: unknown): ReorderDockInput {
  const input = fields(value, ["botIds"], "reorder");
  if (!Array.isArray(input.botIds) || input.botIds.length > DOCK_LIMITS.pins) {
    throw new Error(`botIds must list at most ${DOCK_LIMITS.pins} agents.`);
  }
  return { botIds: input.botIds.map((botId) => requireString(botId, "botId")) };
}

export function parseSetDockPinHidden(value: unknown): SetDockPinHiddenInput {
  const input = fields(value, ["botId", "hidden"], "hide");
  return { botId: requireString(input.botId, "botId"), hidden: requireBoolean(input.hidden, "hidden") };
}

export function parseSetDockSize(value: unknown): SetDockSizeInput {
  const input = fields(value, ["size"], "size");
  if (!isOneOf(DOCK_SIZES, input.size)) throw new Error(`size must be one of: ${DOCK_SIZES.join(", ")}.`);
  return { size: input.size };
}

export function parseSetDockVisible(value: unknown): SetDockVisibleInput {
  return { visible: requireBoolean(fields(value, ["visible"], "dock").visible, "visible") };
}

export function parseOpenDockChat(value: unknown): OpenDockChatInput {
  const input = fields(value, ["botId"], "chat");
  return { botId: input.botId === null ? null : requireString(input.botId, "botId") };
}

export function parseShowMainWindow(value: unknown): ShowMainWindowInput {
  if (value === null || value === undefined) return {};
  const input = fields(value, ["botId", "request"], "window");
  const result: ShowMainWindowInput = {};
  if (input.botId !== undefined) result.botId = requireString(input.botId, "botId");
  if (input.request !== undefined) {
    if (!result.botId) throw new Error("A card needs its botId.");
    if (!isIslandRequestRef(input.request)) throw new Error("request is not a Needs you card.");
    result.request = { kind: input.request.kind, requestId: input.request.requestId };
  }
  return result;
}

export function parseSetIslandEnabled(value: unknown): SetIslandEnabledInput {
  return { enabled: requireBoolean(fields(value, ["enabled"], "island").enabled, "enabled") };
}
