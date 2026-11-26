import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { JoinServerDialog } from "./JoinServerDialog";

describe("JoinServerDialog", () => {
  it("joins with the signed-in account when there is an account service", async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    render(() => (
      <JoinServerDialog
        inviteUrl="cosgral://join?x=1"
        accountEmail="me@example.com"
        onClose={vi.fn()}
        onJoin={onJoin}
      />
    ));
    expect(screen.queryByLabelText(/Your password on this server/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Join server" }));
    await waitFor(() => expect(onJoin).toHaveBeenCalledWith({ inviteUrl: "cosgral://join?x=1" }));
  });

  it("asks for a name and a password with the local profile, and waits until both are valid", async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    render(() => (
      <JoinServerDialog
        inviteUrl="cosgral://join?x=1"
        accountEmail="owner@cosgral.local"
        localProfile
        onClose={vi.fn()}
        onJoin={onJoin}
      />
    ));
    const join = screen.getByRole("button", { name: "Join server" });
    expect(join).toBeDisabled();
    fireEvent.input(screen.getByLabelText(/Your name on this server/), { target: { value: "kuba" } });
    fireEvent.input(screen.getByLabelText(/Your password on this server/), { target: { value: "krotkie" } });
    await waitFor(() => expect(join).toBeDisabled());
    fireEvent.input(screen.getByLabelText(/Your password on this server/), {
      target: { value: "bardzo-dlugie-haslo-1" },
    });
    await waitFor(() => expect(join).toBeEnabled());
    fireEvent.click(join);
    await waitFor(() =>
      expect(onJoin).toHaveBeenCalledWith({
        inviteUrl: "cosgral://join?x=1",
        username: "kuba",
        password: "bardzo-dlugie-haslo-1",
      }),
    );
  });

  it("takes a pasted address update link without a name and a password", async () => {
    const onJoin = vi.fn().mockResolvedValue(undefined);
    render(() => (
      <JoinServerDialog
        inviteUrl="cosgral://update?api=x"
        accountEmail="owner@cosgral.local"
        localProfile
        onClose={vi.fn()}
        onJoin={onJoin}
      />
    ));
    expect(screen.queryByLabelText(/Your password on this server/)).toBeNull();
    const update = screen.getByRole("button", { name: "Update the address" });
    expect(update).toBeEnabled();
    fireEvent.click(update);
    await waitFor(() => expect(onJoin).toHaveBeenCalledWith({ inviteUrl: "cosgral://update?api=x" }));
  });
});
