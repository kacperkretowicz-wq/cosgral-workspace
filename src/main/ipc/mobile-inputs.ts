// COSGRAL W3: what a window may send for Mobile Connect (see ipc-mobile.ts).

import { MOBILE_EXPOSURES, type MobileDeviceIdInput, type StartMobilePairingInput } from "@openbot/contracts/ipc";
import { type DynamicRecord, isNumber, isOneOf } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

export function parseStartMobilePairing(value: unknown): StartMobilePairingInput {
  if (value === null || value === undefined) return {};
  const input = record(value);
  const parsed: StartMobilePairingInput = {};
  if (input.exposure !== undefined && input.exposure !== null) {
    if (!isOneOf(MOBILE_EXPOSURES, input.exposure)) throw new Error('exposure is "loopback" or "lan".');
    parsed.exposure = input.exposure;
  }
  if (input.port !== undefined && input.port !== null) {
    if (!isNumber(input.port) || !Number.isInteger(input.port)) throw new Error("port must be a whole number.");
    parsed.port = input.port;
  }
  return parsed;
}

export function parseMobileDeviceId(value: unknown): MobileDeviceIdInput {
  return { deviceId: requireString(record(value).deviceId, "deviceId") };
}

function record(value: unknown): DynamicRecord {
  if (!isObject(value)) throw new Error("Expected an object.");
  return value;
}
