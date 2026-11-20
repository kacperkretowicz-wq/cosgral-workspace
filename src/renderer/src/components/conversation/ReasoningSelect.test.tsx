import { fireEvent, render, screen } from "@solidjs/testing-library";
import { expect, it, vi } from "vitest";
import { ReasoningSelect } from "./ReasoningSelect";

it("lists the efforts with readable labels and reports the one that is chosen", () => {
  const onChange = vi.fn();
  render(() => (
    <ReasoningSelect
      value="medium"
      options={["low", "medium", "high", "xhigh"]}
      ariaLabel="Effort"
      onChange={onChange}
    />
  ));
  const select = screen.getByLabelText("Effort");
  expect(select).toHaveValue("medium");
  expect(screen.getByRole("option", { name: "Extra high" })).toBeInTheDocument();
  fireEvent.change(select, { target: { value: "high" } });
  expect(onChange).toHaveBeenCalledWith("high");
});

it("ignores a value that is not one of the options and can be disabled", () => {
  const onChange = vi.fn();
  render(() => <ReasoningSelect value="low" options={["low"]} ariaLabel="Effort" disabled onChange={onChange} />);
  expect(screen.getByLabelText("Effort")).toBeDisabled();
});
