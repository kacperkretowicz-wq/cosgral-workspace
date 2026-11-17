import type { ManagedCliState } from "@openbot/contracts/ipc";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { language, setLanguage } from "../i18n";
import { cliPathError, ManagedCliCard, ManagedCliSection, safeCliError } from "./ManagedCliSection";

const emptyCli: ManagedCliState = {
  id: "codex",
  source: "none",
  executable: null,
  version: null,
  managedVersion: null,
  pinnedVersion: null,
  latestVersion: null,
  autoUpdate: true,
  customPath: null,
  phase: "idle",
  progress: null,
  error: null,
  checkedAt: null,
};
describe("managed CLI controls", () => {
  it("validates paths and hides profile paths in errors", () => {
    expect(cliPathError("relative.exe")).toBeTruthy();
    expect(cliPathError("C:\\Tools\\codex.exe")).toBe("");
    expect(safeCliError("Failed C:\\Users\\Example\\cli.exe")).not.toContain("Example");
  });
  it("drops the technical IPC prefix and keeps the reason", () => {
    const raw =
      "Error: Error invoking remote method 'subscriptions:set-cli-settings': Error: No file at that path. Choose the CLI's executable.";
    expect(safeCliError(raw)).toBe("No file at that path. Choose the CLI's executable.");
    expect(safeCliError("Plain reason")).toBe("Plain reason");
  });
  it("offers install, never removal for a system CLI", () => {
    render(() => <ManagedCliCard state={{ ...emptyCli, source: "system" }} onAction={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });
  it("sends install", async () => {
    const action = vi.fn();
    render(() => <ManagedCliCard state={emptyCli} onAction={action} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(action).toHaveBeenCalledWith("installCli", { id: "codex" });
  });
});

it("locks actions and shows byte progress during download", () => {
  render(() => (
    <ManagedCliCard
      state={{ ...emptyCli, phase: "downloading", progress: { receivedBytes: 50, totalBytes: 100 } }}
      onAction={vi.fn()}
    />
  ));
  expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
});
it("validates a custom path and sends clear and pin settings", async () => {
  const action = vi.fn();
  render(() => (
    <ManagedCliCard
      state={{ ...emptyCli, source: "custom", customPath: "C:\\Tools\\codex.exe", pinnedVersion: "1.0" }}
      onAction={action}
    />
  ));
  fireEvent.click(screen.getByRole("button", { name: "Clear path" }));
  expect(action).toHaveBeenCalledWith("setCliSettings", { id: "codex", customPath: null });
  fireEvent.click(screen.getByRole("button", { name: "Unpin" }));
  expect(action).toHaveBeenCalledWith("pinCli", { id: "codex", version: null });
  fireEvent.input(screen.getByLabelText("Custom path to the CLI"), { target: { value: "relative" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Save path" })).toBeDisabled());
});
it("shows readable errors without exposing profile paths", () => {
  render(() => (
    <ManagedCliCard
      state={{ ...emptyCli, phase: "error", error: "Failed C:\\Users\\PrivateName\\cli.exe" }}
      onAction={vi.fn()}
    />
  ));
  expect(screen.getByRole("alert")).not.toHaveTextContent("PrivateName");
  expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
});

afterEach(() => vi.unstubAllGlobals());
it("loads the selected provider and continues after successful install", async () => {
  const ready = vi.fn();
  const installCli = vi
    .fn()
    .mockResolvedValue({ ...emptyCli, source: "managed", managedVersion: "1.0", version: "1.0" });
  vi.stubGlobal("openbot", {
    subscriptions: { listCli: async () => [emptyCli], installCli },
    agent: { onEvent: () => () => {} },
  });
  render(() => <ManagedCliSection provider="codex" onReady={ready} />);
  fireEvent.click(await screen.findByRole("button", { name: "Download and continue" }));
  await waitFor(() => expect(ready).toHaveBeenCalledOnce());
  expect(installCli).toHaveBeenCalledWith({ id: "codex" });
});
it("shows an event from the engine while the install promise is pending", async () => {
  let emit: (event: import("@openbot/contracts/ipc").AgentEvent) => void = () => {};
  vi.stubGlobal("openbot", {
    subscriptions: { listCli: async () => [emptyCli] },
    agent: {
      onEvent: (listener: typeof emit) => {
        emit = listener;
        return () => {};
      },
    },
  });
  render(() => <ManagedCliSection />);
  await screen.findByRole("button", { name: "Download" });
  emit({ type: "managed-cli-changed", state: { ...emptyCli, phase: "verifying" } });
  await screen.findByText("Verifying SHA-256");
  expect(screen.getByRole("button", { name: "Download" })).toBeDisabled();
});

it("keeps the Polish labels when the language is Polish", async () => {
  setLanguage("pl");
  await waitFor(() => expect(language()).toBe("pl"));
  render(() => <ManagedCliCard state={{ ...emptyCli, source: "managed", managedVersion: "1.0" }} onAction={vi.fn()} />);
  for (const name of ["Pobierz", "Sprawdź", "Aktualizuj", "Usuń", "Przypnij", "Odepnij", "Zapisz ścieżkę"]) {
    expect(screen.getByRole("button", { name })).toBeInTheDocument();
  }
  expect(screen.getByText("Pobrane")).toBeInTheDocument();
  setLanguage("en");
  await waitFor(() => expect(language()).toBe("en"));
});
