import type { AccountError } from "@openbot/contracts/ipc";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import { AccountErrorCard } from "./AccountErrorCard";
import { addAccountNotice } from "./account-usage-view";

const network: AccountError = {
  botId: "chief",
  provider: "codex",
  accountId: "demo",
  accountLabel: "Work",
  reason: "network-error",
  message: "Network error on Work. The account was not counted as at its limit; nothing was switched.",
};
it("shows a calm dismissible network message without quota or continuation wording", async () => {
  const dismiss = vi.fn();
  render(() => <AccountErrorCard view={network} onDismiss={dismiss} />);
  const card = screen.getByRole("status", { name: "Network error for Work" });
  expect(card).toHaveAttribute("aria-live", "polite");
  expect(card).not.toHaveTextContent(/limit|continue/i);
  expect(card).toHaveTextContent("Your account stayed selected.");
  await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(dismiss).toHaveBeenCalledOnce();
});
it("stores the network notice under its agent without dropping other agent notices", () => {
  const notices = addAccountNotice(
    addAccountNotice([], { ...network, type: "account-error", botId: "other" }, "other"),
    { ...network, type: "account-error" },
    "chief",
  );
  expect(notices.map((n) => [n.id, n.kind, n.botId])).toEqual([
    ["chief", "error", "chief"],
    ["other", "error", "other"],
  ]);
});
