// COSGRAL W4-BE5: "Delete my data" (this computer only). The window shows what will be deleted and what is never
// touched, the person types the confirmation word, the program stops its agents and restarts; the next start removes
// the data before anything opens it and starts like the first time.

import { isDynamicRecord, isString } from "./runtime-values";

/** The word the person types to confirm. */
export const DATA_WIPE_CONFIRMATION = "DELETE";

export interface DataWipeItem {
  label: string;
  /** The folder on this computer; null when it is a description only (for example "CLI sign-ins"). */
  path: string | null;
}

export interface DataWipePlan {
  removes: DataWipeItem[];
  keeps: DataWipeItem[];
  confirmationWord: typeof DATA_WIPE_CONFIRMATION;
}

export interface RequestDataWipeInput {
  confirmation: string;
}

export interface DataWipeRequestResult {
  /** The program stops its agents and restarts now. */
  status: "restarting";
}

export interface AppDataDesktopApi {
  describeWipe: () => Promise<DataWipePlan>;
  requestWipe: (input: RequestDataWipeInput) => Promise<DataWipeRequestResult>;
}

function isItem(value: unknown): value is DataWipeItem {
  return isDynamicRecord(value) && isString(value.label) && (value.path === null || isString(value.path));
}

export function isDataWipePlan(value: unknown): value is DataWipePlan {
  return (
    isDynamicRecord(value) &&
    Array.isArray(value.removes) &&
    value.removes.every(isItem) &&
    Array.isArray(value.keeps) &&
    value.keeps.every(isItem) &&
    value.confirmationWord === DATA_WIPE_CONFIRMATION
  );
}

export function isDataWipeRequestResult(value: unknown): value is DataWipeRequestResult {
  return isDynamicRecord(value) && value.status === "restarting";
}

export function parseRequestDataWipe(value: unknown): RequestDataWipeInput {
  if (!isDynamicRecord(value) || value.confirmation !== DATA_WIPE_CONFIRMATION)
    throw new Error(`Type ${DATA_WIPE_CONFIRMATION} to confirm.`);
  return { confirmation: DATA_WIPE_CONFIRMATION };
}
