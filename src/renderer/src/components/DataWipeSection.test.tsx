import type { DataWipePlan } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataWipeSection } from "./DataWipeSection";

afterEach(() => vi.unstubAllGlobals());

const PLAN: DataWipePlan = {
  removes: [
    { label: "Program data: database, settings, secrets, browser profile, logs", path: "C:\\data\\COSGRAL Workspace" },
    { label: "Agents' folder: agent workspaces and shared files", path: "C:\\home\\COSGRAL Workspace" },
  ],
  keeps: [
    { label: "Codex and Claude CLI sign-ins (kept in their own folders)", path: null },
    { label: "Data of the regular OpenBot app", path: "C:\\data\\OpenBot" },
  ],
  confirmationWord: "DELETE",
};

describe("Delete my data", () => {
  it("lists what goes and what stays, and asks for the word before it deletes", async () => {
    const requestWipe = vi.fn().mockResolvedValue({ status: "restarting" });
    vi.stubGlobal("openbot", { appData: { describeWipe: vi.fn().mockResolvedValue(PLAN), requestWipe } });
    render(() => <DataWipeSection />);

    await fireEvent.click(screen.getByRole("button", { name: "Delete my data…" }));
    expect(await screen.findByText(/Program data: database/)).toBeInTheDocument();
    expect(screen.getByText("C:\\home\\COSGRAL Workspace")).toBeInTheDocument();
    expect(screen.getByText(/Codex and Claude CLI sign-ins/)).toBeInTheDocument();
    expect(screen.getByText(/regular OpenBot app/)).toBeInTheDocument();

    const confirm = screen.getByRole("button", { name: "Delete and restart" });
    expect(confirm).toBeDisabled();
    await fireEvent.input(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "delete" } });
    expect(confirm).toBeDisabled();
    await fireEvent.input(screen.getByLabelText("Type DELETE to confirm"), { target: { value: "DELETE" } });
    expect(confirm).toBeEnabled();
    await fireEvent.click(confirm);
    expect(requestWipe).toHaveBeenCalledWith({ confirmation: "DELETE" });
    expect(await screen.findByRole("status")).toHaveTextContent(/restarting/i);
  });

  it("can be cancelled without deleting anything", async () => {
    const requestWipe = vi.fn();
    vi.stubGlobal("openbot", { appData: { describeWipe: vi.fn().mockResolvedValue(PLAN), requestWipe } });
    render(() => <DataWipeSection />);
    await fireEvent.click(screen.getByRole("button", { name: "Delete my data…" }));
    await fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("button", { name: "Delete and restart" })).not.toBeInTheDocument();
    expect(requestWipe).not.toHaveBeenCalled();
  });

  it("is hidden where the program has no such action (a remote server)", () => {
    vi.stubGlobal("openbot", {});
    render(() => <DataWipeSection />);
    expect(screen.queryByRole("button", { name: "Delete my data…" })).not.toBeInTheDocument();
  });
});
