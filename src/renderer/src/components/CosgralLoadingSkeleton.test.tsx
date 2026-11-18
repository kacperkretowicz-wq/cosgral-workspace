import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vitest";
import { CosgralLoadingSkeleton } from "./CosgralLoadingSkeleton";

describe("CosgralLoadingSkeleton", () => {
  it("exposes the label as an accessible status, not bare Loading text", () => {
    render(() => <CosgralLoadingSkeleton label="Loading usage…" />);
    const status = screen.getByRole("status", { name: "Loading usage…" });
    expect(status).toBeInTheDocument();
    expect(status.querySelectorAll(".cosgral-skeleton").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText("Loading usage…")).not.toBeInTheDocument();
  });
});
