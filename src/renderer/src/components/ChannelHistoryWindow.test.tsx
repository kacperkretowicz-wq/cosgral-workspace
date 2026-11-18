import { cleanup, fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import { ChannelHistoryWindowSetting } from "./ChannelHistoryWindow";

afterEach(() => {
  cleanup();
  setLanguage("en");
});

it("offers 20, 50, 100 and 200 and shows 200 when nothing is saved", async () => {
  render(() => <ChannelHistoryWindowSetting onChange={vi.fn()} />);
  const select = await screen.findByRole("combobox", { name: "History window" });
  expect(select).toHaveValue("200");
  const values = Array.from(select.querySelectorAll("option")).map((option) => option.value);
  expect(values).toEqual(["20", "50", "100", "200"]);
});

it("shows the saved value, saves a change as a number and says so", async () => {
  const onChange = vi.fn().mockResolvedValue(undefined);
  render(() => <ChannelHistoryWindowSetting value={50} onChange={onChange} />);
  const select = await screen.findByRole("combobox", { name: "History window" });
  expect(select).toHaveValue("50");
  fireEvent.change(select, { target: { value: "20" } });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("History window saved."));
  expect(onChange).toHaveBeenCalledWith(20);
});

it("shows the sentence of the program when saving fails", async () => {
  const onChange = vi.fn().mockRejectedValue(new Error("historyWindow is 20, 50, 100 or 200."));
  render(() => <ChannelHistoryWindowSetting value={100} onChange={onChange} />);
  fireEvent.change(await screen.findByRole("combobox", { name: "History window" }), { target: { value: "20" } });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("historyWindow is 20, 50, 100 or 200."));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("speaks Polish", async () => {
  setLanguage("pl");
  render(() => <ChannelHistoryWindowSetting value={20} onChange={vi.fn()} />);
  expect(await screen.findByRole("combobox", { name: "Okno historii" })).toHaveValue("20");
  expect(screen.getByRole("option", { name: "Ostatnie 50 wiadomości" })).toBeInTheDocument();
});
