// COSGRAL W3: what a window may send to remote desktop. Unknown fields are refused.

import {
  type ConnectRemoteDesktopInput,
  type EnableRemoteDesktopInput,
  isRemoteDesktopInput,
  REMOTE_DESKTOP_EXPOSURES,
  REMOTE_DESKTOP_MODES,
  REMOTE_DESKTOP_PEER_POLICIES,
  type RemoteDesktopInput,
  type RemoteDesktopPeerInput,
  type SetRemoteDesktopPeerPolicyInput,
  type SetRemoteDesktopSessionModeInput,
  type StopRemoteDesktopInput,
} from "@openbot/contracts/ipc";
import { type DynamicRecord, isNumber, isOneOf, isString } from "@openbot/contracts/runtime-values";
import { isObject, requireString } from "./validation";

const ADDRESS_LIMIT = 200;
const TOKEN_LIMIT = 200;

function fields(value: unknown, allowed: readonly string[], what: string): DynamicRecord {
  if (!isObject(value)) throw new Error(`${what} details are required.`);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unknown field "${key}" in the ${what} request.`);
  }
  return value;
}

export function parseEnableRemoteDesktop(value: unknown): EnableRemoteDesktopInput {
  if (value === null || value === undefined) return {};
  const input = fields(value, ["exposure", "port", "approvalBotId"], "sharing");
  const result: EnableRemoteDesktopInput = {};
  if (input.exposure !== undefined) {
    if (!isOneOf(REMOTE_DESKTOP_EXPOSURES, input.exposure)) {
      throw new Error(`exposure must be one of: ${REMOTE_DESKTOP_EXPOSURES.join(", ")}.`);
    }
    result.exposure = input.exposure;
  }
  if (input.port !== undefined) {
    if (!isNumber(input.port) || !Number.isInteger(input.port) || input.port < 0 || input.port > 65_535) {
      throw new Error("port must be a whole number from 0 to 65535.");
    }
    result.port = input.port;
  }
  if (input.approvalBotId !== undefined) {
    result.approvalBotId = input.approvalBotId === null ? null : requireString(input.approvalBotId, "approvalBotId");
  }
  return result;
}

export function parseSetRemoteDesktopPeerPolicy(value: unknown): SetRemoteDesktopPeerPolicyInput {
  const input = fields(value, ["peerId", "policy"], "viewer policy");
  if (!isOneOf(REMOTE_DESKTOP_PEER_POLICIES, input.policy)) {
    throw new Error(`policy must be one of: ${REMOTE_DESKTOP_PEER_POLICIES.join(", ")}.`);
  }
  return { peerId: requireString(input.peerId, "peerId"), policy: input.policy };
}

export function parseRemoteDesktopPeer(value: unknown): RemoteDesktopPeerInput {
  return { peerId: requireString(fields(value, ["peerId"], "viewer").peerId, "peerId") };
}

export function parseSetRemoteDesktopSessionMode(value: unknown): SetRemoteDesktopSessionModeInput {
  const input = fields(value, ["sessionId", "mode"], "session mode");
  if (!isOneOf(REMOTE_DESKTOP_MODES, input.mode)) {
    throw new Error(`mode must be one of: ${REMOTE_DESKTOP_MODES.join(", ")}.`);
  }
  return { sessionId: requireString(input.sessionId, "sessionId"), mode: input.mode };
}

export function parseStopRemoteDesktop(value: unknown): StopRemoteDesktopInput {
  if (value === null || value === undefined) return {};
  const input = fields(value, ["sessionId"], "Stop");
  return input.sessionId === undefined ? {} : { sessionId: requireString(input.sessionId, "sessionId") };
}

export function parseConnectRemoteDesktop(value: unknown): ConnectRemoteDesktopInput {
  const input = fields(value, ["address", "token", "mode", "label"], "connection");
  if (!isOneOf(REMOTE_DESKTOP_MODES, input.mode)) {
    throw new Error(`mode must be one of: ${REMOTE_DESKTOP_MODES.join(", ")}.`);
  }
  const result: ConnectRemoteDesktopInput = {
    address: requireString(input.address, "address", ADDRESS_LIMIT),
    token: requireString(input.token, "token", TOKEN_LIMIT),
    mode: input.mode,
  };
  if (input.label !== undefined) {
    if (!isString(input.label)) throw new Error("label must be text.");
    result.label = input.label;
  }
  return result;
}

export function parseRemoteDesktopInput(value: unknown): RemoteDesktopInput {
  if (!isRemoteDesktopInput(value)) throw new Error("That is not a valid input for the other computer.");
  return value;
}
