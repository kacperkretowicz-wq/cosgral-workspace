import { render, screen } from "@solidjs/testing-library";
import { expect, it } from "vitest";
import { FallbackModelBadge } from "./FallbackModelBadge";

it("shows the actual fallback and hides the badge after reset", () => {
  const view = render(() => <FallbackModelBadge bot={{ model: "gpt-5.6-luna", activeModel: "gpt-5.6-terra" }} />);
  expect(screen.getByRole("status")).toHaveTextContent("fallback model: gpt-5.6-terra");
  view.unmount();
  render(() => <FallbackModelBadge bot={{ model: "gpt-5.6-luna", activeModel: "gpt-5.6-luna" }} />);
  expect(screen.queryByRole("status")).toBeNull();
});
