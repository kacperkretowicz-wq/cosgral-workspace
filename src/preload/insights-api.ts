// COSGRAL W12 (BE-H): the window APIs of the library page, the usage report and the schedule. Answers are checked with the contract guards.

import {
  type DeleteLibraryFilesResult,
  IPC_CHANNELS,
  isDeleteLibraryFilesResult,
  isLibraryCleanupResult,
  isLibraryPage,
  isScheduleFeed,
  isScheduleView,
  isUsageReport,
  type LibraryCleanupResult,
  type LibraryPage,
  type LibraryViewDesktopApi,
  type ScheduleDesktopApi,
  type ScheduleFeedItem,
  type ScheduleView,
  type UsageReport,
  type UsageReportDesktopApi,
} from "@openbot/contracts/ipc";

type Invoke = <TResult>(channel: string, payload: unknown, decoder: (value: unknown) => TResult) => Promise<TResult>;

export function createLibraryViewApi(invoke: Invoke): LibraryViewDesktopApi {
  return {
    page: (input) => invoke(IPC_CHANNELS.libraryViewPage, input ?? {}, decodePage),
    deleteMany: (input) => invoke(IPC_CHANNELS.libraryViewDeleteMany, input, decodeDeleted),
    cleanup: (input) => invoke(IPC_CHANNELS.libraryViewCleanup, input, decodeCleanup),
  };
}

export function createUsageReportApi(invoke: Invoke): UsageReportDesktopApi {
  return { get: (input) => invoke(IPC_CHANNELS.usageReportGet, input, decodeUsage) };
}

export function createScheduleApi(invoke: Invoke): ScheduleDesktopApi {
  return {
    view: (input) => invoke(IPC_CHANNELS.scheduleView, input, decodeView),
    feed: (input) => invoke(IPC_CHANNELS.scheduleFeed, input ?? {}, decodeFeed),
  };
}

function decodePage(value: unknown): LibraryPage {
  if (!isLibraryPage(value)) throw new Error("Invalid library page.");
  return value;
}

function decodeDeleted(value: unknown): DeleteLibraryFilesResult {
  if (!isDeleteLibraryFilesResult(value)) throw new Error("Invalid delete result.");
  return value;
}

function decodeCleanup(value: unknown): LibraryCleanupResult {
  if (!isLibraryCleanupResult(value)) throw new Error("Invalid clean-up result.");
  return value;
}

function decodeUsage(value: unknown): UsageReport {
  if (!isUsageReport(value)) throw new Error("Invalid usage report.");
  return value;
}

function decodeView(value: unknown): ScheduleView {
  if (!isScheduleView(value)) throw new Error("Invalid schedule.");
  return value;
}

function decodeFeed(value: unknown): ScheduleFeedItem[] {
  if (!isScheduleFeed(value)) throw new Error("Invalid schedule feed.");
  return value;
}
