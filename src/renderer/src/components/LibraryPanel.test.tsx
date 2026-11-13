import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import { LibraryItems } from "./LibraryPanel";

describe("LibraryItems", () => {
  it("allows a listed file to be attached", async () => {
    const attach = vi.fn();
    render(() => (
      <LibraryItems
        items={[
          {
            id: "f",
            name: "brief.txt",
            size: 5,
            kind: "file",
            mimeType: "text/plain",
            previewKind: "text",
            previewUrl: null,
            origin: "agent",
            createdAt: "",
            createdByBotId: null,
            messageId: null,
          },
        ]}
        onAttach={attach}
        onDelete={vi.fn()}
        onOpen={vi.fn()}
      />
    ));
    expect(screen.getByText(/agent/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(attach).toHaveBeenCalledWith("f");
  });
});
