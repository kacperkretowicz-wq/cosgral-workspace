// COSGRAL W3: what a window may send to stop Computer Use.

import type { StopComputerUseInput } from "@openbot/contracts/ipc";
import { isObject, requireString } from "./validation";

export function parseStopComputerUse(value: unknown): StopComputerUseInput {
  if (value === null || value === undefined) return {};
  if (!isObject(value)) throw new Error("Stop details are required.");
  for (const key of Object.keys(value)) {
    if (key !== "botId") throw new Error(`Unknown field "${key}" in the Stop request.`);
  }
  return value.botId === undefined ? {} : { botId: requireString(value.botId, "botId") };
}
