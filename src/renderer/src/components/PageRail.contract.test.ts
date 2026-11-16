import { APP_PAGE_IDS } from "@openbot/contracts/ipc";
import { describe, expect, it } from "vitest";
import { PAGE_RAIL_ITEMS } from "./PageRail";

describe("page rail ids", () => {
  it("the contract (AppSettings.navigation) lists exactly the pages of the rail, in rail order", () => {
    expect(PAGE_RAIL_ITEMS.map((item) => item.id)).toEqual([...APP_PAGE_IDS]);
  });
});
