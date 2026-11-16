// COSGRAL W9-BE1: the window API of the phone away from home. Answers are checked with the contract guards.

import {
  IPC_CHANNELS,
  isPhoneAccessState,
  isPhonePushTestResult,
  isPhoneTailscaleGuide,
  type PhoneAccessState,
  type PhoneDesktopApi,
  type PhonePushTestResult,
  type PhoneTailscaleGuide,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createPhoneApi(invoke: Invoke): PhoneDesktopApi {
  return {
    getState: () => invoke(IPC_CHANNELS.phoneGetState, null, decodeState),
    getTailscaleGuide: () => invoke(IPC_CHANNELS.phoneGetTailscaleGuide, null, decodeGuide),
    setPushEnabled: (input) => invoke(IPC_CHANNELS.phoneSetPushEnabled, input, decodeState),
    sendTestPush: (input) => invoke(IPC_CHANNELS.phoneSendTestPush, input, decodeTest),
  };
}

function decodeState(value: unknown): PhoneAccessState {
  if (!isPhoneAccessState(value)) throw new Error("Invalid phone access state.");
  return value;
}

function decodeGuide(value: unknown): PhoneTailscaleGuide {
  if (!isPhoneTailscaleGuide(value)) throw new Error("Invalid Tailscale guide.");
  return value;
}

function decodeTest(value: unknown): PhonePushTestResult {
  if (!isPhonePushTestResult(value)) throw new Error("Invalid push test result.");
  return value;
}
