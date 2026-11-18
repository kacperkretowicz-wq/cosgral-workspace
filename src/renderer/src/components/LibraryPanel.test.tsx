import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryItems, LibraryPanel } from "./LibraryPanel";

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

afterEach(() => vi.unstubAllGlobals());
it("downloads and reveals through the existing API and exposes failures", async () => {
  const item = {
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
  };
  const open = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("openbot", { library: { list: async () => [item], open }, agent: { onEvent: () => () => {} } });
  render(() => <LibraryPanel />);
  await fireEvent.click(await screen.findByRole("button", { name: "Download" }));
  await waitFor(() => expect(open).toHaveBeenCalledWith({ fileId: "f", action: "download" }));
  open.mockRejectedValueOnce(new Error("Nie można pokazać pliku."));
  await fireEvent.click(screen.getByRole("button", { name: "Show in folder" }));
  await waitFor(() => expect(open).toHaveBeenCalledWith({ fileId: "f", action: "reveal" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Nie można pokazać pliku.");
});
